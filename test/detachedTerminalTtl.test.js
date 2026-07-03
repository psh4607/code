const assert = require('node:assert/strict');
const test = require('node:test');
const {
  createDetachedTerminalTtlManager,
  collectDescendantPids,
} = require('../src/detachedTerminalTtl');

function createMemoryStorage(initialRecords = []) {
  let records = initialRecords;
  return {
    async getRecords() {
      return records;
    },
    async setRecords(nextRecords) {
      records = nextRecords;
    },
    snapshot() {
      return records;
    },
  };
}

function createFakeVscode({ activeTerminal } = {}) {
  const executedCommands = [];
  const warnings = [];
  const openedListeners = [];

  return {
    executedCommands,
    warnings,
    openedListeners,
    vscode: {
      commands: {
        async executeCommand(command) {
          executedCommands.push(command);
        },
      },
      window: {
        activeTerminal,
        onDidOpenTerminal(listener) {
          openedListeners.push(listener);
          return {
            dispose() {
              const index = openedListeners.indexOf(listener);
              if (index !== -1) {
                openedListeners.splice(index, 1);
              }
            },
          };
        },
        showWarningMessage(message) {
          warnings.push(message);
        },
      },
    },
  };
}

function terminalWithPid(pid, title = 'zsh') {
  return {
    name: title,
    processId: Promise.resolve(pid),
  };
}

test('detach command records the active terminal pid with a one hour expiry', async () => {
  const storage = createMemoryStorage();
  const fake = createFakeVscode({ activeTerminal: terminalWithPid(1234, 'work') });
  const manager = createDetachedTerminalTtlManager(fake.vscode, {
    storage,
    now: () => 1000,
    startTimers: false,
  });

  await manager.detachActiveTerminal();

  assert.deepEqual(fake.executedCommands, ['workbench.action.terminal.detachSession']);
  assert.deepEqual(storage.snapshot(), [
    {
      pid: 1234,
      detachedAt: 1000,
      expiresAt: 3601000,
      title: 'work',
    },
  ]);
  assert.deepEqual(fake.warnings, []);
});

test('attach command removes the reattached terminal pid from the ttl registry', async () => {
  const storage = createMemoryStorage([
    {
      pid: 2222,
      detachedAt: 1000,
      expiresAt: 3601000,
      title: 'old',
    },
  ]);
  const activeTerminal = terminalWithPid(2222, 'reattached');
  const fake = createFakeVscode({ activeTerminal });
  const manager = createDetachedTerminalTtlManager(fake.vscode, {
    storage,
    now: () => 2000,
    startTimers: false,
  });

  await manager.attachDetachedTerminal();

  assert.deepEqual(fake.executedCommands, ['workbench.action.terminal.attachToSession']);
  assert.deepEqual(storage.snapshot(), []);
});

test('opened terminal listener removes matching tracked pid', async () => {
  const storage = createMemoryStorage([
    {
      pid: 3333,
      detachedAt: 1000,
      expiresAt: 3601000,
      title: 'old',
    },
  ]);
  const fake = createFakeVscode();
  const manager = createDetachedTerminalTtlManager(fake.vscode, {
    storage,
    now: () => 2000,
    startTimers: false,
  });

  manager.start();
  await fake.openedListeners[0](terminalWithPid(3333, 'opened'));

  assert.deepEqual(storage.snapshot(), []);
  manager.dispose();
});

test('sweepExpired kills only expired records and keeps fresh records', async () => {
  const storage = createMemoryStorage([
    {
      pid: 4444,
      detachedAt: 1000,
      expiresAt: 2000,
      title: 'expired',
    },
    {
      pid: 5555,
      detachedAt: 2000,
      expiresAt: 8000,
      title: 'fresh',
    },
  ]);
  const killed = [];
  const manager = createDetachedTerminalTtlManager(createFakeVscode().vscode, {
    storage,
    now: () => 3000,
    startTimers: false,
    async killTree(pid) {
      killed.push(pid);
      return true;
    },
  });

  await manager.sweepExpired();

  assert.deepEqual(killed, [4444]);
  assert.deepEqual(storage.snapshot(), [
    {
      pid: 5555,
      detachedAt: 2000,
      expiresAt: 8000,
      title: 'fresh',
    },
  ]);
});

test('killAllTracked kills every recorded pid and clears successful records', async () => {
  const storage = createMemoryStorage([
    {
      pid: 6666,
      detachedAt: 1000,
      expiresAt: 2000,
      title: 'one',
    },
    {
      pid: 7777,
      detachedAt: 1000,
      expiresAt: 2000,
      title: 'two',
    },
  ]);
  const killed = [];
  const manager = createDetachedTerminalTtlManager(createFakeVscode().vscode, {
    storage,
    now: () => 3000,
    startTimers: false,
    async killTree(pid) {
      killed.push(pid);
      return true;
    },
  });

  await manager.killAllTracked();

  assert.deepEqual(killed, [6666, 7777]);
  assert.deepEqual(storage.snapshot(), []);
});

test('killAllTerminalState disposes open terminals and kills tracked pids', async () => {
  const storage = createMemoryStorage([
    {
      pid: 8888,
      detachedAt: 1000,
      expiresAt: 2000,
      title: 'tracked',
    },
  ]);
  const disposed = [];
  const fake = createFakeVscode();
  fake.vscode.window.terminals = [
    {
      dispose() {
        disposed.push('first');
      },
    },
    {
      dispose() {
        disposed.push('second');
      },
    },
  ];
  const killed = [];
  const manager = createDetachedTerminalTtlManager(fake.vscode, {
    storage,
    now: () => 3000,
    startTimers: false,
    async killTree(pid) {
      killed.push(pid);
      return true;
    },
  });

  await manager.killAllTerminalState();

  assert.deepEqual(disposed, ['first', 'second']);
  assert.deepEqual(killed, [8888]);
  assert.deepEqual(storage.snapshot(), []);
});

test('stopForExtensionShutdown preserves open terminals and tracked detached pids', async () => {
  const storage = createMemoryStorage([
    {
      pid: 9999,
      detachedAt: 1000,
      expiresAt: 8000,
      title: 'tracked',
    },
  ]);
  const disposed = [];
  const fake = createFakeVscode();
  fake.vscode.window.terminals = [
    {
      dispose() {
        disposed.push('first');
      },
    },
  ];
  const killed = [];
  const manager = createDetachedTerminalTtlManager(fake.vscode, {
    storage,
    now: () => 3000,
    startTimers: false,
    async killTree(pid) {
      killed.push(pid);
      return true;
    },
  });

  manager.start();
  assert.equal(fake.openedListeners.length, 1);

  await manager.stopForExtensionShutdown();

  assert.deepEqual(disposed, []);
  assert.deepEqual(killed, []);
  assert.deepEqual(storage.snapshot(), [
    {
      pid: 9999,
      detachedAt: 1000,
      expiresAt: 8000,
      title: 'tracked',
    },
  ]);
  assert.equal(fake.openedListeners.length, 0);
});

test('collectDescendantPids returns descendants deepest first', () => {
  const rows = [
    { pid: 10, ppid: 1 },
    { pid: 11, ppid: 10 },
    { pid: 12, ppid: 11 },
    { pid: 13, ppid: 10 },
    { pid: 20, ppid: 1 },
  ];

  assert.deepEqual(collectDescendantPids(rows, 10), [12, 11, 13]);
});
