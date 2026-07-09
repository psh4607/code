const assert = require('node:assert/strict');
const test = require('node:test');
const {
  createNewTerminalFromActiveCwdCommand,
  resolveTerminalCwd,
} = require('../src/newTerminalFromActiveCwdCommand');

function createFakeVscode({ activeTerminal } = {}) {
  const createdTerminals = [];
  const warnings = [];
  const executedCommands = [];

  return {
    createdTerminals,
    warnings,
    executedCommands,
    vscode: {
      commands: {
        async executeCommand(command) {
          executedCommands.push(command);
        },
      },
      window: {
        activeTerminal,
        createTerminal(options) {
          const terminal = {
            options,
            showCalls: [],
            show(preserveFocus) {
              this.showCalls.push(preserveFocus);
            },
          };
          createdTerminals.push(terminal);
          return terminal;
        },
        showWarningMessage(message) {
          warnings.push(message);
        },
      },
    },
  };
}

test('new terminal command creates directly from the active cwd', async () => {
  const activeTerminal = {
    shellIntegration: {
      cwd: { fsPath: '/tmp/project' },
    },
    showCalls: [],
    show(preserveFocus) {
      this.showCalls.push(preserveFocus);
    },
  };
  const fake = createFakeVscode({
    activeTerminal,
  });

  await createNewTerminalFromActiveCwdCommand(fake.vscode)();

  assert.equal(fake.createdTerminals.length, 1);
  assert.deepEqual(fake.createdTerminals[0].options, { cwd: '/tmp/project' });
  assert.deepEqual(fake.createdTerminals[0].showCalls, [false]);
  assert.deepEqual(activeTerminal.showCalls, []);
  assert.deepEqual(fake.executedCommands, []);
  assert.deepEqual(fake.warnings, []);
});

test('new terminal command creates a default terminal when the active cwd is unavailable', async () => {
  const activeTerminal = {
    showCalls: [],
    show(preserveFocus) {
      this.showCalls.push(preserveFocus);
    },
  };
  const fake = createFakeVscode({
    activeTerminal,
  });

  await createNewTerminalFromActiveCwdCommand(fake.vscode)();

  assert.equal(fake.createdTerminals.length, 1);
  assert.equal(fake.createdTerminals[0].options, undefined);
  assert.deepEqual(fake.createdTerminals[0].showCalls, [false]);
  assert.deepEqual(activeTerminal.showCalls, []);
  assert.deepEqual(fake.executedCommands, []);
  assert.deepEqual(fake.warnings, []);
});

test('new terminal command falls back to the default terminal when no active terminal exists', async () => {
  const fake = createFakeVscode();

  await createNewTerminalFromActiveCwdCommand(fake.vscode)();

  assert.equal(fake.createdTerminals.length, 1);
  assert.equal(fake.createdTerminals[0].options, undefined);
  assert.deepEqual(fake.createdTerminals[0].showCalls, [false]);
  assert.deepEqual(fake.executedCommands, []);
  assert.deepEqual(fake.warnings, []);
});

test('resolveTerminalCwd prefers shell integration and falls back to creation options', () => {
  assert.equal(
    resolveTerminalCwd({
      shellIntegration: {
        cwd: { fsPath: '/tmp/shell-cwd' },
      },
      creationOptions: {
        cwd: '/tmp/creation-cwd',
      },
    }),
    '/tmp/shell-cwd',
  );
  assert.equal(
    resolveTerminalCwd({
      creationOptions: {
        cwd: { fsPath: '/tmp/uri-cwd' },
      },
    }),
    '/tmp/uri-cwd',
  );
});
