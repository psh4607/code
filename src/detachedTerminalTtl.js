const { execFile } = require('node:child_process');

const DEFAULT_TTL_MS = 60 * 60 * 1000;
const DEFAULT_HISTORY_RETENTION_MS = 6 * 60 * 60 * 1000;
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

function normalizeTimestamp(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
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

    const normalizedRecord = {
      pid,
      detachedAt,
      expiresAt,
      title: typeof record.title === 'string' ? record.title : '',
    };
    const reattachedAt = normalizeTimestamp(record.reattachedAt);
    const terminatedAt = normalizeTimestamp(record.terminatedAt);

    if (reattachedAt !== undefined) {
      normalizedRecord.reattachedAt = reattachedAt;
    }

    if (terminatedAt !== undefined) {
      normalizedRecord.terminatedAt = terminatedAt;
      if (typeof record.terminationReason === 'string' && record.terminationReason) {
        normalizedRecord.terminationReason = record.terminationReason;
      }
    }

    unique.set(pid, normalizedRecord);
  }

  return Array.from(unique.values()).sort((a, b) => a.detachedAt - b.detachedAt);
}

function formatDefaultTime(timestamp) {
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    hour12: false,
    minute: '2-digit',
  }).format(new Date(timestamp));
}

function formatRemainingTime(remainingMs) {
  const remainingMinutes = Math.max(0, Math.ceil(remainingMs / 60_000));
  if (remainingMinutes < 60) {
    return `${remainingMinutes}분`;
  }

  const hours = Math.floor(remainingMinutes / 60);
  const minutes = remainingMinutes % 60;
  return minutes === 0 ? `${hours}시간` : `${hours}시간 ${minutes}분`;
}

function getHistoryExpiresAt(record, historyRetentionMs) {
  return record.detachedAt + historyRetentionMs;
}

function markReattached(record, reattachedAt) {
  const nextRecord = {
    ...record,
    reattachedAt,
  };
  delete nextRecord.terminatedAt;
  delete nextRecord.terminationReason;
  return nextRecord;
}

function markTerminated(record, terminatedAt, terminationReason) {
  if (record.terminatedAt !== undefined) {
    return record;
  }

  return {
    ...record,
    terminatedAt,
    terminationReason,
  };
}

function createUnavailableItem(record, { detail, reason }) {
  return {
    label: `${record.title || 'Terminal'} ${record.pid}`,
    detail,
    description: reason,
    pid: record.pid,
    record,
    canAttach: false,
    unavailableReason: reason,
    alwaysShow: true,
  };
}

function createDetachedTerminalQuickPickItems(
  records,
  {
    now = Date.now(),
    formatTime,
    historyRetentionMs = DEFAULT_HISTORY_RETENTION_MS,
    isAlive,
  } = {},
) {
  const currentTime = Number(now);
  const formatExpiryTime = formatTime ?? formatDefaultTime;

  return normalizeRecords(records)
    .filter((record) => getHistoryExpiresAt(record, historyRetentionMs) > currentTime)
    .sort((left, right) => right.detachedAt - left.detachedAt)
    .map((record) => {
      const historyDetail = `기록 ${formatExpiryTime(
        getHistoryExpiresAt(record, historyRetentionMs),
      )}까지`;
      if (record.reattachedAt !== undefined) {
        return createUnavailableItem(record, {
          detail: `재연결됨 ${formatExpiryTime(record.reattachedAt)} | ${historyDetail}`,
          reason: '이미 재연결됨',
        });
      }

      if (record.expiresAt <= currentTime) {
        return createUnavailableItem(record, {
          detail: `TTL ${formatExpiryTime(record.expiresAt)}에 만료됨 | ${historyDetail}`,
          reason: 'TTL 만료됨',
        });
      }

      const alive = isAlive ? isAlive(record) : record.terminatedAt === undefined;
      if (!alive || record.terminatedAt !== undefined) {
        return createUnavailableItem(record, {
          detail: `마지막 TTL ${formatExpiryTime(record.expiresAt)}까지 | ${historyDetail}`,
          reason: '프로세스 종료됨',
        });
      }

      return {
        label: `${record.title || 'Terminal'} ${record.pid}`,
        detail: `TTL ${formatExpiryTime(record.expiresAt)}까지 | ${formatRemainingTime(
          record.expiresAt - currentTime,
        )} 남음`,
        pid: record.pid,
        record,
        canAttach: true,
      };
    });
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
  const historyRetentionMs = options.historyRetentionMs ?? DEFAULT_HISTORY_RETENTION_MS;
  const sweepIntervalMs = options.sweepIntervalMs ?? DEFAULT_SWEEP_INTERVAL_MS;
  const now = options.now ?? Date.now;
  const processApi = options.processApi ?? process;
  const formatTime = options.formatTime ?? formatDefaultTime;
  const storage = options.storage ?? createGlobalStateStorage(options.context);
  const setIntervalFn = options.setInterval ?? setInterval;
  const clearIntervalFn = options.clearInterval ?? clearInterval;
  const startTimers = options.startTimers ?? true;
  const log = options.log ?? console;
  const killTree =
    options.killTree ??
    createDefaultKillTree({
      execFileImpl: options.execFile,
      processApi,
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

  function retainHistoryRecords(records, currentTime) {
    return records.filter(
      (record) => getHistoryExpiresAt(record, historyRetentionMs) > currentTime,
    );
  }

  async function markPidReattached(pid) {
    const normalizedPid = normalizePid(pid);
    if (!normalizedPid) {
      return;
    }

    const reattachedAt = now();
    await writeRecords(
      (await readRecords()).map((record) =>
        record.pid === normalizedPid ? markReattached(record, reattachedAt) : record,
      ),
    );
  }

  async function markPidTerminated(pid, terminationReason) {
    const normalizedPid = normalizePid(pid);
    if (!normalizedPid) {
      return;
    }

    const terminatedAt = now();
    await writeRecords(
      (await readRecords()).map((record) =>
        record.pid === normalizedPid
          ? markTerminated(record, terminatedAt, terminationReason)
          : record,
      ),
    );
  }

  async function removeTerminalPid(terminal) {
    const pid = await getTerminalPid(terminal);
    await markPidReattached(pid);
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
    await sweepExpired();
    const records = await readRecords();
    const items = createDetachedTerminalQuickPickItems(records, {
      now: now(),
      formatTime,
      historyRetentionMs,
      isAlive(record) {
        return isProcessAlive(record.pid, processApi);
      },
    });

    if (items.length === 0) {
      vscode.window.showInformationMessage?.('No tracked detached terminal sessions are available.');
      return;
    }

    const selected = await vscode.window.showQuickPick(items, {
      canPickMany: false,
      placeHolder: 'Attach detached terminal session',
    });

    if (!selected) {
      return;
    }

    if (!selected.canAttach) {
      vscode.window.showInformationMessage?.(
        selected.unavailableReason || 'Detached terminal session is not attachable.',
      );
      return;
    }

    if (!isProcessAlive(selected.pid, processApi)) {
      await markPidTerminated(selected.pid, 'dead');
      vscode.window.showInformationMessage?.('프로세스 종료됨');
      return;
    }

    await vscode.commands.executeCommand('workbench.action.terminal.attachToSession', {
      pid: selected.pid,
    });
    await markPidReattached(selected.pid);
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
    const records = retainHistoryRecords(await readRecords(), currentTime);
    const keep = [];

    for (const record of records) {
      if (record.reattachedAt !== undefined || record.terminatedAt !== undefined) {
        keep.push(record);
        continue;
      }

      if (!isProcessAlive(record.pid, processApi)) {
        keep.push(markTerminated(record, currentTime, 'dead'));
        continue;
      }

      if (record.expiresAt > currentTime) {
        keep.push(record);
        continue;
      }

      try {
        if (!(await killTree(record.pid))) {
          keep.push(record);
        } else {
          keep.push(markTerminated(record, currentTime, 'expired'));
        }
      } catch (error) {
        log.warn?.(`Failed to kill expired detached terminal pid ${record.pid}`, error);
        keep.push(record);
      }
    }

    await writeRecords(keep);
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
  DEFAULT_HISTORY_RETENTION_MS,
  DEFAULT_TTL_MS,
  STORAGE_KEY,
  collectDescendantPids,
  createDefaultKillTree,
  createDetachedTerminalQuickPickItems,
  createDetachedTerminalTtlManager,
  parsePsRows,
};
