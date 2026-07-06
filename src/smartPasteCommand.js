const childProcess = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

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

function defaultClipboardImagePath({ now = Date.now, tmpdir = os.tmpdir } = {}) {
  const timestamp = new Date(now()).toISOString().replace(/[:.]/g, '-');
  return path.join(
    tmpdir(),
    'codex-vscode-terminal-tools',
    `clipboard-image-${timestamp}-${process.pid}.png`,
  );
}

function createMacClipboardImageFileWriter({
  execFile = childProcess.execFile,
  platform = process.platform,
  now = Date.now,
  tmpdir = os.tmpdir,
} = {}) {
  return async function writeClipboardImageFile() {
    if (platform !== 'darwin') {
      return undefined;
    }

    const imagePath = defaultClipboardImagePath({ now, tmpdir });
    fs.mkdirSync(path.dirname(imagePath), { recursive: true });
    await execFileText(
      execFile,
      'osascript',
      [
        '-e',
        'set outputPath to POSIX file (system attribute "CODEX_VSCODE_CLIPBOARD_IMAGE_PATH")',
        '-e',
        'try',
        '-e',
        'set pngData to the clipboard as «class PNGf»',
        '-e',
        'set fileRef to open for access outputPath with write permission',
        '-e',
        'set eof fileRef to 0',
        '-e',
        'write pngData to fileRef',
        '-e',
        'close access fileRef',
        '-e',
        'on error errMsg number errNum',
        '-e',
        'try',
        '-e',
        'close access outputPath',
        '-e',
        'end try',
        '-e',
        'error errMsg number errNum',
        '-e',
        'end try',
      ],
      {
        env: {
          ...process.env,
          CODEX_VSCODE_CLIPBOARD_IMAGE_PATH: imagePath,
        },
        maxBuffer: 1024 * 1024,
        timeout: 1000,
      },
    );

    return imagePath;
  };
}

function createSmartPasteCommand(
  vscode,
  {
    getClipboardVideoFilePath = createMacClipboardVideoFileDetector(),
    hasClipboardImage = createMacClipboardImageDetector(),
    writeClipboardImageFile = createMacClipboardImageFileWriter(),
    terminalPasteCommand = DEFAULT_TERMINAL_PASTE_COMMAND,
  } = {},
) {
  return async function smartPaste() {
    let clipboardVideoFilePath;
    let clipboardHasImage = false;
    let clipboardImageFilePath;

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
      try {
        clipboardImageFilePath = await writeClipboardImageFile();
      } catch {
        clipboardImageFilePath = undefined;
      }

      if (clipboardImageFilePath) {
        vscode.window.activeTerminal.sendText(String(clipboardImageFilePath), false);
        return;
      }
    }

    await vscode.commands.executeCommand(terminalPasteCommand);
  };
}

module.exports = {
  clipboardInfoHasImage,
  createMacClipboardImageFileWriter,
  createMacClipboardImageDetector,
  createMacClipboardVideoFileDetector,
  createSmartPasteCommand,
  pathIsVideoFile,
  shellQuotePath,
};
