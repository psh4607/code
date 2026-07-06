const assert = require('node:assert/strict');
const test = require('node:test');
const {
  createDetachedTerminalTtlManager,
  collectDescendantPids,
  createDetachedTerminalQuickPickItems,
} = require('../src/detachedTerminalTtl');

const SESSION_ID_A = '019f2643-b7b8-76b2-baed-9faae1f809fd';

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

function createFakeVscode({ activeTerminal, quickPickIndex } = {}) {
  const executedCommands = [];
  const createdTerminals = [];
  const quickPickCalls = [];
  const warnings = [];
  const information = [];
  const openedListeners = [];

  return {
    createdTerminals,
    executedCommands,
    information,
    quickPickCalls,
    warnings,
    openedListeners,
    vscode: {
      commands: {
        async executeCommand(command, args) {
          executedCommands.push([command, args]);
        },
      },
      window: {
        activeTerminal,
        createTerminal(options) {
          const terminal = {
            options,
            sentText: [],
            shown: [],
            sendText(text, shouldExecute) {
              this.sentText.push([text, shouldExecute]);
            },
            show(preserveFocus) {
              this.shown.push(preserveFocus);
            },
          };
          createdTerminals.push(terminal);
          return terminal;
        },
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
        showInformationMessage(message) {
          information.push(message);
        },
        async showQuickPick(items, options) {
          quickPickCalls.push({ items, options });
          if (quickPickIndex === undefined) {
            return undefined;
          }
          return items[quickPickIndex];
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

function terminalWithPidAndCwd(pid, cwd, title = 'zsh') {
  return {
    ...terminalWithPid(pid, title),
    shellIntegration: {
      cwd: { fsPath: cwd },
    },
  };
}

function createAliveProcessApi() {
  return {
    kill() {
      return true;
    },
  };
}

function createSelectiveProcessApi(alivePids) {
  return {
    kill(pid, signal) {
      if (signal === 0 && !alivePids.has(pid)) {
        const error = new Error('missing');
        error.code = 'ESRCH';
        throw error;
      }
      return true;
    },
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

  assert.deepEqual(fake.executedCommands, [['workbench.action.terminal.detachSession', undefined]]);
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

test('detach command records Codex session metadata from the session registry', async () => {
  const storage = createMemoryStorage();
  const activeTerminal = terminalWithPidAndCwd(1234, '/tmp/project', 'work');
  const fake = createFakeVscode({ activeTerminal });
  const manager = createDetachedTerminalTtlManager(fake.vscode, {
    storage,
    now: () => 1000,
    startTimers: false,
    async loadSessionRegistryRecords() {
      return [
        {
          sessionId: SESSION_ID_A,
          cwd: '/tmp/project',
          terminalPid: 1234,
        },
      ];
    },
  });

  await manager.detachActiveTerminal();

  assert.deepEqual(storage.snapshot(), [
    {
      pid: 1234,
      detachedAt: 1000,
      expiresAt: 3601000,
      title: 'work',
      sessionId: SESSION_ID_A,
      cwd: '/tmp/project',
    },
  ]);
});

test('attach command marks the reattached terminal pid in the ttl registry', async () => {
  const storage = createMemoryStorage([
    {
      pid: 2222,
      detachedAt: 1000,
      expiresAt: 3601000,
      title: 'old',
    },
  ]);
  const activeTerminal = terminalWithPid(2222, 'reattached');
  const fake = createFakeVscode({ activeTerminal, quickPickIndex: 0 });
  const manager = createDetachedTerminalTtlManager(fake.vscode, {
    storage,
    now: () => 2000,
    processApi: createAliveProcessApi(),
    startTimers: false,
  });

  await manager.attachDetachedTerminal();

  assert.deepEqual(fake.quickPickCalls[0].items.map((item) => item.pid), [2222]);
  assert.deepEqual(fake.executedCommands, [
    ['workbench.action.terminal.attachToSession', { pid: 2222 }],
  ]);
  assert.deepEqual(storage.snapshot(), [
    {
      pid: 2222,
      detachedAt: 1000,
      expiresAt: 3601000,
      title: 'old',
      reattachedAt: 2000,
    },
  ]);
});

test('attach command shows expired tracked terminals as unavailable history', async () => {
  const storage = createMemoryStorage([
    {
      pid: 1111,
      detachedAt: 1000,
      expiresAt: 2000,
      title: 'expired',
    },
    {
      pid: 2222,
      detachedAt: 2000,
      expiresAt: 8000,
      title: 'fresh',
    },
  ]);
  const killed = [];
  const activeTerminal = terminalWithPid(2222, 'reattached');
  const fake = createFakeVscode({ activeTerminal, quickPickIndex: 0 });
  const manager = createDetachedTerminalTtlManager(fake.vscode, {
    storage,
    now: () => 3000,
    processApi: createAliveProcessApi(),
    startTimers: false,
    async killTree(pid) {
      killed.push(pid);
      return true;
    },
  });

  await manager.attachDetachedTerminal();

  assert.deepEqual(killed, [1111]);
  assert.deepEqual(
    fake.quickPickCalls[0].items.map((item) => ({
      pid: item.pid,
      canAttach: item.canAttach,
      description: item.description,
    })),
    [
      {
        pid: 2222,
        canAttach: true,
        description: undefined,
      },
      {
        pid: 1111,
        canAttach: false,
        description: 'TTL 만료됨',
      },
    ],
  );
  assert.deepEqual(fake.executedCommands, [
    ['workbench.action.terminal.attachToSession', { pid: 2222 }],
  ]);
  assert.deepEqual(storage.snapshot(), [
    {
      pid: 1111,
      detachedAt: 1000,
      expiresAt: 2000,
      title: 'expired',
      terminatedAt: 3000,
      terminationReason: 'expired',
    },
    {
      pid: 2222,
      detachedAt: 2000,
      expiresAt: 8000,
      title: 'fresh',
      reattachedAt: 3000,
    },
  ]);
});

test('attach command shows live tracked sessions newest first with ttl expiry time', async () => {
  const storage = createMemoryStorage([
    {
      pid: 1111,
      detachedAt: 1000,
      expiresAt: 600000,
      title: 'older',
    },
    {
      pid: 2222,
      detachedAt: 2000,
      expiresAt: 700000,
      title: 'newer',
    },
  ]);
  const fake = createFakeVscode({ activeTerminal: terminalWithPid(2222, 'reattached'), quickPickIndex: 0 });
  const manager = createDetachedTerminalTtlManager(fake.vscode, {
    storage,
    now: () => 100000,
    processApi: createAliveProcessApi(),
    startTimers: false,
    formatTime(ms) {
      return `T${ms}`;
    },
  });

  await manager.attachDetachedTerminal();

  assert.deepEqual(
    fake.quickPickCalls[0].items.map((item) => ({
      label: item.label,
      detail: item.detail,
      pid: item.pid,
    })),
    [
      {
        label: 'newer 2222',
        detail: 'TTL T700000까지 | 10분 남음',
        pid: 2222,
      },
      {
        label: 'older 1111',
        detail: 'TTL T600000까지 | 9분 남음',
        pid: 1111,
      },
    ],
  );
  assert.equal(fake.quickPickCalls[0].items[0].description, undefined);
});

test('attach command shows dead tracked sessions as unavailable history', async () => {
  const storage = createMemoryStorage([
    {
      pid: 1111,
      detachedAt: 1000,
      expiresAt: 600000,
      title: 'dead',
    },
  ]);
  const fake = createFakeVscode();
  const manager = createDetachedTerminalTtlManager(fake.vscode, {
    storage,
    now: () => 100000,
    startTimers: false,
    processApi: {
      kill() {
        const error = new Error('missing');
        error.code = 'ESRCH';
        throw error;
      },
    },
  });

  await manager.attachDetachedTerminal();

  assert.deepEqual(
    fake.quickPickCalls[0].items.map((item) => ({
      pid: item.pid,
      canAttach: item.canAttach,
      description: item.description,
    })),
    [
      {
        pid: 1111,
        canAttach: false,
        description: '프로세스 종료됨',
      },
    ],
  );
  assert.deepEqual(fake.information, []);
  assert.deepEqual(fake.executedCommands, []);
});

test('quick pick marks dead detached Codex sessions as resumable', () => {
  const items = createDetachedTerminalQuickPickItems(
    [
      {
        pid: 1111,
        detachedAt: 1000,
        expiresAt: 600000,
        title: 'dead',
        terminatedAt: 100000,
        terminationReason: 'dead',
        sessionId: SESSION_ID_A,
        cwd: '/tmp/project',
      },
    ],
    {
      now: 100000,
      canResumeCodexSession() {
        return true;
      },
    },
  );

  assert.equal(items[0].description, '프로세스 종료됨 · Codex 세션 복원 가능');
  assert.equal(items[0].canAttach, false);
  assert.equal(items[0].canResumeCodexSession, true);
});

test('attach command resumes a dead detached Codex session immediately', async () => {
  const storage = createMemoryStorage([
    {
      pid: 1111,
      detachedAt: 1000,
      expiresAt: 600000,
      title: 'dead',
      terminatedAt: 100000,
      terminationReason: 'dead',
      sessionId: SESSION_ID_A,
      cwd: '/tmp/project',
    },
  ]);
  const fake = createFakeVscode({ quickPickIndex: 0 });
  const manager = createDetachedTerminalTtlManager(fake.vscode, {
    storage,
    now: () => 200000,
    startTimers: false,
    async hasSavedCodexSession(sessionId) {
      return sessionId === SESSION_ID_A;
    },
  });

  await manager.attachDetachedTerminal();

  assert.equal(fake.information.length, 0);
  assert.deepEqual(fake.createdTerminals[0].options, {
    cwd: '/tmp/project',
    name: 'dead',
  });
  assert.deepEqual(fake.createdTerminals[0].shown, [false]);
  assert.deepEqual(fake.createdTerminals[0].sentText, [
    [`codex resume ${SESSION_ID_A}`, true],
  ]);
  assert.equal(storage.snapshot()[0].codexResumedAt, 200000);
});

test('createDetachedTerminalQuickPickItems formats ttl expiry and remaining time', () => {
  const items = createDetachedTerminalQuickPickItems(
    [
      {
        pid: 1111,
        detachedAt: 1000,
        expiresAt: 221000,
        title: '',
      },
    ],
    {
      now: 100000,
      formatTime(ms) {
        return `T${ms}`;
      },
    },
  );

  assert.deepEqual(
    items.map((item) => ({
      label: item.label,
      detail: item.detail,
      pid: item.pid,
    })),
    [
      {
        label: 'Terminal 1111',
        detail: 'TTL T221000까지 | 3분 남음',
        pid: 1111,
      },
    ],
  );
  assert.equal(items[0].description, undefined);
});

test('createDetachedTerminalQuickPickItems keeps six hour history with unavailable states', () => {
  const items = createDetachedTerminalQuickPickItems(
    [
      {
        pid: 1111,
        detachedAt: 1001,
        expiresAt: 601000,
        title: 'fresh',
      },
      {
        pid: 2222,
        detachedAt: 2000,
        expiresAt: 3000,
        title: 'expired',
      },
      {
        pid: 3333,
        detachedAt: 3000,
        expiresAt: 603000,
        title: 'dead',
      },
      {
        pid: 4444,
        detachedAt: 4000,
        expiresAt: 604000,
        title: 'reattached',
        reattachedAt: 5000,
      },
      {
        pid: 5555,
        detachedAt: 100,
        expiresAt: 200,
        title: 'too old',
      },
    ],
    {
      now: 10_000,
      historyRetentionMs: 9000,
      formatTime(ms) {
        return `T${ms}`;
      },
      isAlive(record) {
        return record.pid !== 3333;
      },
    },
  );

  assert.deepEqual(
    items.map((item) => ({
      label: item.label,
      detail: item.detail,
      description: item.description,
      canAttach: item.canAttach,
      pid: item.pid,
    })),
    [
      {
        label: 'reattached 4444',
        detail: '재연결됨 T5000 | 기록 T13000까지',
        description: '이미 재연결됨',
        canAttach: false,
        pid: 4444,
      },
      {
        label: 'dead 3333',
        detail: '마지막 TTL T603000까지 | 기록 T12000까지',
        description: '프로세스 종료됨',
        canAttach: false,
        pid: 3333,
      },
      {
        label: 'expired 2222',
        detail: 'TTL T3000에 만료됨 | 기록 T11000까지',
        description: 'TTL 만료됨',
        canAttach: false,
        pid: 2222,
      },
      {
        label: 'fresh 1111',
        detail: 'TTL T601000까지 | 10분 남음',
        description: undefined,
        canAttach: true,
        pid: 1111,
      },
    ],
  );
});

test('attach command ignores unavailable selections', async () => {
  const storage = createMemoryStorage([
    {
      pid: 1111,
      detachedAt: 1000,
      expiresAt: 2000,
      title: 'expired',
    },
    {
      pid: 2222,
      detachedAt: 2000,
      expiresAt: 8000,
      title: 'fresh',
    },
  ]);
  const fake = createFakeVscode({ quickPickIndex: 1 });
  const manager = createDetachedTerminalTtlManager(fake.vscode, {
    storage,
    now: () => 3000,
    processApi: createAliveProcessApi(),
    startTimers: false,
    async killTree() {
      return true;
    },
  });

  await manager.attachDetachedTerminal();

  assert.deepEqual(fake.executedCommands, []);
  assert.deepEqual(fake.information, ['TTL 만료됨']);
});

test('opened terminal listener marks matching tracked pid reattached', async () => {
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

  assert.deepEqual(storage.snapshot(), [
    {
      pid: 3333,
      detachedAt: 1000,
      expiresAt: 3601000,
      title: 'old',
      reattachedAt: 2000,
    },
  ]);
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
    processApi: createAliveProcessApi(),
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
      pid: 4444,
      detachedAt: 1000,
      expiresAt: 2000,
      title: 'expired',
      terminatedAt: 3000,
      terminationReason: 'expired',
    },
    {
      pid: 5555,
      detachedAt: 2000,
      expiresAt: 8000,
      title: 'fresh',
    },
  ]);
});

test('sweepExpired keeps dead records as history until retention expires', async () => {
  const storage = createMemoryStorage([
    {
      pid: 4444,
      detachedAt: 1000,
      expiresAt: 8000,
      title: 'dead fresh',
    },
    {
      pid: 5555,
      detachedAt: 2000,
      expiresAt: 8000,
      title: 'alive fresh',
    },
  ]);
  const killed = [];
  const manager = createDetachedTerminalTtlManager(createFakeVscode().vscode, {
    storage,
    now: () => 3000,
    startTimers: false,
    processApi: {
      kill(pid, signal) {
        if (signal === 0 && pid === 4444) {
          const error = new Error('missing');
          error.code = 'ESRCH';
          throw error;
        }
        return true;
      },
    },
    async killTree(pid) {
      killed.push(pid);
      return true;
    },
  });

  await manager.sweepExpired();

  assert.deepEqual(killed, []);
  assert.deepEqual(storage.snapshot(), [
    {
      pid: 4444,
      detachedAt: 1000,
      expiresAt: 8000,
      title: 'dead fresh',
      terminatedAt: 3000,
      terminationReason: 'dead',
    },
    {
      pid: 5555,
      detachedAt: 2000,
      expiresAt: 8000,
      title: 'alive fresh',
    },
  ]);
});

test('sweepExpired purges records only after the history retention window', async () => {
  const storage = createMemoryStorage([
    {
      pid: 4444,
      detachedAt: 1001,
      expiresAt: 2000,
      title: 'expired in history',
    },
    {
      pid: 5555,
      detachedAt: 1000,
      expiresAt: 2000,
      title: 'expired too old',
    },
  ]);
  const killed = [];
  const manager = createDetachedTerminalTtlManager(createFakeVscode().vscode, {
    storage,
    now: () => 10_000,
    historyRetentionMs: 9000,
    startTimers: false,
    processApi: createSelectiveProcessApi(new Set([4444, 5555])),
    async killTree(pid) {
      killed.push(pid);
      return true;
    },
  });

  await manager.sweepExpired();

  assert.deepEqual(killed, [4444]);
  assert.deepEqual(storage.snapshot(), [
    {
      pid: 4444,
      detachedAt: 1001,
      expiresAt: 2000,
      title: 'expired in history',
      terminatedAt: 10000,
      terminationReason: 'expired',
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
