const DEFAULT_CWD_COLOR_RULES = [];
const CWD_COLOR_STORAGE_KEY = 'cwdColorByPath';
const HASH_COLOR_PALETTE = [
  'terminal.ansiRed',
  'terminal.ansiGreen',
  'terminal.ansiYellow',
  'terminal.ansiBlue',
  'terminal.ansiMagenta',
  'terminal.ansiCyan',
];

function normalizePath(value) {
  if (!value || typeof value !== 'string') {
    return undefined;
  }

  return value.replace(/\/+$/, '') || '/';
}

function pathMatchesPrefix(cwd, prefix) {
  if (cwd === prefix) {
    return true;
  }

  return cwd.startsWith(`${prefix}/`);
}

function hashString(value) {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function resolveHashColor(cwd) {
  return HASH_COLOR_PALETTE[hashString(cwd) % HASH_COLOR_PALETTE.length];
}

function resolveCwdColor(
  cwd,
  rules = DEFAULT_CWD_COLOR_RULES,
  storedColorByPath = {},
  options = {},
) {
  const normalizedCwd = normalizePath(cwd);
  if (!normalizedCwd) {
    return undefined;
  }

  if (storedColorByPath[normalizedCwd]) {
    return storedColorByPath[normalizedCwd];
  }

  const configuredColor = rules
    .map((rule) => ({
      path: normalizePath(rule.path),
      color: rule.color,
    }))
    .filter((rule) => rule.path && rule.color)
    .filter((rule) => pathMatchesPrefix(normalizedCwd, rule.path))
    .sort((a, b) => b.path.length - a.path.length)[0]?.color;

  if (configuredColor) {
    return configuredColor;
  }

  if (options.hashFallback === false) {
    return undefined;
  }

  return resolveHashColor(normalizedCwd);
}

function getConfiguredRules(vscode) {
  return vscode.workspace
    ?.getConfiguration('codexTerminal')
    ?.get('cwdColorRules', DEFAULT_CWD_COLOR_RULES) ?? DEFAULT_CWD_COLOR_RULES;
}

function getTerminalCwd(terminal) {
  return terminal?.shellIntegration?.cwd?.fsPath;
}

function createTerminalCwdColorManager(vscode, options = {}) {
  const context = options.context;
  const scheduleDelayMs = options.scheduleDelayMs ?? 100;
  const retryDelayMs = options.retryDelayMs ?? 250;
  const maxCwdRetries = options.maxCwdRetries ?? 5;
  const hashFallback = options.hashFallback ?? true;
  const appliedColorByTerminal = new WeakMap();
  const disposables = [];
  const pendingUpdates = new Set();
  let started = false;

  function getStoredColorByPath() {
    return context?.globalState?.get(CWD_COLOR_STORAGE_KEY, {}) ?? {};
  }

  async function rememberCwdColor({ cwd, color } = {}) {
    const normalizedCwds = [
      normalizePath(cwd),
      normalizePath(getTerminalCwd(vscode.window.activeTerminal)),
    ].filter(Boolean);
    const uniqueCwds = [...new Set(normalizedCwds)];

    if (!uniqueCwds.length || !color) {
      return;
    }

    const nextStoredColorByPath = { ...getStoredColorByPath() };
    for (const normalizedCwd of uniqueCwds) {
      nextStoredColorByPath[normalizedCwd] = color;
    }

    await context?.globalState?.update(CWD_COLOR_STORAGE_KEY, nextStoredColorByPath);
    scheduleUpdate(vscode.window.activeTerminal);
  }

  async function updateTerminalColor(terminal, attempt = 0) {
    if (!terminal || vscode.window.activeTerminal !== terminal) {
      return;
    }

    const cwd = getTerminalCwd(terminal);
    if (!cwd) {
      if (attempt < maxCwdRetries) {
        scheduleUpdate(terminal, attempt + 1, retryDelayMs);
      }
      return;
    }

    const color = resolveCwdColor(cwd, getConfiguredRules(vscode), getStoredColorByPath(), {
      hashFallback,
    });
    const previousColor = appliedColorByTerminal.get(terminal);
    const nextColor = color ?? null;

    if (previousColor === nextColor) {
      return;
    }

    if (nextColor) {
      await vscode.commands.executeCommand(
        'workbench.action.terminal.changeColorActiveTab',
        nextColor,
      );
    } else if (previousColor) {
      await vscode.commands.executeCommand(
        'workbench.action.terminal.changeColorActiveTab',
        null,
      );
    }

    appliedColorByTerminal.set(terminal, nextColor);
  }

  function scheduleUpdate(terminal, attempt = 0, delayMs = scheduleDelayMs) {
    const pending = new Promise((resolve) => {
      setTimeout(resolve, delayMs);
    })
      .then(() => updateTerminalColor(terminal, attempt))
      .finally(() => pendingUpdates.delete(pending));

    pendingUpdates.add(pending);
    return pending;
  }

  function start() {
    if (started) {
      return;
    }

    started = true;

    if (vscode.window.onDidEndTerminalShellExecution) {
      disposables.push(
        vscode.window.onDidEndTerminalShellExecution((event) => {
          scheduleUpdate(event.terminal);
        }),
      );
    }

    if (vscode.window.onDidChangeTerminalShellIntegration) {
      disposables.push(
        vscode.window.onDidChangeTerminalShellIntegration((event) => {
          scheduleUpdate(event.terminal);
        }),
      );
    }

    if (vscode.window.onDidChangeActiveTerminal) {
      disposables.push(
        vscode.window.onDidChangeActiveTerminal((terminal) => {
          scheduleUpdate(terminal);
        }),
      );
    }

    scheduleUpdate(vscode.window.activeTerminal);
  }

  async function flush() {
    while (pendingUpdates.size) {
      await Promise.all([...pendingUpdates]);
    }
  }

  function dispose() {
    for (const disposable of disposables.splice(0)) {
      disposable.dispose();
    }
    started = false;
  }

  return {
    dispose,
    flush,
    rememberCwdColor,
    start,
  };
}

module.exports = {
  DEFAULT_CWD_COLOR_RULES,
  HASH_COLOR_PALETTE,
  createTerminalCwdColorManager,
  resolveCwdColor,
};
