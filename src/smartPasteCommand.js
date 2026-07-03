const childProcess = require('node:child_process');
const path = require('node:path');

const CTRL_V = '\x16';
const DEFAULT_TERMINAL_PASTE_COMMAND = 'workbench.action.terminal.paste';
const VIDEO_FILE_EXTENSIONS = new Set([
  '.3gp',
  '.avi',
  '.m4v',
  '.mkv',
  '.mov',
  '.mp4',
  '.mpeg',
  '.mpg',
  '.webm',
]);
const IMAGE_CLIPBOARD_PATTERNS = [
  /\bPNGf\b/i,
  /\bTIFF\b/i,
  /\bJPEG\b/i,
  /\bGIFf\b/i,
  /\bpublic\.png\b/i,
  /\bpublic\.tiff\b/i,
  /\bpublic\.jpeg\b/i,
  /\bpublic\.heic\b/i,
];

function clipboardInfoHasImage(output) {
  return IMAGE_CLIPBOARD_PATTERNS.some((pattern) => pattern.test(output || ''));
}

function pathIsVideoFile(filePath) {
  return VIDEO_FILE_EXTENSIONS.has(path.extname(filePath || '').toLowerCase());
}

function shellQuotePath(filePath) {
  return `'${String(filePath).replace(/'/g, "'\\''")}'`;
}

function execFileText(execFile, command, args, options) {
  return new Promise((resolve, reject) => {
    execFile(command, args, options, (error, stdout, stderr) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(`${stdout || ''}${stderr || ''}`);
    });
  });
}

function createMacClipboardVideoFileDetector({
  execFile = childProcess.execFile,
  platform = process.platform,
} = {}) {
  return async function getClipboardVideoFilePath() {
    if (platform !== 'darwin') {
      return undefined;
    }

    const output = await execFileText(
      execFile,
      'osascript',
      [
        '-e',
        'try',
        '-e',
        'POSIX path of (the clipboard as «class furl»)',
        '-e',
        'on error',
        '-e',
        '""',
        '-e',
        'end try',
      ],
      {
        maxBuffer: 1024 * 1024,
        timeout: 1000,
      },
    );
    const filePath = output.trim();

    return pathIsVideoFile(filePath) ? filePath : undefined;
  };
}

function createMacClipboardImageDetector({
  execFile = childProcess.execFile,
  platform = process.platform,
} = {}) {
  return async function hasClipboardImage() {
    if (platform !== 'darwin') {
      return false;
    }

    const output = await execFileText(execFile, 'osascript', ['-e', 'clipboard info'], {
      maxBuffer: 1024 * 1024,
      timeout: 1000,
    });

    return clipboardInfoHasImage(output);
  };
}

function createSmartPasteCommand(
  vscode,
  {
    getClipboardVideoFilePath = createMacClipboardVideoFileDetector(),
    hasClipboardImage = createMacClipboardImageDetector(),
    terminalPasteCommand = DEFAULT_TERMINAL_PASTE_COMMAND,
  } = {},
) {
  return async function smartPaste() {
    let clipboardVideoFilePath;
    let clipboardHasImage = false;

    try {
      clipboardVideoFilePath = await getClipboardVideoFilePath();
    } catch {
      clipboardVideoFilePath = undefined;
    }

    if (clipboardVideoFilePath && vscode.window.activeTerminal) {
      vscode.window.activeTerminal.sendText(shellQuotePath(clipboardVideoFilePath), false);
      return;
    }

    try {
      clipboardHasImage = await hasClipboardImage();
    } catch {
      clipboardHasImage = false;
    }

    if (clipboardHasImage && vscode.window.activeTerminal) {
      vscode.window.activeTerminal.sendText(CTRL_V, false);
      return;
    }

    await vscode.commands.executeCommand(terminalPasteCommand);
  };
}

module.exports = {
  clipboardInfoHasImage,
  createMacClipboardImageDetector,
  createMacClipboardVideoFileDetector,
  createSmartPasteCommand,
  pathIsVideoFile,
  shellQuotePath,
};
