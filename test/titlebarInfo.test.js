const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const {
  CODEX_TITLEBAR_INFO_CONTEXT_KEY,
  CODEX_TITLEBAR_INFO_TITLE_VARIABLE,
  createTitlebarInfoManager,
  findActiveWorkspaceFolder,
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

function createFakeVscode({ folders = [], activeFilePath } = {}) {
  const executedCommands = [];
  const activeEditorListeners = [];
  const workspaceFolderListeners = [];

  return {
    activeEditorListeners,
    executedCommands,
    workspaceFolderListeners,
    vscode: {
      commands: {
        async executeCommand(command, ...args) {
          executedCommands.push([command, ...args]);
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
        onDidChangeActiveTextEditor(listener) {
          activeEditorListeners.push(listener);
          return { dispose() {} };
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
  ]);
});
