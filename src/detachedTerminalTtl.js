const { execFile } = require('node:child_process');

const DEFAULT_TTL_MS = 60 * 60 * 1000;
const DEFAULT_SWEEP_INTERVAL_MS = 60 * 1000;
const DEFAULT_KILL_GRACE_MS = 2500;
const STORAGE_KEY = 'codexTerminal.detachedTerminalTtl.records';

function defaultSleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function createGlobalStateStorage(context) {
  return {
    async getRecords() {
      return context.globalState.get(STORAGE_KEY, []);
    },
    async setRecords(records) {
      await context.globalState.update(STORAGE_KEY, records);
    },
  };
}

function normalizePid(pid) {
  const parsed = Number(pid);
  return Number.isSafeInteger(parsed) && parsed > 1 ? parsed : undefined;
}

async function getTerminalPid(terminal) {
  if (!terminal) {
    return undefined;
  }

  const pid = await terminal.processId;
  return normalizePid(pid);
}

function normalizeRecords(records) {
  const unique = new Map();

  for (const record of Array.isArray(records) ? records : []) {
    const pid = normalizePid(record && record.pid);
    const detachedAt = Number(record && record.detachedAt);
    const expiresAt = Number(record && record.expiresAt);

    if (!pid || !Number.isFinite(detachedAt) || !Number.isFinite(expiresAt)) {
      continue;
    }

    unique.set(pid, {
      pid,
      detachedAt,
      expiresAt,
      title: typeof record.title === 'string' ? record.title : '',
    });
  }

  return Array.from(unique.values()).sort((a, b) => a.detachedAt - b.detachedAt);
}

function execFileText(file, args, execFileImpl = execFile) {
  return new Promise((resolve, reject) => {
    execFileImpl(file, args, { encoding: 'utf8' }, (error, stdout) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(stdout);
    });
  });
}

function parsePsRows(stdout) {
  return String(stdout)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [pid, ppid] = line.split(/\s+/).map(Number);
      return { pid, ppid };
    })
    .filter((row) => normalizePid(row.pid) && normalizePid(row.ppid));
}

function collectDescendantPids(rows, rootPid) {
  const childrenByParent = new Map();

  for (const row of rows) {
    if (!childrenByParent.has(row.ppid)) {
      childrenByParent.set(row.ppid, []);
    }
    childrenByParent.get(row.ppid).push(row.pid);
  }

  const descendants = [];
  const visit = (pid) => {
    for (const childPid of childrenByParent.get(pid) || []) {
      visit(childPid);
      descendants.push(childPid);
    }
  };

  visit(rootPid);
  return descendants;
}

function isProcessAlive(pid, processApi = process) {
  try {
    processApi.kill(pid, 0);
    return true;
  } catch (error) {
    return error && error.code !== 'ESRCH';
  }
}

function signalProcess(pid, signal, processApi = process) {
  try {
    processApi.kill(pid, signal);
    return true;
  } catch (error) {
    return Boolean(error && error.code === 'ESRCH');
  }
}

function createDefaultKillTree({
  execFileImpl = execFile,
  processApi = process,
  sleep = defaultSleep,
  killGraceMs = DEFAULT_KILL_GRACE_MS,
} = {}) {
  return async function killTree(pid) {
    const rootPid = normalizePid(pid);
    if (!rootPid || !isProcessAlive(rootPid, processApi)) {
      return true;
    }

    let descendants = [];
    try {
      const psOutput = await execFileText('ps', ['-axo', 'pid=', 'ppid='], execFileImpl);
      descendants = collectDescendantPids(parsePsRows(psOutput), rootPid);
    } catch {
      descendants = [];
    }

    const pids = [...descendants, rootPid];
    let termOk = true;
    for (const currentPid of pids) {
      termOk = signalProcess(currentPid, 'SIGTERM', processApi) && termOk;
    }

    await sleep(killGraceMs);

    let killOk = true;
    for (const currentPid of pids) {
      if (isProcessAlive(currentPid, processApi)) {
        killOk = signalProcess(currentPid, 'SIGKILL', processApi) && killOk;
      }
    }

    return termOk && killOk;
  };
}

function createDetachedTerminalTtlManager(vscode, options = {}) {
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  const sweepIntervalMs = options.sweepIntervalMs ?? DEFAULT_SWEEP_INTERVAL_MS;
  const now = options.now ?? Date.now;
  const storage = options.storage ?? createGlobalStateStorage(options.context);
  const setIntervalFn = options.setInterval ?? setInterval;
  const clearIntervalFn = options.clearInterval ?? clearInterval;
  const startTimers = options.startTimers ?? true;
  const log = options.log ?? console;
  const killTree =
    options.killTree ??
    createDefaultKillTree({
      execFileImpl: options.execFile,
      processApi: options.processApi,
      sleep: options.sleep,
      killGraceMs: options.killGraceMs,
    });

  let interval;
  let openedTerminalSubscription;

  async function readRecords() {
    return normalizeRecords(await storage.getRecords());
  }

  async function writeRecords(records) {
    await storage.setRecords(normalizeRecords(records));
  }

  async function recordDetachedTerminal(terminal, pid) {
    const detachedAt = now();
    const records = (await readRecords()).filter((record) => record.pid !== pid);
    records.push({
      pid,
      detachedAt,
      expiresAt: detachedAt + ttlMs,
      title: typeof terminal.name === 'string' ? terminal.name : '',
    });
    await writeRecords(records);
  }

  async function removePid(pid) {
    const normalizedPid = normalizePid(pid);
    if (!normalizedPid) {
      return;
    }

    await writeRecords((await readRecords()).filter((record) => record.pid !== normalizedPid));
  }

  async function removeTerminalPid(terminal) {
    const pid = await getTerminalPid(terminal);
    await removePid(pid);
  }

  async function detachActiveTerminal() {
    const terminal = vscode.window.activeTerminal;
    if (!terminal) {
      vscode.window.showWarningMessage('No active terminal is available.');
      return;
    }

    const pid = await getTerminalPid(terminal);
    await vscode.commands.executeCommand('workbench.action.terminal.detachSession');

    if (!pid) {
      vscode.window.showWarningMessage(
        'Detached terminal PID was not available; TTL cleanup cannot track this session.',
      );
      return;
    }

    await recordDetachedTerminal(terminal, pid);
  }

  async function attachDetachedTerminal() {
    await vscode.commands.executeCommand('workbench.action.terminal.attachToSession');
    await removeTerminalPid(vscode.window.activeTerminal);
  }

  async function killRecords(records) {
    const keep = [];

    for (const record of records) {
      try {
        if (!(await killTree(record.pid))) {
          keep.push(record);
        }
      } catch (error) {
        log.warn?.(`Failed to kill detached terminal pid ${record.pid}`, error);
        keep.push(record);
      }
    }

    await writeRecords(keep);
  }

  async function sweepExpired() {
    const currentTime = now();
    const records = await readRecords();
    const expired = records.filter((record) => record.expiresAt <= currentTime);
    const fresh = records.filter((record) => record.expiresAt > currentTime);

    if (expired.length === 0) {
      await writeRecords(fresh);
      return;
    }

    const failed = [];
    for (const record of expired) {
      try {
        if (!(await killTree(record.pid))) {
          failed.push(record);
        }
      } catch (error) {
        log.warn?.(`Failed to kill expired detached terminal pid ${record.pid}`, error);
        failed.push(record);
      }
    }

    await writeRecords([...fresh, ...failed]);
  }

  async function killAllTracked() {
    await killRecords(await readRecords());
  }

  async function killAllTerminalState() {
    for (const terminal of vscode.window.terminals || []) {
      terminal.dispose();
    }

    await killAllTracked();
  }

  function stopForExtensionShutdown() {
    dispose();
  }

  function start() {
    if (!openedTerminalSubscription && vscode.window.onDidOpenTerminal) {
      openedTerminalSubscription = vscode.window.onDidOpenTerminal((terminal) =>
        removeTerminalPid(terminal).catch((error) => {
          log.warn?.('Failed to remove reattached terminal from TTL registry', error);
        }),
      );
    }

    if (startTimers && !interval) {
      interval = setIntervalFn(() => {
        sweepExpired().catch((error) => {
          log.warn?.('Failed to sweep expired detached terminals', error);
        });
      }, sweepIntervalMs);
      interval.unref?.();
      sweepExpired().catch((error) => {
        log.warn?.('Failed to sweep expired detached terminals', error);
      });
    }
  }

  function dispose() {
    if (interval) {
      clearIntervalFn(interval);
      interval = undefined;
    }

    openedTerminalSubscription?.dispose();
    openedTerminalSubscription = undefined;
  }

  return {
    start,
    dispose,
    detachActiveTerminal,
    attachDetachedTerminal,
    sweepExpired,
    killAllTracked,
    killAllTerminalState,
    stopForExtensionShutdown,
    removeTerminalPid,
  };
}

module.exports = {
  DEFAULT_TTL_MS,
  STORAGE_KEY,
  collectDescendantPids,
  createDefaultKillTree,
  createDetachedTerminalTtlManager,
  parsePsRows,
};
