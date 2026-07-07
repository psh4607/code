const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { execFile } = require('node:child_process');

const CODEX_SESSION_RESUME_STORAGE_KEY = 'codexTerminal.codexSessionResume.records';
const DEFAULT_STARTUP_DELAY_MS = 1000;
const DEFAULT_SNAPSHOT_INTERVAL_MS = 3000;
const DEFAULT_RESUME_CONFIRMATION_GRACE_MS = 5000;
const DEFAULT_STARTUP_RESTORE_WINDOW_MS = 60_000;
const DEFAULT_SESSION_REGISTRY_PATH = path.join(
  os.homedir(),
  '.codex',
  'codex-vscode-terminal-tools',
  'session-registry.json',
);
const DEFAULT_CODEX_HOME_PATH = path.join(os.homedir(), '.codex');
const RENAME_TERMINAL_COMMAND = 'workbench.action.terminal.renameWithArg';
const SESSION_ID_RE =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i;
const SESSION_ID_GLOBAL_RE = new RegExp(SESSION_ID_RE.source, 'gi');

function createGlobalStateStorage(context) {
  return {
    async getRecords() {
      return context?.globalState?.get(CODEX_SESSION_RESUME_STORAGE_KEY, []) ?? [];
    },
    async setRecords(records) {
      await context?.globalState?.update(CODEX_SESSION_RESUME_STORAGE_KEY, records);
    },
  };
}

function normalizePid(pid) {
  const parsed = Number(pid);
  return Number.isSafeInteger(parsed) && parsed > 1 ? parsed : undefined;
}

function normalizeNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizeTitle(value) {
  return typeof value === 'string' ? value : '';
}

function normalizeCwd(value) {
  return typeof value === 'string' && value ? value : undefined;
}

function extractCodexSessionId(value) {
  const match = String(value ?? '').match(SESSION_ID_RE);
  return match?.[0]?.toLowerCase();
}

function stringifyCommandLine(value) {
  if (typeof value === 'string') {
    return value;
  }

  if (typeof value?.value === 'string') {
    return value.value;
  }

  if (Array.isArray(value)) {
    return value.join(' ');
  }

  return '';
}

function splitShellWords(commandLine) {
  return stringifyCommandLine(commandLine)
    .match(/"([^"\\]|\\.)*"|'([^'\\]|\\.)*'|[^\s]+/g)
    ?.map((word) => word.replace(/^(['"])(.*)\1$/, '$2')) ?? [];
}

function commandBasename(command) {
  return path.basename(String(command ?? '').replace(/^['"]|['"]$/g, '')).replace(/^-/, '');
}

function commandLineStartsWithCodex(commandLine) {
  const [command] = splitShellWords(commandLine);
  return commandBasename(command) === 'codex';
}

function extractCodexResumeSessionId(commandLine) {
  if (!commandLineStartsWithCodex(commandLine)) {
    return undefined;
  }

  const words = splitShellWords(commandLine);
  const resumeIndex = words.findIndex((word, index) => index > 0 && word === 'resume');
  if (resumeIndex < 0) {
    return undefined;
  }

  return extractCodexSessionId(words.slice(resumeIndex + 1).join(' '));
}

function getShellExecutionCommandLine(event) {
  return stringifyCommandLine(
    event?.execution?.commandLine ??
      event?.commandLine ??
      event?.execution?.command ??
      event?.command,
  );
}

function getTerminalTitle(terminal) {
  return normalizeTitle(terminal?.name);
}

function getTerminalCwd(terminal) {
  return normalizeCwd(terminal?.shellIntegration?.cwd?.fsPath);
}

function isLikelyCwdTitle(title) {
  const trimmed = normalizeTitle(title).trim();
  return (
    trimmed === '' ||
    trimmed === '~' ||
    trimmed === '.' ||
    trimmed === '..' ||
    trimmed.startsWith('/') ||
    trimmed.startsWith('~/')
  );
}

function isLikelyFallbackTitle(title) {
  const trimmed = normalizeTitle(title).trim();
  return isLikelyCwdTitle(trimmed) || /^\d+$/.test(trimmed) || trimmed.toLowerCase() === 'codex';
}

function isRestorableTitle(title) {
  const trimmed = normalizeTitle(title).trim();
  return Boolean(trimmed) && !isLikelyFallbackTitle(trimmed);
}

function preserveRestorableTitle(currentTitle, previousTitle) {
  const current = normalizeTitle(currentTitle);
  const previous = normalizeTitle(previousTitle);
  if (isLikelyFallbackTitle(current) && isRestorableTitle(previous)) {
    return previous;
  }
  return current;
}

function replaceVisibleTitleSessionId(title, sessionId) {
  const currentTitle = normalizeTitle(title);
  const normalizedSessionId = extractCodexSessionId(sessionId);
  if (!currentTitle || !normalizedSessionId) {
    return currentTitle;
  }

  const visibleSessionId = extractCodexSessionId(currentTitle);
  if (!visibleSessionId || visibleSessionId === normalizedSessionId) {
    return currentTitle;
  }

  return currentTitle.replace(SESSION_ID_GLOBAL_RE, normalizedSessionId);
}

function titleForSession(currentTitle, previousTitle, sessionId) {
  const normalizedSessionId = extractCodexSessionId(sessionId);
  const current = replaceVisibleTitleSessionId(currentTitle, normalizedSessionId);
  const previous = replaceVisibleTitleSessionId(previousTitle, normalizedSessionId);
  if (
    extractCodexSessionId(current) === normalizedSessionId &&
    isRestorableTitle(previous) &&
    !extractCodexSessionId(previous)
  ) {
    return previous;
  }

  return preserveRestorableTitle(
    current,
    previous,
  );
}

function shouldRestoreTerminalTitle(record, currentTitle) {
  const currentSessionId = extractCodexSessionId(currentTitle);
  const staleVisibleSessionId =
    currentSessionId && record?.sessionId && currentSessionId !== record.sessionId;
  const sameVisibleSessionId =
    currentSessionId && record?.sessionId && currentSessionId === record.sessionId;
  const currentExposesHiddenStoredSession =
    sameVisibleSessionId && !extractCodexSessionId(record?.title);

  return (
    isRestorableTitle(record?.title) &&
    normalizeTitle(record.title) !== normalizeTitle(currentTitle) &&
    (isLikelyFallbackTitle(currentTitle) ||
      staleVisibleSessionId ||
      currentExposesHiddenStoredSession)
  );
}

async function getTerminalPid(terminal) {
  if (!terminal) {
    return undefined;
  }

  return normalizePid(await terminal.processId);
}

function parsePsRowsWithCommand(stdout) {
  return String(stdout ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^(\d+)\s+(\d+)\s+([\s\S]*)$/);
      if (!match) {
        return undefined;
      }

      return {
        pid: normalizePid(match[1]),
        ppid: Number(match[2]),
        command: match[3],
      };
    })
    .filter((row) => row?.pid && Number.isSafeInteger(row.ppid));
}

function collectProcessTreeRows(rows, rootPid) {
  const normalizedRootPid = normalizePid(rootPid);
  if (!normalizedRootPid) {
    return [];
  }

  const rowsByPid = new Map();
  const childrenByParent = new Map();
  for (const row of rows || []) {
    if (!normalizePid(row?.pid)) {
      continue;
    }

    rowsByPid.set(row.pid, row);
    if (!childrenByParent.has(row.ppid)) {
      childrenByParent.set(row.ppid, []);
    }
    childrenByParent.get(row.ppid).push(row);
  }

  const treeRows = [];
  const visit = (pid) => {
    const row = rowsByPid.get(pid);
    if (row) {
      treeRows.push(row);
    }

    for (const child of childrenByParent.get(pid) || []) {
      visit(child.pid);
    }
  };

  visit(normalizedRootPid);
  return treeRows;
}

function isCodexProcessCommand(command) {
  const commandText = String(command ?? '');
  if (!commandText) {
    return false;
  }

  if (/Codex Computer Use\.app|\/Applications\/Codex\.app\//i.test(commandText)) {
    return false;
  }

  const [firstWord] = splitShellWords(commandText);
  if (commandBasename(firstWord) === 'codex') {
    return true;
  }

  return /(^|\s)(?:\S*\/)?(?:node_modules\/)?(?:\.bin\/)?codex(\s|$)/.test(commandText);
}

function isKnownShellCommand(command) {
  const [firstWord] = splitShellWords(command);
  const basename = commandBasename(firstWord);
  return ['bash', 'csh', 'fish', 'login', 'nu', 'pwsh', 'sh', 'tcsh', 'zsh'].includes(
    basename,
  );
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

function createDefaultListProcesses(execFileImpl = execFile) {
  return async function listProcesses() {
    const stdout = await execFileText('ps', ['-axo', 'pid=,ppid=,command='], execFileImpl);
    return parsePsRowsWithCommand(stdout);
  };
}

function normalizeSessionRegistryRecords(source) {
  const records = Array.isArray(source) ? source : source?.records;
  return (Array.isArray(records) ? records : [])
    .map((record) => {
      const sessionId = extractCodexSessionId(
        record?.sessionId ?? record?.session_id ?? record?.thread_id ?? record?.['thread-id'],
      );
      if (!sessionId) {
        return undefined;
      }

      const normalized = {
        sessionId,
        updatedAt: normalizeNumber(record.updatedAt) ?? 0,
      };
      const cwd = normalizeCwd(record.cwd);
      const terminalPid = normalizePid(record.terminalPid ?? record.processId);

      if (cwd) {
        normalized.cwd = cwd;
      }
      if (terminalPid) {
        normalized.terminalPid = terminalPid;
      }

      return normalized;
    })
    .filter(Boolean)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

function createDefaultLoadSessionRegistryRecords(registryPath = DEFAULT_SESSION_REGISTRY_PATH) {
  return async function loadSessionRegistryRecords() {
    try {
      return normalizeSessionRegistryRecords(JSON.parse(fs.readFileSync(registryPath, 'utf8')));
    } catch {
      return [];
    }
  };
}

function sessionIndexContainsSessionId(indexPath, sessionId) {
  let source;
  try {
    source = fs.readFileSync(indexPath, 'utf8');
  } catch {
    return false;
  }

  for (const line of source.split('\n')) {
    if (!line.includes(sessionId)) {
      continue;
    }

    try {
      const entry = JSON.parse(line);
      if (extractCodexSessionId(entry?.id ?? entry?.sessionId ?? entry?.thread_id) === sessionId) {
        return true;
      }
    } catch {
      return true;
    }
  }

  return false;
}

function sessionFilenameExists(rootPath, sessionId) {
  const sessionsPath = path.join(rootPath, 'sessions');
  const stack = [sessionsPath];

  while (stack.length) {
    const currentPath = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(currentPath, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const entryPath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        stack.push(entryPath);
      } else if (entry.isFile() && entry.name.toLowerCase().includes(sessionId)) {
        return true;
      }
    }
  }

  return false;
}

function createDefaultHasSavedSession(
  codexHomePath = process.env.CODEX_HOME || DEFAULT_CODEX_HOME_PATH,
) {
  return async function hasSavedSession(sessionId) {
    const normalizedSessionId = extractCodexSessionId(sessionId);
    if (!normalizedSessionId) {
      return false;
    }

    return (
      sessionIndexContainsSessionId(
        path.join(codexHomePath, 'session_index.jsonl'),
        normalizedSessionId,
      ) || sessionFilenameExists(codexHomePath, normalizedSessionId)
    );
  };
}

function normalizeRecords(records) {
  const bySessionId = new Map();

  for (const record of Array.isArray(records) ? records : []) {
    const sessionId = extractCodexSessionId(record?.sessionId ?? record?.title);
    if (!sessionId) {
      continue;
    }

    const normalized = {
      codexProcessActive: record.codexProcessActive === true,
      lastSeenAt: normalizeNumber(record.lastSeenAt) ?? 0,
      sessionId,
      terminalIndex: normalizeNumber(record.terminalIndex) ?? 0,
      title: normalizeTitle(record.title),
    };
    const cwd = normalizeCwd(record.cwd);
    const lastAutoResumeConfirmedAt = normalizeNumber(record.lastAutoResumeConfirmedAt);
    const lastAutoResumedAt = normalizeNumber(record.lastAutoResumedAt);
    const lastCodexProcessCheckAt = normalizeNumber(record.lastCodexProcessCheckAt);
    const lastObservedCodexProcessAt = normalizeNumber(record.lastObservedCodexProcessAt);
    const lastRestoreCheckedAt = normalizeNumber(record.lastRestoreCheckedAt);
    const processId = normalizePid(record.processId);

    if (cwd) {
      normalized.cwd = cwd;
    }
    if (lastAutoResumeConfirmedAt !== undefined) {
      normalized.lastAutoResumeConfirmedAt = lastAutoResumeConfirmedAt;
    }
    if (lastAutoResumedAt !== undefined) {
      normalized.lastAutoResumedAt = lastAutoResumedAt;
    }
    if (lastCodexProcessCheckAt !== undefined) {
      normalized.lastCodexProcessCheckAt = lastCodexProcessCheckAt;
    }
    if (lastObservedCodexProcessAt !== undefined) {
      normalized.lastObservedCodexProcessAt = lastObservedCodexProcessAt;
    }
    if (lastRestoreCheckedAt !== undefined) {
      normalized.lastRestoreCheckedAt = lastRestoreCheckedAt;
    }
    if (typeof record.lastRestoreDecision === 'string' && record.lastRestoreDecision) {
      normalized.lastRestoreDecision = record.lastRestoreDecision;
    }
    if (processId) {
      normalized.processId = processId;
    }

    const existing = bySessionId.get(sessionId);
    if (!existing || normalized.lastSeenAt >= existing.lastSeenAt) {
      bySessionId.set(sessionId, normalized);
    }
  }

  return Array.from(bySessionId.values()).sort(
    (a, b) => a.terminalIndex - b.terminalIndex || a.lastSeenAt - b.lastSeenAt,
  );
}

function findRecordForTerminal(terminal, terminalIndex, records) {
  const title = getTerminalTitle(terminal);
  const cwd = getTerminalCwd(terminal);
  const sessionId = extractCodexSessionId(title);

  if (sessionId) {
    const bySessionId = records.find((record) => record.sessionId === sessionId);
    if (bySessionId) {
      return bySessionId;
    }
  }

  if (isLikelyFallbackTitle(title)) {
    return undefined;
  }

  const exactTitleAndCwd = records.find(
    (record) => record.title && record.title === title && record.cwd && record.cwd === cwd,
  );
  if (exactTitleAndCwd) {
    return exactTitleAndCwd;
  }

  const sameIndexAndTitle = records.find(
    (record) => record.terminalIndex === terminalIndex && record.title && record.title === title,
  );
  if (sameIndexAndTitle) {
    return sameIndexAndTitle;
  }
  return undefined;
}

function createReservedRestoreSessionIds(terminals, records) {
  const reservedSessionIds = new Set();
  for (const [terminalIndex, terminal] of (terminals || []).entries()) {
    const record = findRecordForTerminal(terminal, terminalIndex, records);
    if (record?.sessionId) {
      reservedSessionIds.add(record.sessionId);
    }
  }
  return reservedSessionIds;
}

function findRelativeCwdRecordForRestoredTerminal(terminal, records, options = {}) {
  const cwd = getTerminalCwd(terminal);
  const title = getTerminalTitle(terminal);
  if (!cwd || !isLikelyFallbackTitle(title)) {
    return undefined;
  }

  const claimedSessionIds = options.claimedSessionIds ?? new Set();
  const reservedSessionIds = options.reservedSessionIds ?? new Set();
  const terminalGroup = (options.terminals || [])
    .map((candidate, terminalIndex) => ({
      cwd: getTerminalCwd(candidate),
      terminal: candidate,
      terminalIndex,
      title: getTerminalTitle(candidate),
    }))
    .filter((candidate) => candidate.cwd === cwd && isLikelyFallbackTitle(candidate.title));
  const terminalGroupIndex = terminalGroup.findIndex((candidate) => candidate.terminal === terminal);
  if (terminalGroup.length < 2 || terminalGroupIndex < 0) {
    return undefined;
  }

  const unavailableSessionIds = new Set(reservedSessionIds);
  const recentCandidates = records
    .filter(
      (record) =>
        record.codexProcessActive &&
        record.cwd === cwd &&
        record.sessionId &&
        !unavailableSessionIds.has(record.sessionId),
    )
    .sort((a, b) => b.lastSeenAt - a.lastSeenAt || a.terminalIndex - b.terminalIndex)
    .slice(0, terminalGroup.length);

  const candidate = recentCandidates.sort(
    (a, b) => a.terminalIndex - b.terminalIndex || a.lastSeenAt - b.lastSeenAt,
  )[terminalGroupIndex];
  if (candidate && !claimedSessionIds.has(candidate.sessionId)) {
    return candidate;
  }
  return undefined;
}

function findRecordForRestoredTerminal(terminal, terminalIndex, records, options = {}) {
  const claimedSessionIds = options.claimedSessionIds ?? new Set();
  const directMatch = findRecordForTerminal(terminal, terminalIndex, records);
  if (directMatch && !claimedSessionIds.has(directMatch.sessionId)) {
    return directMatch;
  }

  const title = getTerminalTitle(terminal);
  const cwd = getTerminalCwd(terminal);
  if (!isLikelyFallbackTitle(title) || !cwd) {
    return undefined;
  }

  return records
    .filter(
      (record) =>
        record.codexProcessActive &&
        record.cwd === cwd &&
        record.terminalIndex === terminalIndex &&
        !claimedSessionIds.has(record.sessionId),
    )
    .sort((a, b) => b.lastSeenAt - a.lastSeenAt)[0] ??
    findRelativeCwdRecordForRestoredTerminal(terminal, records, options);
}

function findSessionRegistryRecordForTerminal(registryRecords, terminal, processId) {
  const normalizedProcessId = normalizePid(processId);
  if (!normalizedProcessId) {
    return undefined;
  }

  const cwd = getTerminalCwd(terminal);
  return normalizeSessionRegistryRecords(registryRecords).find(
    (record) =>
      record.terminalPid === normalizedProcessId &&
      (!record.cwd || !cwd || record.cwd === cwd),
  );
}

function findLatestSessionRegistryRecordForProcess(registryRecords, processId) {
  const normalizedProcessId = normalizePid(processId);
  if (!normalizedProcessId) {
    return undefined;
  }

  return normalizeSessionRegistryRecords(registryRecords).find(
    (record) => record.terminalPid === normalizedProcessId,
  );
}

function getConfigured(vscode, key, fallback) {
  return vscode.workspace?.getConfiguration('codexTerminal')?.get(key, fallback) ?? fallback;
}

function getAutoResumeConfirmationPatch(record, inspection, currentTime, graceMs) {
  if (record?.lastRestoreDecision !== 'sent' || record.lastAutoResumedAt === undefined) {
    return {};
  }

  if (inspection.hasCodexProcess) {
    return {
      lastAutoResumeConfirmedAt: currentTime,
      lastRestoreDecision: 'confirmed',
    };
  }

  if (currentTime - record.lastAutoResumedAt >= graceMs) {
    return {
      lastRestoreDecision: 'sent:no-confirmation',
    };
  }

  return {};
}

function createCodexSessionResumeManager(vscode, options = {}) {
  const now = options.now ?? Date.now;
  const storage = options.storage ?? createGlobalStateStorage(options.context);
  const listProcesses = options.listProcesses ?? createDefaultListProcesses(options.execFile);
  const hasSavedSession =
    options.hasSavedSession ?? createDefaultHasSavedSession(options.codexHomePath);
  const loadSessionRegistryRecords =
    options.loadSessionRegistryRecords ??
    createDefaultLoadSessionRegistryRecords(options.sessionRegistryPath);
  const setTimeoutFn = options.setTimeout ?? setTimeout;
  const clearTimeoutFn = options.clearTimeout ?? clearTimeout;
  const setIntervalFn = options.setInterval ?? setInterval;
  const clearIntervalFn = options.clearInterval ?? clearInterval;
  const startTimers = options.startTimers ?? true;
  const snapshotIntervalMs = options.snapshotIntervalMs ?? DEFAULT_SNAPSHOT_INTERVAL_MS;
  const resumeConfirmationGraceMs =
    options.resumeConfirmationGraceMs ?? DEFAULT_RESUME_CONFIRMATION_GRACE_MS;
  const startupRestoreWindowMs =
    options.startupRestoreWindowMs ?? DEFAULT_STARTUP_RESTORE_WINDOW_MS;
  const log = options.log ?? console;

  const disposables = [];
  const pendingTasks = new Set();
  const resumedThisActivation = new Set();
  let interval;
  let startupTimeout;
  let started = false;
  let startupRestoreStartedAt;
  let startupRestoreTerminals;

  async function readRecords() {
    return normalizeRecords(await storage.getRecords());
  }

  async function writeRecords(records) {
    await storage.setRecords(normalizeRecords(records));
  }

  async function readSessionRegistryRecords() {
    try {
      return normalizeSessionRegistryRecords(await loadSessionRegistryRecords());
    } catch (error) {
      log.warn?.('Failed to read Codex session registry', error);
      return [];
    }
  }

  async function canResumeSavedSession(sessionId) {
    try {
      return await hasSavedSession(sessionId);
    } catch (error) {
      log.warn?.('Failed to verify saved Codex session before resume', error);
      return true;
    }
  }

  function isStartupRestoreTerminal(terminal) {
    if (!started || !startupRestoreTerminals) {
      return true;
    }

    if (!startupRestoreTerminals.has(terminal)) {
      return false;
    }

    if (
      startupRestoreStartedAt === undefined ||
      !Number.isFinite(startupRestoreWindowMs)
    ) {
      return true;
    }

    return now() - startupRestoreStartedAt <= startupRestoreWindowMs;
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

  function scheduleTracked(label, fn, delayMs) {
    const task = new Promise((resolve) => {
      startupTimeout = setTimeoutFn(resolve, delayMs);
      startupTimeout?.unref?.();
    }).then(fn);

    return track(
      task.catch((error) => {
        log.warn?.(`Failed to ${label}`, error);
      }),
    );
  }

  async function inspectTerminalCodexProcess(terminal) {
    const pid = await getTerminalPid(terminal);
    if (!pid) {
      return {
        busy: true,
        hasCodexProcess: false,
        processId: undefined,
        rootShellOnly: false,
      };
    }

    let rows;
    try {
      rows = await listProcesses();
    } catch (error) {
      log.warn?.('Failed to inspect terminal process tree for Codex session resume', error);
      return {
        busy: true,
        hasCodexProcess: false,
        processId: pid,
        rootShellOnly: false,
      };
    }

    const treeRows = collectProcessTreeRows(rows, pid);
    const rootRow = treeRows.find((row) => row.pid === pid);
    const descendants = treeRows.filter((row) => row.pid !== pid);
    const hasCodexProcess = treeRows.some((row) => isCodexProcessCommand(row.command));

    return {
      busy: descendants.length > 0,
      hasCodexProcess,
      processId: pid,
      rootShellOnly: Boolean(rootRow && descendants.length === 0 && isKnownShellCommand(rootRow.command)),
    };
  }

  async function snapshotTerminals({ inspectProcesses = false } = {}) {
    const currentTime = now();
    const existingRecords = await readRecords();
    const registryRecords = await readSessionRegistryRecords();
    const nextRecords = [...existingRecords];

    for (const [terminalIndex, terminal] of (vscode.window.terminals || []).entries()) {
      const title = getTerminalTitle(terminal);
      const processId = await getTerminalPid(terminal);
      const inspection = inspectProcesses
        ? await inspectTerminalCodexProcess(terminal)
        : undefined;
      const cwdRegistryRecord = findSessionRegistryRecordForTerminal(
        registryRecords,
        terminal,
        processId,
      );
      const latestRegistryRecord = inspection?.hasCodexProcess
        ? findLatestSessionRegistryRecordForProcess(registryRecords, processId)
        : undefined;
      const registryRecord = latestRegistryRecord ?? cwdRegistryRecord;
      const sessionId =
        registryRecord?.sessionId ??
        extractCodexSessionId(title) ??
        findRecordForTerminal(terminal, terminalIndex, existingRecords)?.sessionId;

      if (!sessionId) {
        continue;
      }

      const matchedRecord =
        nextRecords.find((record) => record.sessionId === sessionId) ??
        findRecordForTerminal(terminal, terminalIndex, nextRecords) ??
        {};
      const existingRecord =
        matchedRecord.sessionId === sessionId ? matchedRecord : {};
      const replacedSessionId =
        matchedRecord.sessionId && matchedRecord.sessionId !== sessionId
          ? matchedRecord.sessionId
          : undefined;
      const nextRecord = {
        ...existingRecord,
        cwd: getTerminalCwd(terminal),
        lastSeenAt: currentTime,
        processId,
        sessionId,
        terminalIndex,
        title: titleForSession(title, matchedRecord.title, sessionId),
      };

      if (registryRecord?.sessionId === sessionId) {
        nextRecord.codexProcessActive = true;
        nextRecord.lastObservedCodexProcessAt = currentTime;
      }

      if (inspectProcesses) {
        nextRecord.codexProcessActive = inspection.hasCodexProcess;
        nextRecord.lastCodexProcessCheckAt = currentTime;
        nextRecord.processId = inspection.processId;
        Object.assign(
          nextRecord,
          getAutoResumeConfirmationPatch(
            existingRecord,
            inspection,
            currentTime,
            resumeConfirmationGraceMs,
          ),
        );
        if (inspection.hasCodexProcess) {
          nextRecord.lastObservedCodexProcessAt = currentTime;
        }
      }

      for (let index = nextRecords.length - 1; index >= 0; index -= 1) {
        if (
          nextRecords[index]?.sessionId === sessionId ||
          nextRecords[index]?.sessionId === replacedSessionId
        ) {
          nextRecords.splice(index, 1);
        }
      }
      nextRecords.push(nextRecord);
    }

    await writeRecords(nextRecords);
  }

  async function recordShellExecution(event) {
    const commandLine = getShellExecutionCommandLine(event);
    if (!commandLineStartsWithCodex(commandLine)) {
      return;
    }

    const sessionId =
      extractCodexResumeSessionId(commandLine) ?? extractCodexSessionId(commandLine);
    if (!sessionId) {
      return;
    }

    const terminal = event.terminal;
    const terminalIndex = Math.max(0, (vscode.window.terminals || []).indexOf(terminal));
    const currentTime = now();
    const records = await readRecords();
    const existingRecord = findRecordForTerminal(terminal, terminalIndex, records) ?? {};
    const processId = await getTerminalPid(terminal);
    const nextRecord = {
      ...existingRecord,
      codexProcessActive: true,
      cwd: getTerminalCwd(terminal),
      lastObservedCodexProcessAt: currentTime,
      lastSeenAt: currentTime,
      processId,
      sessionId,
      terminalIndex,
      title: titleForSession(getTerminalTitle(terminal), existingRecord.title, sessionId),
    };

    const nextRecords = records.filter((record) => record.sessionId !== sessionId);
    nextRecords.push(nextRecord);
    await writeRecords(nextRecords);
  }

  async function recordTerminalTitleRename(terminal, title, options = {}) {
    const nextTitle = normalizeTitle(title);
    if (!isRestorableTitle(nextTitle)) {
      return;
    }

    const terminalIndex = Math.max(0, (vscode.window.terminals || []).indexOf(terminal));
    const previousTitle = normalizeTitle(options.previousTitle) || getTerminalTitle(terminal);
    const currentTime = now();
    const records = await readRecords();
    const processId = await getTerminalPid(terminal);
    const registryRecords = await readSessionRegistryRecords();
    const registryRecord =
      findLatestSessionRegistryRecordForProcess(registryRecords, processId) ??
      findSessionRegistryRecordForTerminal(registryRecords, terminal, processId);
    const cwd = getTerminalCwd(terminal);
    const titleSessionId = extractCodexSessionId(previousTitle);
    const matchedRecord =
      (titleSessionId
        ? records.find((record) => record.sessionId === titleSessionId)
        : undefined) ??
      records.find(
        (record) =>
          record.title &&
          record.title === previousTitle &&
          record.cwd &&
          record.cwd === cwd,
      ) ??
      records.find(
        (record) => record.terminalIndex === terminalIndex && record.title === previousTitle,
      ) ??
      findRecordForTerminal(terminal, terminalIndex, records);
    const sessionId =
      registryRecord?.sessionId ??
      matchedRecord?.sessionId ??
      titleSessionId ??
      extractCodexSessionId(nextTitle);

    if (!sessionId) {
      return;
    }

    const nextRecord = {
      ...(matchedRecord?.sessionId === sessionId ? matchedRecord : {}),
      cwd,
      lastSeenAt: currentTime,
      processId,
      sessionId,
      terminalIndex,
      title: nextTitle,
    };

    if (registryRecord?.sessionId === sessionId) {
      nextRecord.codexProcessActive = true;
      nextRecord.lastObservedCodexProcessAt = currentTime;
    }

    const nextRecords = records.filter((record) => record.sessionId !== sessionId);
    nextRecords.push(nextRecord);
    await writeRecords(nextRecords);
  }

  async function getResumeSafety(terminal) {
    const inspection = await inspectTerminalCodexProcess(terminal);
    if (inspection.hasCodexProcess) {
      return {
        ...inspection,
        reason: 'skipped:codex-process-active',
        safe: false,
      };
    }

    if (inspection.rootShellOnly && !inspection.busy) {
      return {
        ...inspection,
        safe: true,
      };
    }

    return {
      ...inspection,
      reason: inspection.busy ? 'skipped:terminal-busy' : 'skipped:not-idle-shell',
      safe: false,
    };
  }

  function shouldResumeRecord(record) {
    return Boolean(record?.sessionId && record.codexProcessActive);
  }

  async function restoreTerminalTitleIfNeeded(record, terminal) {
    const currentTitle = getTerminalTitle(terminal);
    if (
      !shouldRestoreTerminalTitle(record, currentTitle) ||
      !vscode.commands?.executeCommand
    ) {
      return;
    }

    const previousActiveTerminal = vscode.window.activeTerminal;
    const needsActivation = previousActiveTerminal !== terminal;
    if (needsActivation) {
      if (typeof terminal?.show !== 'function') {
        return;
      }
      terminal.show(true);
    }

    try {
      await vscode.commands.executeCommand(RENAME_TERMINAL_COMMAND, {
        name: normalizeTitle(record.title),
      });
    } catch (error) {
      log.warn?.('Failed to restore Codex terminal title', error);
    } finally {
      if (
        needsActivation &&
        previousActiveTerminal &&
        typeof previousActiveTerminal.show === 'function'
      ) {
        try {
          previousActiveTerminal.show(true);
        } catch (error) {
          log.warn?.('Failed to restore previously active terminal after title restore', error);
        }
      }
    }
  }

  function upsertRestoreDecisionRecord(
    records,
    record,
    terminal,
    terminalIndex,
    decision,
    currentTime,
    patch = {},
  ) {
    if (!record?.sessionId) {
      return;
    }

    const nextRecord = {
      ...record,
      ...patch,
      cwd: getTerminalCwd(terminal),
      lastRestoreCheckedAt: currentTime,
      lastRestoreDecision: decision,
      lastSeenAt: currentTime,
      sessionId: record.sessionId,
      terminalIndex,
      title: titleForSession(getTerminalTitle(terminal), record.title, record.sessionId),
    };
    delete nextRecord.replacedSessionId;

    const replacedSessionId =
      record.replacedSessionId && record.replacedSessionId !== record.sessionId
        ? record.replacedSessionId
        : undefined;
    let existingRecord;
    for (let index = records.length - 1; index >= 0; index -= 1) {
      if (
        records[index]?.sessionId === record.sessionId ||
        records[index]?.sessionId === replacedSessionId
      ) {
        if (records[index]?.sessionId === record.sessionId) {
          existingRecord = records[index];
        }
        records.splice(index, 1);
      }
    }
    records.push({
      ...(existingRecord ?? {}),
      ...nextRecord,
    });
  }

  async function restoreCodexSessions() {
    if (!getConfigured(vscode, 'autoResumeCodexSessions', true)) {
      return;
    }

    const records = await readRecords();
    const registryRecords = await readSessionRegistryRecords();
    const updatedRecords = [...records];
    const restoreCheckedAt = now();
    const terminals = vscode.window.terminals || [];
    const claimedSessionIds = new Set();
    const reservedSessionIds = createReservedRestoreSessionIds(terminals, records);
    const titleRestoreRequests = [];

    for (const [terminalIndex, terminal] of terminals.entries()) {
      const title = getTerminalTitle(terminal);
      const processId = await getTerminalPid(terminal);
      const titleSessionId = extractCodexSessionId(title);
      const canUseStoredRestore = isStartupRestoreTerminal(terminal);
      const cwdRegistryRecord = findSessionRegistryRecordForTerminal(
        registryRecords,
        terminal,
        processId,
      );
      const latestRegistryRecord = findLatestSessionRegistryRecordForProcess(
        registryRecords,
        processId,
      );
      let safety;
      async function readSafety() {
        if (!safety) {
          safety = await getResumeSafety(terminal);
        }
        return safety;
      }
      let registryRecord = cwdRegistryRecord;
      if (
        latestRegistryRecord &&
        latestRegistryRecord.sessionId !== cwdRegistryRecord?.sessionId
      ) {
        const currentSafety = await readSafety();
        if (currentSafety.hasCodexProcess) {
          registryRecord = latestRegistryRecord;
        }
      }
      const matchedRecord = canUseStoredRestore
        ? findRecordForRestoredTerminal(terminal, terminalIndex, records, {
            claimedSessionIds,
            reservedSessionIds,
            terminals,
          })
        : undefined;
      const registryIsResumeEvidence =
        canUseStoredRestore && Boolean(registryRecord?.sessionId);
      const titleIsResumeEvidence =
        canUseStoredRestore &&
        !registryIsResumeEvidence &&
        titleSessionId &&
        (!matchedRecord || matchedRecord.codexProcessActive || matchedRecord.title !== title);
      const record = registryIsResumeEvidence
        ? {
            ...(matchedRecord?.sessionId === registryRecord.sessionId ? matchedRecord : {}),
            codexProcessActive: true,
            cwd: getTerminalCwd(terminal),
            processId,
            replacedSessionId:
              matchedRecord?.sessionId && matchedRecord.sessionId !== registryRecord.sessionId
                ? matchedRecord.sessionId
                : undefined,
            sessionId: registryRecord.sessionId,
            terminalIndex,
            title: titleForSession(title, matchedRecord?.title, registryRecord.sessionId),
          }
        : titleIsResumeEvidence
          ? {
              ...(matchedRecord?.sessionId === titleSessionId ? matchedRecord : {}),
              codexProcessActive: true,
              cwd: getTerminalCwd(terminal),
              replacedSessionId:
                matchedRecord?.sessionId && matchedRecord.sessionId !== titleSessionId
                  ? matchedRecord.sessionId
                  : undefined,
              sessionId: titleSessionId,
              terminalIndex,
              title: titleForSession(title, matchedRecord?.title, titleSessionId),
            }
        : matchedRecord;
      if (!shouldResumeRecord(record)) {
        upsertRestoreDecisionRecord(
          updatedRecords,
          record,
          terminal,
          terminalIndex,
          'skipped:not-resume-candidate',
          restoreCheckedAt,
        );
        continue;
      }
      claimedSessionIds.add(record.sessionId);
      titleRestoreRequests.push({ record, terminal });

      if (resumedThisActivation.has(record.sessionId)) {
        upsertRestoreDecisionRecord(
          updatedRecords,
          record,
          terminal,
          terminalIndex,
          'skipped:already-resumed-this-activation',
          restoreCheckedAt,
        );
        continue;
      }

      safety = await readSafety();
      if (!safety.safe) {
        upsertRestoreDecisionRecord(
          updatedRecords,
          record,
          terminal,
          terminalIndex,
          safety.reason,
          restoreCheckedAt,
          {
            codexProcessActive:
              safety.reason === 'skipped:codex-process-active'
                ? true
                : record.codexProcessActive,
            lastCodexProcessCheckAt: restoreCheckedAt,
            lastObservedCodexProcessAt: safety.hasCodexProcess
              ? restoreCheckedAt
              : record.lastObservedCodexProcessAt,
            processId: safety.processId,
          },
        );
        continue;
      }

      if (!(await canResumeSavedSession(record.sessionId))) {
        upsertRestoreDecisionRecord(
          updatedRecords,
          record,
          terminal,
          terminalIndex,
          'skipped:missing-saved-session',
          restoreCheckedAt,
          {
            codexProcessActive: false,
            lastCodexProcessCheckAt: restoreCheckedAt,
            processId: safety.processId,
          },
        );
        continue;
      }

      terminal.sendText(`codex resume ${record.sessionId}`, true);
      resumedThisActivation.add(record.sessionId);

      upsertRestoreDecisionRecord(
        updatedRecords,
        record,
        terminal,
        terminalIndex,
        'sent',
        restoreCheckedAt,
        {
          codexProcessActive: true,
          lastAutoResumedAt: restoreCheckedAt,
          lastCodexProcessCheckAt: restoreCheckedAt,
          processId: safety.processId,
        },
      );
    }

    await writeRecords(updatedRecords);
    for (const { record, terminal } of titleRestoreRequests) {
      await restoreTerminalTitleIfNeeded(record, terminal);
    }
  }

  async function snapshotAndRestoreCodexSessions({ inspectProcesses = false } = {}) {
    await snapshotTerminals({ inspectProcesses });
    await restoreCodexSessions();
  }

  function start() {
    if (started) {
      return;
    }

    started = true;
    startupRestoreStartedAt = now();
    startupRestoreTerminals = new Set(vscode.window.terminals || []);

    if (vscode.window.onDidOpenTerminal) {
      disposables.push(
        vscode.window.onDidOpenTerminal(() => {
          runTracked('snapshot Codex terminal records after terminal open', () =>
            snapshotTerminals({ inspectProcesses: false }),
          );
        }),
      );
    }

    if (vscode.window.onDidChangeActiveTerminal) {
      disposables.push(
        vscode.window.onDidChangeActiveTerminal(() => {
          runTracked('snapshot Codex terminal records after active terminal change', () =>
            snapshotTerminals({ inspectProcesses: false }),
          );
        }),
      );
    }

    if (vscode.window.onDidChangeTerminalShellIntegration) {
      disposables.push(
        vscode.window.onDidChangeTerminalShellIntegration(() => {
          runTracked('retry Codex session resume after shell integration change', () =>
            snapshotAndRestoreCodexSessions({ inspectProcesses: false }),
          );
        }),
      );
    }

    if (vscode.window.onDidChangeTerminalState) {
      disposables.push(
        vscode.window.onDidChangeTerminalState(() => {
          runTracked('retry Codex session resume after terminal state change', () =>
            snapshotAndRestoreCodexSessions({ inspectProcesses: false }),
          );
        }),
      );
    }

    if (vscode.window.onDidStartTerminalShellExecution) {
      disposables.push(
        vscode.window.onDidStartTerminalShellExecution((event) => {
          runTracked('record Codex shell execution', () => recordShellExecution(event));
        }),
      );
    }

    if (vscode.window.onDidEndTerminalShellExecution) {
      disposables.push(
        vscode.window.onDidEndTerminalShellExecution(() => {
          runTracked('snapshot Codex process state after shell execution', () =>
            snapshotTerminals({ inspectProcesses: true }),
          );
        }),
      );
    }

    runTracked('snapshot Codex terminal records on startup', () =>
      snapshotTerminals({ inspectProcesses: false }),
    );

    if (startTimers) {
      const startupDelayMs =
        options.startupDelayMs ??
        getConfigured(vscode, 'codexResumeStartupDelayMs', DEFAULT_STARTUP_DELAY_MS);
      scheduleTracked('auto-resume Codex terminal sessions', restoreCodexSessions, startupDelayMs);

      interval = setIntervalFn(() => {
        runTracked('periodically snapshot Codex process state', () =>
          snapshotTerminals({ inspectProcesses: true }),
        );
      }, snapshotIntervalMs);
      interval.unref?.();
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

    if (startupTimeout) {
      clearTimeoutFn(startupTimeout);
      startupTimeout = undefined;
    }

    if (interval) {
      clearIntervalFn(interval);
      interval = undefined;
    }

    started = false;
    startupRestoreStartedAt = undefined;
    startupRestoreTerminals = undefined;
  }

  return {
    dispose,
    flush,
    recordShellExecution,
    recordTerminalTitleRename,
    restoreCodexSessions,
    snapshotTerminals,
    start,
  };
}

module.exports = {
  CODEX_SESSION_RESUME_STORAGE_KEY,
  collectProcessTreeRows,
  createCodexSessionResumeManager,
  createDefaultHasSavedSession,
  createDefaultLoadSessionRegistryRecords,
  extractCodexResumeSessionId,
  extractCodexSessionId,
  isCodexProcessCommand,
  normalizeRecords,
  parsePsRowsWithCommand,
};
