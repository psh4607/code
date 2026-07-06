const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  clipboardInfoHasImage,
  createMacClipboardImageFileWriter,
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

test('smart paste writes image clipboard to a temp PNG path and inserts the path', async () => {
  const fake = createFakeVscode();

  await createSmartPasteCommand(fake.vscode, {
    async getClipboardVideoFilePath() {
      return undefined;
    },
    async hasClipboardImage() {
      return true;
    },
    async writeClipboardImageFile() {
      return '/tmp/codex-vscode-clipboard-image.png';
    },
  })();

  assert.deepEqual(fake.sent, [['/tmp/codex-vscode-clipboard-image.png', false]]);
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

test('smart paste falls back to VS Code terminal paste when saving the image fails', async () => {
  const fake = createFakeVscode();

  await createSmartPasteCommand(fake.vscode, {
    async getClipboardVideoFilePath() {
      return undefined;
    },
    async hasClipboardImage() {
      return true;
    },
    async writeClipboardImageFile() {
      throw new Error('clipboard write failed');
    },
  })();

  assert.deepEqual(fake.sent, []);
  assert.deepEqual(fake.executedCommands, ['workbench.action.terminal.paste']);
});

test('mac clipboard image writer exports the PNG clipboard flavor to a temp path', async () => {
  const calls = [];
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-smart-paste-test-'));
  const writeClipboardImageFile = createMacClipboardImageFileWriter({
    execFile(command, args, options, callback) {
      calls.push({ command, args, options });
      callback(null, '', '');
    },
    platform: 'darwin',
    tmpdir() {
      return tmpDir;
    },
    now() {
      return 1783314000123;
    },
  });

  const imagePath = await writeClipboardImageFile();

  assert.equal(path.dirname(imagePath), path.join(tmpDir, 'codex-vscode-terminal-tools'));
  assert.match(path.basename(imagePath), /^clipboard-image-2026-07-06T05-00-00-123Z-\d+\.png$/);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].command, 'osascript');
  assert.equal(calls[0].options.env.CODEX_VSCODE_CLIPBOARD_IMAGE_PATH, imagePath);
  assert.equal(calls[0].args.includes('set pngData to the clipboard as «class PNGf»'), true);
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
