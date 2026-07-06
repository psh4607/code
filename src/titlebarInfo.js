const childProcess = require('node:child_process');
const path = require('node:path');

const CODEX_TITLEBAR_INFO_CONTEXT_KEY = 'codexTitlebarInfo';
const CODEX_TITLEBAR_INFO_TITLE_VARIABLE = 'codexTitlebarInfo';
const DEFAULT_REFRESH_INTERVAL_MS = 30000;
const DEFAULT_COMMAND_TIMEOUT_MS = 1500;
const DEFAULT_PR_COMMAND_TIMEOUT_MS = 2500;

function cleanSegment(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function formatTitlebarInfo({ folderName, branch, pullRequestNumber } = {}) {
  const segments = [cleanSegment(folderName), cleanSegment(branch)];
  const prNumber = cleanSegment(pullRequestNumber);

  if (prNumber) {
    segments.push(`PR #${prNumber.replace(/^#/, '')}`);
  }

  return segments.filter(Boolean).join(' | ');
}

function findActiveWorkspaceFolder(vscode) {
  const activeUri = vscode.window.activeTextEditor?.document?.uri;
  if (activeUri && typeof vscode.workspace.getWorkspaceFolder === 'function') {
    const folder = vscode.workspace.getWorkspaceFolder(activeUri);
    if (folder) {
      return folder;
    }
  }

  return vscode.workspace.workspaceFolders?.[0];
}

function createDefaultRunCommand({ execFile = childProcess.execFile } = {}) {
  return (command, args, options = {}) =>
    new Promise((resolve, reject) => {
      execFile(
        command,
        args,
        {
          cwd: options.cwd,
          timeout: options.timeoutMs ?? DEFAULT_COMMAND_TIMEOUT_MS,
          windowsHide: true,
        },
        (error, stdout) => {
          if (error) {
            reject(error);
            return;
          }

          resolve(String(stdout ?? '').trim());
        },
      );
    });
}

async function readOptionalCommand(command, args, options, runCommand) {
  try {
    return cleanSegment(await runCommand(command, args, options));
  } catch {
    return '';
  }
}

async function readGitRoot(folderPath, runCommand) {
  const root = await readOptionalCommand(
    'git',
    ['rev-parse', '--show-toplevel'],
    { cwd: folderPath },
    runCommand,
  );
  return root || folderPath;
}

async function readGitBranch(repoPath, runCommand) {
  const branch = await readOptionalCommand(
    'git',
    ['branch', '--show-current'],
    { cwd: repoPath },
    runCommand,
  );
  if (branch) {
    return branch;
  }

  const ref = await readOptionalCommand(
    'git',
    ['rev-parse', '--abbrev-ref', 'HEAD'],
    { cwd: repoPath },
    runCommand,
  );
  return ref && ref !== 'HEAD' ? ref : '';
}

async function readPullRequestNumber(repoPath, runCommand) {
  const number = await readOptionalCommand(
    'gh',
    ['pr', 'view', '--json', 'number,url', '--jq', '.number'],
    { cwd: repoPath, timeoutMs: DEFAULT_PR_COMMAND_TIMEOUT_MS },
    runCommand,
  );
  return /^\d+$/.test(number) ? number : '';
}

async function resolveTitlebarInfo({ folder, runCommand = createDefaultRunCommand() } = {}) {
  if (!folder) {
    return '';
  }

  const folderPath = folder.uri?.fsPath;
  const folderName = cleanSegment(folder.name) || (folderPath ? path.basename(folderPath) : '');
  if (!folderPath) {
    return formatTitlebarInfo({ folderName });
  }

  const repoPath = await readGitRoot(folderPath, runCommand);
  const branch = await readGitBranch(repoPath, runCommand);
  const pullRequestNumber = branch ? await readPullRequestNumber(repoPath, runCommand) : '';

  return formatTitlebarInfo({
    folderName,
    branch,
    pullRequestNumber,
  });
}

function createTitlebarInfoManager(vscode, options = {}) {
  const runCommand = options.runCommand ?? createDefaultRunCommand({ execFile: options.execFile });
  const setIntervalFn = options.setInterval ?? setInterval;
  const clearIntervalFn = options.clearInterval ?? clearInterval;
  const refreshIntervalMs = options.refreshIntervalMs ?? DEFAULT_REFRESH_INTERVAL_MS;
  const startTimers = options.startTimers ?? true;
  const log = options.log ?? console;

  const disposables = [];
  const pendingTasks = new Set();
  let interval;
  let started = false;
  let updateSequence = 0;
  let registeredTitleVariable = false;

  function track(task) {
    const pending = Promise.resolve(task).finally(() => {
      pendingTasks.delete(pending);
    });
    pendingTasks.add(pending);
    return pending;
  }

  function runTracked(label, fn) {
    return track(
      Promise.resolve()
        .then(fn)
        .catch((error) => {
          log.warn?.(`Failed to ${label}`, error);
        }),
    );
  }

  async function registerTitleVariable() {
    if (registeredTitleVariable) {
      return;
    }

    try {
      await vscode.commands.executeCommand(
        'registerWindowTitleVariable',
        CODEX_TITLEBAR_INFO_TITLE_VARIABLE,
        CODEX_TITLEBAR_INFO_CONTEXT_KEY,
      );
      registeredTitleVariable = true;
    } catch (error) {
      log.warn?.('Failed to register VS Code titlebar info variable', error);
    }
  }

  async function publishTitlebarInfo(value) {
    await vscode.commands.executeCommand(
      'setContext',
      CODEX_TITLEBAR_INFO_CONTEXT_KEY,
      value || '',
    );
  }

  async function updateNow() {
    const sequence = ++updateSequence;
    const folder = findActiveWorkspaceFolder(vscode);
    const value = await resolveTitlebarInfo({ folder, runCommand });
    if (sequence === updateSequence) {
      await publishTitlebarInfo(value);
    }
  }

  function scheduleUpdate() {
    return runTracked('update VS Code titlebar info', updateNow);
  }

  function start() {
    if (started) {
      return;
    }

    started = true;
    runTracked('initialize VS Code titlebar info', async () => {
      await registerTitleVariable();
      await updateNow();
    });

    if (vscode.window.onDidChangeActiveTextEditor) {
      disposables.push(vscode.window.onDidChangeActiveTextEditor(scheduleUpdate));
    }

    if (vscode.workspace.onDidChangeWorkspaceFolders) {
      disposables.push(vscode.workspace.onDidChangeWorkspaceFolders(scheduleUpdate));
    }

    if (startTimers) {
      interval = setIntervalFn(scheduleUpdate, refreshIntervalMs);
      interval?.unref?.();
    }
  }

  async function flush() {
    while (pendingTasks.size) {
      await Promise.all([...pendingTasks]);
    }
  }

  function dispose() {
    for (const disposable of disposables.splice(0)) {
      disposable.dispose();
    }

    if (interval) {
      clearIntervalFn(interval);
      interval = undefined;
    }

    started = false;
  }

  return {
    dispose,
    flush,
    start,
    updateNow,
  };
}

module.exports = {
  CODEX_TITLEBAR_INFO_CONTEXT_KEY,
  CODEX_TITLEBAR_INFO_TITLE_VARIABLE,
  createDefaultRunCommand,
  createTitlebarInfoManager,
  findActiveWorkspaceFolder,
  formatTitlebarInfo,
  resolveTitlebarInfo,
};
