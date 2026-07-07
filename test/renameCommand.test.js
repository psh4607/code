const assert = require('node:assert/strict');
const test = require('node:test');
const { createRenameThreadCommand } = require('../src/renameCommand');

function createFakeVscode({ input, terminal } = {}) {
  const executedCommands = [];
  const warnings = [];
  const sent = [];
  const activeTerminal = terminal === false
    ? undefined
    : {
        name: terminal?.name ?? 'terminal',
        sendText(text, addNewLine) {
          sent.push([text, addNewLine]);
        },
      };

  return {
    executedCommands,
    sent,
    warnings,
    vscode: {
      commands: {
        async executeCommand(command, ...args) {
          executedCommands.push([command, ...args]);
          if (command === 'workbench.action.terminal.renameWithArg') {
            activeTerminal.name = args[0]?.name;
          }
        },
      },
      window: {
        activeTerminal,
        async showInputBox() {
          return input;
        },
        showWarningMessage(message) {
          warnings.push(message);
        },
      },
    },
  };
}

test('rename command sends slash command and requested name to the active terminal', async () => {
  const fake = createFakeVscode({ input: '  launch cleanup  ' });
  const waits = [];

  await createRenameThreadCommand(fake.vscode, {
    delayMs: 275,
    confirmDelayMs: 75,
    sleep(ms) {
      waits.push(ms);
    },
  })();

  assert.deepEqual(fake.sent, [
    ['\x15', false],
    ['/rename', true],
    ['launch cleanup', false],
    ['', true],
  ]);
  assert.deepEqual(waits, [25, 275, 75]);
  assert.deepEqual(fake.warnings, []);
});

test('rename command also updates the VS Code terminal tab title', async () => {
  const fake = createFakeVscode({
    input: '경로 축약',
    terminal: {
      name: 'codex-vscode-terminal... | 019f3afc-24d3-7b03-867f-746705cc3415',
    },
  });

  await createRenameThreadCommand(fake.vscode, {
    sleep() {},
  })();

  assert.deepEqual(fake.executedCommands, [
    [
      'workbench.action.terminal.renameWithArg',
      { name: 'codex-vscode-terminal... | 경로 축약' },
    ],
  ]);
  assert.equal(fake.vscode.window.activeTerminal.name, 'codex-vscode-terminal... | 경로 축약');
});

test('rename command persists the renamed terminal tab title for restart restore', async () => {
  const fake = createFakeVscode({
    input: '경로 축약',
    terminal: {
      name: 'codex-vscode-terminal... | 019f3afc-24d3-7b03-867f-746705cc3415',
    },
  });
  const persisted = [];

  await createRenameThreadCommand(fake.vscode, {
    async recordTerminalTitleRename(terminal, title, options) {
      persisted.push({ options, terminal, title });
    },
    sleep() {},
  })();

  assert.equal(persisted.length, 1);
  assert.equal(persisted[0].terminal, fake.vscode.window.activeTerminal);
  assert.equal(persisted[0].title, 'codex-vscode-terminal... | 경로 축약');
  assert.deepEqual(persisted[0].options, {
    previousTitle: 'codex-vscode-terminal... | 019f3afc-24d3-7b03-867f-746705cc3415',
  });
});

test('rename command uses short default delays', async () => {
  const fake = createFakeVscode({ input: 'quick rename' });
  const waits = [];

  await createRenameThreadCommand(fake.vscode, {
    sleep(ms) {
      waits.push(ms);
    },
  })();

  assert.deepEqual(waits, [25, 100, 25]);
});

test('rename command does nothing when input is cancelled', async () => {
  const fake = createFakeVscode({ input: undefined });

  await createRenameThreadCommand(fake.vscode)();

  assert.deepEqual(fake.sent, []);
  assert.deepEqual(fake.warnings, []);
});

test('rename command warns when no active terminal exists', async () => {
  const fake = createFakeVscode({ input: 'unused', terminal: false });

  await createRenameThreadCommand(fake.vscode)();

  assert.deepEqual(fake.sent, []);
  assert.deepEqual(fake.warnings, ['No active terminal is available.']);
});
