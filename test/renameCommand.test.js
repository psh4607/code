const assert = require('node:assert/strict');
const test = require('node:test');
const { createRenameThreadCommand } = require('../src/renameCommand');

function createFakeVscode({ input, terminal } = {}) {
  const warnings = [];
  const sent = [];
  const activeTerminal = terminal === false
    ? undefined
    : {
        sendText(text, addNewLine) {
          sent.push([text, addNewLine]);
        },
      };

  return {
    sent,
    warnings,
    vscode: {
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
