const childProcess = require('node:child_process');
const path = require('node:path');

const CODEX_TITLEBAR_INFO_CONTEXT_KEY = 'codexTitlebarInfo';
const CODEX_TITLEBAR_INFO_TITLE_VARIABLE = 'codexTitlebarInfo';
const CODEX_TERMINAL_HAS_PULL_REQUEST_CONTEXT_KEY = 'codexTerminal.hasPullRequest';
const OPEN_CURRENT_PULL_REQUEST_COMMAND = 'codexTerminal.openCurrentPullRequest';
const RENAME_TERMINAL_COMMAND = 'workbench.action.terminal.renameWithArg';
const DEFAULT_REFRESH_INTERVAL_MS = 30000;
const DEFAULT_COMMAND_TIMEOUT_MS = 1500;
const DEFAULT_PR_COMMAND_TIMEOUT_MS = 2500;
const DEFAULT_PR_CACHE_TTL_MS = 5 * 60 * 1000;

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

function getTerminalCwd(terminal) {
  return terminal?.shellIntegration?.cwd?.fsPath;
}

function pathIsInside(parentPath, candidatePath) {
  const relative = path.relative(parentPath, candidatePath);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function findWorkspaceFolderForPath(vscode, folderPath) {
  if (!folderPath) {
    return undefined;
  }

  const workspaceFolders = vscode.workspace.workspaceFolders ?? [];
  return workspaceFolders.find((folder) => pathIsInside(folder.uri.fsPath, folderPath));
}

function createFolderFromPath(folderPath) {
  return {
    name: path.basename(folderPath),
    uri: {
      fsPath: folderPath,
      scheme: 'file',
    },
  };
}

function findTitlebarInfoFolder(vscode) {
  const terminalCwd = getTerminalCwd(vscode.window.activeTerminal);
  if (terminalCwd) {
    return findWorkspaceFolderForPath(vscode, terminalCwd) ?? createFolderFromPath(terminalCwd);
  }

  return findActiveWorkspaceFolder(vscode);
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

function normalizePullRequestInfo(value) {
  if (!value) {
    return undefined;
  }

  if (typeof value === 'string' || typeof value === 'number') {
    const number = cleanSegment(value).replace(/^#/, '');
    return /^\d+$/.test(number) ? { number } : undefined;
  }

  const number = cleanSegment(value.number).replace(/^#/, '');
  if (!/^\d+$/.test(number)) {
    return undefined;
  }

  return {
    isDraft: Boolean(value.isDraft),
    number,
    state: cleanSegment(value.state),
    url: cleanSegment(value.url),
  };
}

async function readPullRequestInfo(repoPath, runCommand) {
  const output = await readOptionalCommand(
    'gh',
    ['pr', 'view', '--json', 'number,url,state,isDraft'],
    { cwd: repoPath, timeoutMs: DEFAULT_PR_COMMAND_TIMEOUT_MS },
    runCommand,
  );
  if (!output) {
    return undefined;
  }

  try {
    return normalizePullRequestInfo(JSON.parse(output));
  } catch {
    return normalizePullRequestInfo(output);
  }
}

async function readPullRequestNumber(repoPath, runCommand) {
  return (await readPullRequestInfo(repoPath, runCommand))?.number ?? '';
}

function createPullRequestInfoReader({
  runCommand,
  ttlMs = DEFAULT_PR_CACHE_TTL_MS,
  now = Date.now,
} = {}) {
  const cache = new Map();
  const inFlightReads = new Map();

  return async function readPullRequestInfoForBranch(repoPath, branch) {
    const key = `${repoPath}\0${branch}`;
    const currentTime = now();
    const cached = cache.get(key);
    if (ttlMs > 0 && cached && cached.expiresAt > currentTime) {
      return cached.value;
    }

    const inFlightRead = inFlightReads.get(key);
    if (inFlightRead) {
      return inFlightRead;
    }

    const pendingRead = readPullRequestInfo(repoPath, runCommand)
      .then((value) => {
        if (ttlMs > 0) {
          cache.set(key, {
            expiresAt: now() + ttlMs,
            value,
          });
        }
        return value;
      })
      .finally(() => {
        inFlightReads.delete(key);
      });

    inFlightReads.set(key, pendingRead);
    return pendingRead;
  };
}

async function resolveTitlebarContext({
  folder,
  runCommand = createDefaultRunCommand(),
  readPullRequestInfoForBranch,
  readPullRequestNumberForBranch,
} = {}) {
  if (!folder) {
    return {
      text: '',
    };
  }

  const folderPath = folder.uri?.fsPath;
  const folderName = cleanSegment(folder.name) || (folderPath ? path.basename(folderPath) : '');
  if (!folderPath) {
    return {
      folderName,
      text: formatTitlebarInfo({ folderName }),
    };
  }

  const repoPath = await readGitRoot(folderPath, runCommand);
  const branch = await readGitBranch(repoPath, runCommand);
  const pullRequestInfo = branch
    ? await (readPullRequestInfoForBranch
        ? readPullRequestInfoForBranch(repoPath, branch)
        : readPullRequestNumberForBranch
          ? normalizePullRequestInfo(await readPullRequestNumberForBranch(repoPath, branch))
          : readPullRequestInfo(repoPath, runCommand))
    : undefined;

  const text = formatTitlebarInfo({
    folderName,
    branch,
    pullRequestNumber: pullRequestInfo?.number,
  });

  return {
    branch,
    folderName,
    folderPath,
    pullRequestInfo,
    repoPath,
    text,
  };
}

async function resolveTitlebarInfo(options = {}) {
  return (await resolveTitlebarContext(options)).text;
}

function stripManagedPullRequestPrefix(value) {
  return cleanSegment(value).replace(/^PR #\d+\s+·\s+/, '');
}

function formatTerminalPullRequestName({ baseName, pullRequestInfo } = {}) {
  const number = pullRequestInfo?.number;
  if (!number) {
    return cleanSegment(baseName);
  }

  const cleanedBaseName = stripManagedPullRequestPrefix(baseName) || `PR #${number}`;
  return `PR #${number} · ${cleanedBaseName}`;
}

function formatPullRequestStatusTooltip(pullRequestInfo) {
  if (!pullRequestInfo?.number) {
    return '';
  }

  const draftPrefix = pullRequestInfo.isDraft ? 'draft ' : '';
  return `Open ${draftPrefix}PR #${pullRequestInfo.number}`;
}

function createTitlebarInfoManager(vscode, options = {}) {
  const runCommand = options.runCommand ?? createDefaultRunCommand({ execFile: options.execFile });
  const setIntervalFn = options.setInterval ?? setInterval;
  const clearIntervalFn = options.clearInterval ?? clearInterval;
  const refreshIntervalMs = options.refreshIntervalMs ?? DEFAULT_REFRESH_INTERVAL_MS;
  const readPullRequestInfoForBranch = createPullRequestInfoReader({
    runCommand,
    ttlMs: options.prCacheTtlMs ?? DEFAULT_PR_CACHE_TTL_MS,
    now: options.now ?? Date.now,
  });
  const startTimers = options.startTimers ?? true;
  const log = options.log ?? console;
  const statusBarItem =
    options.statusBarItem ??
    vscode.window.createStatusBarItem?.(vscode.StatusBarAlignment?.Left, 100);

  const disposables = [];
  const pendingTasks = new Set();
  const terminalBaseNames = new WeakMap();
  let interval;
  let started = false;
  let updateSequence = 0;
  let registeredTitleVariable = false;
  let currentPullRequestInfo;

  if (statusBarItem) {
    disposables.push(statusBarItem);
  }

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

  async function publishPullRequestInfo(pullRequestInfo) {
    currentPullRequestInfo = pullRequestInfo?.url ? pullRequestInfo : undefined;
    await vscode.commands.executeCommand(
      'setContext',
      CODEX_TERMINAL_HAS_PULL_REQUEST_CONTEXT_KEY,
      Boolean(currentPullRequestInfo),
    );

    if (!statusBarItem) {
      return;
    }

    if (currentPullRequestInfo) {
      statusBarItem.text = `$(git-pull-request) PR #${currentPullRequestInfo.number}`;
      statusBarItem.tooltip = formatPullRequestStatusTooltip(currentPullRequestInfo);
      statusBarItem.command = OPEN_CURRENT_PULL_REQUEST_COMMAND;
      statusBarItem.show();
    } else {
      statusBarItem.hide();
    }
  }

  async function updateActiveTerminalName(pullRequestInfo) {
    const terminal = vscode.window.activeTerminal;
    if (!terminal || !vscode.commands.executeCommand) {
      return;
    }

    if (pullRequestInfo?.number) {
      if (!terminalBaseNames.has(terminal)) {
        terminalBaseNames.set(
          terminal,
          stripManagedPullRequestPrefix(terminal.name) || 'terminal',
        );
      }

      const nextName = formatTerminalPullRequestName({
        baseName: terminalBaseNames.get(terminal),
        pullRequestInfo,
      });
      if (terminal.name !== nextName) {
        await vscode.commands.executeCommand(RENAME_TERMINAL_COMMAND, { name: nextName });
      }
      return;
    }

    const baseName = terminalBaseNames.get(terminal);
    if (baseName) {
      terminalBaseNames.delete(terminal);
      if (terminal.name !== baseName) {
        await vscode.commands.executeCommand(RENAME_TERMINAL_COMMAND, { name: baseName });
      }
    }
  }

  async function updateNow() {
    const sequence = ++updateSequence;
    const folder = findTitlebarInfoFolder(vscode);
    const context = await resolveTitlebarContext({
      folder,
      readPullRequestInfoForBranch,
      runCommand,
    });
    if (sequence === updateSequence) {
      await publishTitlebarInfo(context.text);
      await publishPullRequestInfo(context.pullRequestInfo);
      await updateActiveTerminalName(context.pullRequestInfo);
    }
  }

  async function openCurrentPullRequest() {
    if (!currentPullRequestInfo?.url) {
      return false;
    }

    const uri = vscode.Uri?.parse
      ? vscode.Uri.parse(currentPullRequestInfo.url)
      : currentPullRequestInfo.url;
    await vscode.env?.openExternal?.(uri);
    return true;
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

    if (vscode.window.onDidChangeActiveTerminal) {
      disposables.push(vscode.window.onDidChangeActiveTerminal(scheduleUpdate));
    }

    if (vscode.window.onDidChangeTerminalShellIntegration) {
      disposables.push(vscode.window.onDidChangeTerminalShellIntegration(scheduleUpdate));
    }

    if (vscode.window.onDidEndTerminalShellExecution) {
      disposables.push(vscode.window.onDidEndTerminalShellExecution(scheduleUpdate));
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
    openCurrentPullRequest,
    start,
    updateNow,
  };
}

module.exports = {
  CODEX_TITLEBAR_INFO_CONTEXT_KEY,
  CODEX_TITLEBAR_INFO_TITLE_VARIABLE,
  CODEX_TERMINAL_HAS_PULL_REQUEST_CONTEXT_KEY,
  OPEN_CURRENT_PULL_REQUEST_COMMAND,
  createDefaultRunCommand,
  createTitlebarInfoManager,
  findActiveWorkspaceFolder,
  findTitlebarInfoFolder,
  formatTerminalPullRequestName,
  formatTitlebarInfo,
  resolveTitlebarContext,
  resolveTitlebarInfo,
  stripManagedPullRequestPrefix,
};
