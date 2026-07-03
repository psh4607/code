const assert = require('node:assert/strict');
const test = require('node:test');
const {
  createTerminalCwdColorManager,
  resolveCwdColor,
} = require('../src/terminalCwdColor');

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function createFakeVscode({ activeTerminal, rules, storedColors } = {}) {
  const commands = [];
  const endExecutionListeners = [];
  const shellIntegrationListeners = [];
  const activeTerminalListeners = [];
  const globalState = {
    values: {
      cwdColorByPath: storedColors ?? {},
    },
    get(key, fallback) {
      return this.values[key] ?? fallback;
    },
    async update(key, value) {
      this.values[key] = value;
    },
  };

  return {
    commands,
    endExecutionListeners,
    shellIntegrationListeners,
    activeTerminalListeners,
    globalState,
    vscode: {
      commands: {
        async executeCommand(command, arg) {
          commands.push([command, arg]);
        },
      },
      workspace: {
        getConfiguration(section) {
          assert.equal(section, 'codexTerminal');
          return {
            get(key, fallback) {
              if (key === 'cwdColorRules') {
                return rules ?? fallback;
              }
              throw new Error(`Unexpected configuration key: ${key}`);
            },
          };
        },
      },
      window: {
        get activeTerminal() {
          return activeTerminal;
        },
        onDidEndTerminalShellExecution(listener) {
          endExecutionListeners.push(listener);
          return { dispose() {} };
        },
        onDidChangeTerminalShellIntegration(listener) {
          shellIntegrationListeners.push(listener);
          return { dispose() {} };
        },
        onDidChangeActiveTerminal(listener) {
          activeTerminalListeners.push(listener);
          return { dispose() {} };
        },
      },
    },
  };
}

function terminalWithCwd(cwd) {
  return {
    shellIntegration: {
      cwd: { fsPath: cwd },
    },
  };
}

test('resolveCwdColor uses an exact stored manual cwd color before configured rules', () => {
  assert.equal(
    resolveCwdColor(
      '/Users/seongho/projects/dalpha/inf',
      [{ path: '/Users/seongho/projects/dalpha/inf', color: 'terminal.ansiGreen' }],
      { '/Users/seongho/projects/dalpha/inf': 'terminal.ansiRed' },
    ),
    'terminal.ansiRed',
  );
});

test('resolveCwdColor falls back to a deterministic hash color when no mapping exists', () => {
  const cwd = '/tmp/no-manual-color-here';

  const first = resolveCwdColor(cwd, [], {});
  const second = resolveCwdColor(`${cwd}/`, [], {});

  assert.equal(first, second);
  assert.match(first, /^terminal\.ansi[A-Z]/);
});

test('resolveCwdColor picks the longest matching path prefix', () => {
  const rules = [
    { path: '/Users/seongho/projects', color: 'terminal.ansiBlue' },
    { path: '/Users/seongho/projects/dalpha/inf', color: 'terminal.ansiGreen' },
  ];

  assert.equal(
    resolveCwdColor('/Users/seongho/projects/dalpha/inf/inf-fe-monorepo', rules),
    'terminal.ansiGreen',
  );
});

test('resolveCwdColor does not match partial path segment prefixes', () => {
  const rules = [
    { path: '/Users/seongho/projects/dalpha/inf', color: 'terminal.ansiGreen' },
  ];

  assert.equal(
    resolveCwdColor('/Users/seongho/projects/dalpha/inference-tooling', rules),
    resolveCwdColor('/Users/seongho/projects/dalpha/inference-tooling', []),
  );
});

test('manager updates the active terminal icon color when cwd changes', async () => {
  const activeTerminal = terminalWithCwd('/Users/seongho/projects/dalpha/inf');
  const fake = createFakeVscode({
    activeTerminal,
    rules: [
      { path: '/Users/seongho/projects/dalpha/inf', color: 'terminal.ansiGreen' },
    ],
  });
  const manager = createTerminalCwdColorManager(fake.vscode, {
    scheduleDelayMs: 0,
  });

  manager.start();
  await fake.endExecutionListeners[0]({ terminal: activeTerminal });
  await manager.flush();

  assert.deepEqual(fake.commands, [
    ['workbench.action.terminal.changeColorActiveTab', 'terminal.ansiGreen'],
  ]);
});

test('manager resets a previously applied icon color when cwd no longer matches', async () => {
  const activeTerminal = terminalWithCwd('/Users/seongho/projects/dalpha/inf');
  const fake = createFakeVscode({
    activeTerminal,
    rules: [
      { path: '/Users/seongho/projects/dalpha/inf', color: 'terminal.ansiGreen' },
    ],
  });
  const manager = createTerminalCwdColorManager(fake.vscode, {
    scheduleDelayMs: 0,
    hashFallback: false,
  });

  manager.start();
  await fake.endExecutionListeners[0]({ terminal: activeTerminal });
  await manager.flush();
  activeTerminal.shellIntegration.cwd.fsPath = '/tmp';
  await fake.endExecutionListeners[0]({ terminal: activeTerminal });
  await manager.flush();

  assert.deepEqual(fake.commands, [
    ['workbench.action.terminal.changeColorActiveTab', 'terminal.ansiGreen'],
    ['workbench.action.terminal.changeColorActiveTab', null],
  ]);
});

test('manager remembers manually selected colors for the active cwd', async () => {
  const activeTerminal = terminalWithCwd('/Users/seongho/projects/dalpha/inf');
  const fake = createFakeVscode({
    activeTerminal,
    rules: [],
  });
  const manager = createTerminalCwdColorManager(fake.vscode, {
    context: { globalState: fake.globalState },
    scheduleDelayMs: 0,
  });

  await manager.rememberCwdColor({
    cwd: '/Users/seongho/projects/dalpha/inf',
    color: 'terminal.ansiRed',
  });
  manager.start();
  await manager.flush();

  assert.deepEqual(fake.globalState.values.cwdColorByPath, {
    '/Users/seongho/projects/dalpha/inf': 'terminal.ansiRed',
  });
  assert.deepEqual(fake.commands, [
    ['workbench.action.terminal.changeColorActiveTab', 'terminal.ansiRed'],
  ]);
});

test('manager records manual colors for the reported cwd and the active terminal cwd', async () => {
  const activeTerminal = terminalWithCwd('/tmp/actual-active-cwd');
  const fake = createFakeVscode({
    activeTerminal,
    rules: [],
  });
  const manager = createTerminalCwdColorManager(fake.vscode, {
    context: { globalState: fake.globalState },
    scheduleDelayMs: 0,
  });

  await manager.rememberCwdColor({
    cwd: '/tmp/stale-reported-cwd',
    color: 'terminal.ansiWhite',
  });
  manager.start();
  await manager.flush();

  assert.deepEqual(fake.globalState.values.cwdColorByPath, {
    '/tmp/stale-reported-cwd': 'terminal.ansiWhite',
    '/tmp/actual-active-cwd': 'terminal.ansiWhite',
  });
  assert.deepEqual(fake.commands, [
    ['workbench.action.terminal.changeColorActiveTab', 'terminal.ansiWhite'],
  ]);
});

test('manager retries when cmd+t creates an active terminal before cwd is ready', async () => {
  const activeTerminal = {};
  const fake = createFakeVscode({
    activeTerminal,
    rules: [],
  });
  const manager = createTerminalCwdColorManager(fake.vscode, {
    scheduleDelayMs: 0,
    retryDelayMs: 5,
    maxCwdRetries: 2,
  });

  manager.start();
  await fake.activeTerminalListeners[0](activeTerminal);
  await wait(1);
  activeTerminal.shellIntegration = {
    cwd: { fsPath: '/tmp/cmd-t-delayed-cwd' },
  };
  await manager.flush();

  assert.equal(fake.commands.length, 1);
  assert.match(fake.commands[0][1], /^terminal\.ansi[A-Z]/);
});
