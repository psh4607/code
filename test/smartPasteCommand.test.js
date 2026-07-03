const assert = require('node:assert/strict');
const test = require('node:test');
const {
  clipboardInfoHasImage,
  createSmartPasteCommand,
  pathIsVideoFile,
  shellQuotePath,
} = require('../src/smartPasteCommand');

function createFakeVscode({ terminal = true } = {}) {
  const sent = [];
  const executedCommands = [];
  const activeTerminal = terminal
    ? {
        sendText(text, addNewLine) {
          sent.push([text, addNewLine]);
        },
      }
    : undefined;

  return {
    executedCommands,
    sent,
    vscode: {
      commands: {
        async executeCommand(command) {
          executedCommands.push(command);
        },
      },
      window: {
        activeTerminal,
      },
    },
  };
}

test('smart paste sends Ctrl+V to the active terminal when the clipboard has an image', async () => {
  const fake = createFakeVscode();

  await createSmartPasteCommand(fake.vscode, {
    async getClipboardVideoFilePath() {
      return undefined;
    },
    async hasClipboardImage() {
      return true;
    },
  })();

  assert.deepEqual(fake.sent, [['\x16', false]]);
  assert.deepEqual(fake.executedCommands, []);
});

test('smart paste inserts a shell-quoted path when the clipboard has a video file', async () => {
  const fake = createFakeVscode();

  await createSmartPasteCommand(fake.vscode, {
    async getClipboardVideoFilePath() {
      return "/Users/seongho/Desktop/screen recording's clip.mov";
    },
    async hasClipboardImage() {
      return true;
    },
  })();

  assert.deepEqual(fake.sent, [["'/Users/seongho/Desktop/screen recording'\\''s clip.mov'", false]]);
  assert.deepEqual(fake.executedCommands, []);
});

test('smart paste falls back to VS Code terminal paste when the clipboard has no image', async () => {
  const fake = createFakeVscode();

  await createSmartPasteCommand(fake.vscode, {
    async getClipboardVideoFilePath() {
      return undefined;
    },
    async hasClipboardImage() {
      return false;
    },
  })();

  assert.deepEqual(fake.sent, []);
  assert.deepEqual(fake.executedCommands, ['workbench.action.terminal.paste']);
});

test('smart paste falls back to VS Code terminal paste when image detection fails', async () => {
  const fake = createFakeVscode();

  await createSmartPasteCommand(fake.vscode, {
    async getClipboardVideoFilePath() {
      return undefined;
    },
    async hasClipboardImage() {
      throw new Error('clipboard unavailable');
    },
  })();

  assert.deepEqual(fake.sent, []);
  assert.deepEqual(fake.executedCommands, ['workbench.action.terminal.paste']);
});

test('clipboardInfoHasImage detects common macOS image clipboard flavors', () => {
  assert.equal(clipboardInfoHasImage('PNGf, 2245, TIFF, 9921'), true);
  assert.equal(clipboardInfoHasImage('public.jpeg, 2245'), true);
  assert.equal(clipboardInfoHasImage('utf8, 12, ut16, 24'), false);
});

test('pathIsVideoFile detects common video extensions', () => {
  assert.equal(pathIsVideoFile('/Users/seongho/Desktop/recording.mov'), true);
  assert.equal(pathIsVideoFile('/Users/seongho/Desktop/clip.MP4'), true);
  assert.equal(pathIsVideoFile('/Users/seongho/Desktop/image.png'), false);
});

test('shellQuotePath quotes paths for terminal insertion', () => {
  assert.equal(shellQuotePath("/tmp/a b/c's.mov"), "'/tmp/a b/c'\\''s.mov'");
});
