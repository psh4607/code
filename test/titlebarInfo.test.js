const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const {
  CODEX_TITLEBAR_INFO_CONTEXT_KEY,
  CODEX_TITLEBAR_INFO_TITLE_VARIABLE,
  CODEX_TERMINAL_HAS_PULL_REQUEST_CONTEXT_KEY,
  createTitlebarInfoManager,
  findActiveWorkspaceFolder,
  findTitlebarInfoFolder,
  formatTitlebarInfo,
  resolveTitlebarInfo,
} = require('../src/titlebarInfo');

function createWorkspaceFolder(folderPath, name = path.basename(folderPath)) {
  return {
    name,
    uri: {
      fsPath: folderPath,
      scheme: 'file',
    },
  };
}

function terminalWithCwd(cwd, name = 'terminal') {
  return {
    name,
    shellIntegration: cwd
      ? {
          cwd: {
            fsPath: cwd,
            scheme: 'file',
          },
        }
      : undefined,
  };
}

function createFakeVscode({ folders = [], activeFilePath, activeTerminal } = {}) {
  const executedCommands = [];
  const openedExternal = [];
  const parsedUris = [];
  const statusBarItems = [];
  const activeEditorListeners = [];
  const activeTerminalListeners = [];
  const terminalShellIntegrationListeners = [];
  const terminalShellExecutionListeners = [];
  const workspaceFolderListeners = [];

  return {
    activeEditorListeners,
    activeTerminalListeners,
    executedCommands,
    openedExternal,
    parsedUris,
    statusBarItems,
    terminalShellExecutionListeners,
    terminalShellIntegrationListeners,
    workspaceFolderListeners,
    vscode: {
      commands: {
        async executeCommand(command, ...args) {
          executedCommands.push([command, ...args]);
          if (command === 'workbench.action.terminal.renameWithArg') {
            const name = args[0]?.name;
            if (name && this.activeTerminal) {
              this.activeTerminal.name = name;
            }
          }
        },
      },
      env: {
        async openExternal(uri) {
          openedExternal.push(uri);
          return true;
        },
      },
      StatusBarAlignment: {
        Left: 1,
      },
      Uri: {
        parse(value) {
          const uri = {
            value,
            toString() {
              return value;
            },
          };
          parsedUris.push(uri);
          return uri;
        },
      },
      window: {
        activeTextEditor: activeFilePath
          ? {
              document: {
                uri: {
                  fsPath: activeFilePath,
                  scheme: 'file',
                },
              },
            }
          : undefined,
        activeTerminal,
        onDidChangeActiveTextEditor(listener) {
          activeEditorListeners.push(listener);
          return { dispose() {} };
        },
        onDidChangeActiveTerminal(listener) {
          activeTerminalListeners.push(listener);
          return { dispose() {} };
        },
        onDidChangeTerminalShellIntegration(listener) {
          terminalShellIntegrationListeners.push(listener);
          return { dispose() {} };
        },
        onDidEndTerminalShellExecution(listener) {
          terminalShellExecutionListeners.push(listener);
          return { dispose() {} };
        },
        createStatusBarItem(alignment, priority) {
          const item = {
            alignment,
            command: undefined,
            disposed: false,
            priority,
            text: '',
            tooltip: '',
            visible: false,
            dispose() {
              this.disposed = true;
            },
            hide() {
              this.visible = false;
            },
            show() {
              this.visible = true;
            },
          };
          statusBarItems.push(item);
          return item;
        },
      },
      workspace: {
        workspaceFolders: folders,
        getWorkspaceFolder(uri) {
          return folders.find((folder) => {
            const relative = path.relative(folder.uri.fsPath, uri.fsPath);
            return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
          });
        },
        onDidChangeWorkspaceFolders(listener) {
          workspaceFolderListeners.push(listener);
          return { dispose() {} };
        },
      },
    },
  };
}

test('findActiveWorkspaceFolder prefers the active editor workspace folder', () => {
  const inf = createWorkspaceFolder('/Users/seongho/projects/dalpha/inf', 'inf');
  const devAgent = createWorkspaceFolder('/Users/seongho/projects/seongho/projects/dev-agent', 'dev-agent');
  const fake = createFakeVscode({
    folders: [inf, devAgent],
    activeFilePath: '/Users/seongho/projects/seongho/projects/dev-agent/src/review.ts',
  });

  assert.equal(findActiveWorkspaceFolder(fake.vscode), devAgent);
});

test('findActiveWorkspaceFolder falls back to the first workspace folder', () => {
  const inf = createWorkspaceFolder('/Users/seongho/projects/dalpha/inf', 'inf');
  const fake = createFakeVscode({ folders: [inf] });

  assert.equal(findActiveWorkspaceFolder(fake.vscode), inf);
});

test('findTitlebarInfoFolder prefers the active terminal cwd workspace folder', () => {
  const inf = createWorkspaceFolder('/Users/seongho/projects/dalpha/inf', 'inf');
  const devAgent = createWorkspaceFolder('/Users/seongho/projects/seongho/projects/dev-agent', 'dev-agent');
  const fake = createFakeVscode({
    folders: [inf, devAgent],
    activeFilePath: '/Users/seongho/projects/dalpha/inf/README.md',
    activeTerminal: terminalWithCwd('/Users/seongho/projects/seongho/projects/dev-agent/src'),
  });

  assert.equal(findTitlebarInfoFolder(fake.vscode), devAgent);
});

test('findTitlebarInfoFolder falls back to the active editor when terminal cwd is unavailable', () => {
  const inf = createWorkspaceFolder('/Users/seongho/projects/dalpha/inf', 'inf');
  const devAgent = createWorkspaceFolder('/Users/seongho/projects/seongho/projects/dev-agent', 'dev-agent');
  const fake = createFakeVscode({
    folders: [inf, devAgent],
    activeFilePath: '/Users/seongho/projects/dalpha/inf/README.md',
    activeTerminal: {},
  });

  assert.equal(findTitlebarInfoFolder(fake.vscode), inf);
});

test('formatTitlebarInfo includes folder, branch, and pull request when present', () => {
  assert.equal(
    formatTitlebarInfo({
      folderName: 'dev-agent',
      branch: 'feat/titlebar-info',
      pullRequestNumber: 42,
    }),
    'dev-agent | feat/titlebar-info | PR #42',
  );
});

test('formatTitlebarInfo omits missing optional segments', () => {
  assert.equal(
    formatTitlebarInfo({
      folderName: 'inf',
      branch: 'main',
    }),
    'inf | main',
  );
  assert.equal(formatTitlebarInfo({ folderName: 'inf' }), 'inf');
});

test('resolveTitlebarInfo reads git branch and GitHub PR for the active folder', async () => {
  const calls = [];
  const runCommand = async (command, args, options) => {
    calls.push({ command, args, cwd: options.cwd });

    if (command === 'git' && args.join(' ') === 'rev-parse --show-toplevel') {
      return '/Users/seongho/projects/seongho/projects/dev-agent';
    }
    if (command === 'git' && args.join(' ') === 'branch --show-current') {
      return 'feat/titlebar-info';
    }
    if (command === 'gh' && args[0] === 'pr') {
      return '42';
    }

    throw new Error(`Unexpected command: ${command} ${args.join(' ')}`);
  };

  const info = await resolveTitlebarInfo({
    folder: createWorkspaceFolder('/Users/seongho/projects/seongho/projects/dev-agent', 'dev-agent'),
    runCommand,
  });

  assert.equal(info, 'dev-agent | feat/titlebar-info | PR #42');
  assert.deepEqual(calls.map((call) => call.cwd), [
    '/Users/seongho/projects/seongho/projects/dev-agent',
    '/Users/seongho/projects/seongho/projects/dev-agent',
    '/Users/seongho/projects/seongho/projects/dev-agent',
  ]);
});

test('titlebar info manager registers a window title variable and publishes context', async () => {
  const folder = createWorkspaceFolder('/Users/seongho/projects/dalpha/inf', 'inf');
  const fake = createFakeVscode({
    folders: [folder],
    activeFilePath: '/Users/seongho/projects/dalpha/inf/README.md',
  });
  const runCommand = async (command, args) => {
    if (command === 'git' && args.join(' ') === 'rev-parse --show-toplevel') {
      return '/Users/seongho/projects/dalpha/inf';
    }
    if (command === 'git' && args.join(' ') === 'branch --show-current') {
      return 'main';
    }
    if (command === 'gh') {
      return '';
    }
    throw new Error(`Unexpected command: ${command} ${args.join(' ')}`);
  };

  const manager = createTitlebarInfoManager(fake.vscode, {
    runCommand,
    startTimers: false,
  });

  manager.start();
  await manager.flush();

  assert.deepEqual(fake.executedCommands, [
    ['registerWindowTitleVariable', CODEX_TITLEBAR_INFO_TITLE_VARIABLE, CODEX_TITLEBAR_INFO_CONTEXT_KEY],
    ['setContext', CODEX_TITLEBAR_INFO_CONTEXT_KEY, 'inf | main'],
    ['setContext', CODEX_TERMINAL_HAS_PULL_REQUEST_CONTEXT_KEY, false],
  ]);
});

test('titlebar info manager republishes context from the focused terminal cwd', async () => {
  const inf = createWorkspaceFolder('/Users/seongho/projects/dalpha/inf', 'inf');
  const devAgent = createWorkspaceFolder('/Users/seongho/projects/seongho/projects/dev-agent', 'dev-agent');
  const fake = createFakeVscode({
    folders: [inf, devAgent],
    activeFilePath: '/Users/seongho/projects/dalpha/inf/README.md',
    activeTerminal: terminalWithCwd('/Users/seongho/projects/dalpha/inf'),
  });
  const runCommand = async (command, args, options) => {
    if (command === 'git' && args.join(' ') === 'rev-parse --show-toplevel') {
      return options.cwd.includes('/dev-agent')
        ? '/Users/seongho/projects/seongho/projects/dev-agent'
        : '/Users/seongho/projects/dalpha/inf';
    }
    if (command === 'git' && args.join(' ') === 'branch --show-current') {
      return options.cwd.includes('/dev-agent') ? 'feat/terminal-titlebar' : 'main';
    }
    if (command === 'gh') {
      return '';
    }
    throw new Error(`Unexpected command: ${command} ${args.join(' ')}`);
  };

  const manager = createTitlebarInfoManager(fake.vscode, {
    runCommand,
    startTimers: false,
  });

  manager.start();
  await manager.flush();
  fake.vscode.window.activeTerminal = terminalWithCwd(
    '/Users/seongho/projects/seongho/projects/dev-agent/src',
  );
  await fake.activeTerminalListeners[0](fake.vscode.window.activeTerminal);
  await manager.flush();

  assert.equal(
    fake.executedCommands
      .filter(
        ([command, key]) => command === 'setContext' && key === CODEX_TITLEBAR_INFO_CONTEXT_KEY,
      )
      .at(-1)[2],
    'dev-agent | feat/terminal-titlebar',
  );
});

test('titlebar info manager caches pull request lookups for the same repo and branch', async () => {
  const repoPath = '/Users/seongho/projects/seongho/projects/dev-agent';
  const fake = createFakeVscode({
    folders: [createWorkspaceFolder(repoPath, 'dev-agent')],
    activeTerminal: terminalWithCwd(`${repoPath}/src`),
  });
  let ghCalls = 0;
  const runCommand = async (command, args) => {
    if (command === 'git' && args.join(' ') === 'rev-parse --show-toplevel') {
      return repoPath;
    }
    if (command === 'git' && args.join(' ') === 'branch --show-current') {
      return 'feat/rate-limit';
    }
    if (command === 'gh') {
      ghCalls += 1;
      return '77';
    }
    throw new Error(`Unexpected command: ${command} ${args.join(' ')}`);
  };

  const manager = createTitlebarInfoManager(fake.vscode, {
    runCommand,
    startTimers: false,
    prCacheTtlMs: 60000,
    now: () => 1000,
  });

  await manager.updateNow();
  await manager.updateNow();

  assert.equal(ghCalls, 1);
  assert.equal(
    fake.executedCommands
      .filter(
        ([command, key]) => command === 'setContext' && key === CODEX_TITLEBAR_INFO_CONTEXT_KEY,
      )
      .at(-1)[2],
    'dev-agent | feat/rate-limit | PR #77',
  );
});

test('titlebar info manager marks the active terminal tab and status bar when a pull request exists', async () => {
  const repoPath = '/Users/seongho/projects/dalpha/inf/oi-easy-admin';
  const prUrl = 'https://github.com/dalphakr/dalpha-oi-admin/pull/275';
  const fake = createFakeVscode({
    folders: [createWorkspaceFolder(repoPath, 'oi-easy-admin')],
    activeTerminal: terminalWithCwd(`${repoPath}/src`, '가운데 검색 바 삭제 / 업데이트'),
  });
  const runCommand = async (command, args) => {
    if (command === 'git' && args.join(' ') === 'rev-parse --show-toplevel') {
      return repoPath;
    }
    if (command === 'git' && args.join(' ') === 'branch --show-current') {
      return 'fix/task-execution-history-visibility';
    }
    if (command === 'gh') {
      return JSON.stringify({
        isDraft: true,
        number: 275,
        state: 'OPEN',
        url: prUrl,
      });
    }
    throw new Error(`Unexpected command: ${command} ${args.join(' ')}`);
  };

  const manager = createTitlebarInfoManager(fake.vscode, {
    runCommand,
    startTimers: false,
  });

  await manager.updateNow();
  await manager.openCurrentPullRequest();

  assert.deepEqual(
    fake.executedCommands.find(([command]) => command === 'workbench.action.terminal.renameWithArg'),
    ['workbench.action.terminal.renameWithArg', { name: 'PR #275 · 가운데 검색 바 삭제 / 업데이트' }],
  );
  assert.deepEqual(
    fake.executedCommands.find(
      ([command, key]) => command === 'setContext' && key === CODEX_TERMINAL_HAS_PULL_REQUEST_CONTEXT_KEY,
    ),
    ['setContext', CODEX_TERMINAL_HAS_PULL_REQUEST_CONTEXT_KEY, true],
  );
  assert.equal(fake.statusBarItems.length, 1);
  assert.equal(fake.statusBarItems[0].visible, true);
  assert.equal(fake.statusBarItems[0].text, '$(git-pull-request) PR #275');
  assert.equal(fake.statusBarItems[0].tooltip, 'Open draft PR #275');
  assert.equal(fake.statusBarItems[0].command, 'codexTerminal.openCurrentPullRequest');
  assert.equal(fake.openedExternal[0].value, prUrl);
});
