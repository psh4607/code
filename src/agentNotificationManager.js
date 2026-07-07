const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  isPresentableAgentNotificationEvent,
  parseAgentNotificationJsonl,
} = require('./agentNotificationEvents');
const {
  agentNotificationReplacementKey,
  encodeReplaceableNotificationMessage,
} = require('./agentNotificationReplacement');
const { createAgentNotificationStore } = require('./agentNotificationStore');

const DEFAULT_EVENTS_PATH = path.join(
  os.homedir(),
  '.codex',
  'codex-vscode-terminal-tools',
  'notifications',
  'events.jsonl',
);
const DEFAULT_SESSION_REGISTRY_PATH = path.join(
  os.homedir(),
  '.codex',
  'codex-vscode-terminal-tools',
  'session-registry.json',
);
const DEFAULT_POLL_INTERVAL_MS = 1000;
const SHOW_AGENT_NOTIFICATIONS_COMMAND = 'codexTerminal.showAgentNotifications';
const OPEN_LATEST_AGENT_NOTIFICATION_COMMAND = 'codexTerminal.openLatestAgentNotification';
const MARK_AGENT_NOTIFICATIONS_READ_COMMAND = 'codexTerminal.markAgentNotificationsRead';
const CLEAR_AGENT_NOTIFICATIONS_COMMAND = 'codexTerminal.clearAgentNotifications';
const FLASH_ACTIVE_TERMINAL_TAB_COMMAND = 'codexTerminal.flashActiveTerminalTab';
const FLASH_TERMINAL_TAB_DURATION_MS = 1000;
const RECORDS_STORAGE_KEY = 'codexTerminal.agentNotifications.records';
const SEEN_EVENT_IDS_STORAGE_KEY = 'codexTerminal.agentNotifications.seenEventIds';
const SEEN_DEDUPE_KEYS_STORAGE_KEY = 'codexTerminal.agentNotifications.seenDedupeKeys';
const MAX_SEEN_EVENT_IDS = 1000;
const MAX_SEEN_DEDUPE_KEYS = 5000;

function readFileDefault(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
}

function readSessionRegistryDefault() {
  try {
    return JSON.parse(fs.readFileSync(DEFAULT_SESSION_REGISTRY_PATH, 'utf8'));
  } catch {
    return { records: [] };
  }
}

function uniqueTerminals(vscode) {
  const terminals = [];
  const seen = new Set();
  for (const terminal of [
    vscode.window.activeTerminal,
    ...(Array.isArray(vscode.window.terminals) ? vscode.window.terminals : []),
  ]) {
    if (!terminal || seen.has(terminal)) {
      continue;
    }
    seen.add(terminal);
    terminals.push(terminal);
  }
  return terminals;
}

async function terminalPid(terminal) {
  try {
    return await terminal?.processId;
  } catch {
    return undefined;
  }
}

function formatStatusText(latestUnread, unreadCount) {
  const provider = latestUnread?.provider === 'codex' ? 'Codex' : 'Agents';
  return `${provider}: ${unreadCount}`;
}

function notificationKindLabel(record) {
  if (record?.event === 'permission_requested' || record?.event === 'needs_input') {
    return 'Request';
  }
  if (record?.event === 'turn_finished' && record?.severity === 'success') {
    return 'Complete';
  }
  if (record?.event === 'error' || record?.severity === 'error') {
    return 'Error';
  }
  return 'Update';
}

function formatSessionShortId(record) {
  if (typeof record?.sessionId !== 'string' || !record.sessionId) {
    return undefined;
  }
  return record.sessionId.length <= 12 ? record.sessionId : record.sessionId.slice(0, 8);
}

function cleanNotificationText(value) {
  return typeof value === 'string' && value.trim()
    ? value.replace(/\s+/g, ' ').trim()
    : undefined;
}

function truncateNotificationText(value, maxLength = 72) {
  const text = cleanNotificationText(value);
  if (!text || text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength - 1).trimEnd()}...`;
}

function formatProjectLabel(record) {
  if (typeof record?.subtitle === 'string' && record.subtitle.trim()) {
    return record.subtitle.trim();
  }
  if (typeof record?.cwd === 'string' && record.cwd.trim()) {
    return path.basename(record.cwd) || record.cwd;
  }
  return undefined;
}

function formatTitleLine(record) {
  const title = cleanNotificationText(record?.title) || notificationKindLabel(record);
  const body = cleanNotificationText(record?.body);
  if (
    body &&
    (record?.event === 'permission_requested' ||
      record?.event === 'needs_input' ||
      record?.event === 'error')
  ) {
    const bodySummary = body.replace(/^[^:\n]{1,48}:\s*/, '');
    const summary = truncateNotificationText(bodySummary);
    if (summary && summary !== title) {
      return `${title}: ${summary}`;
    }
  }
  return title;
}

function formatMetadataLine(record) {
  const parts = [
    formatProjectLabel(record),
    formatSessionShortId(record) ? `session ${formatSessionShortId(record)}` : undefined,
    notificationKindLabel(record),
  ].filter(Boolean);
  return parts.join(' · ');
}

function formatDetailLine(record) {
  return cleanNotificationText(record?.body);
}

function formatNotificationMessage(record) {
  return [
    formatTitleLine(record),
    formatMetadataLine(record),
    formatDetailLine(record),
  ].filter(Boolean).join('\n');
}

function formatTooltip(record, unreadCount) {
  const text = formatNotificationMessage(record);
  return text ? `${unreadCount} unread\n${text}` : `${unreadCount} unread agent notification(s)`;
}

function readStoredArray(context, key) {
  const value = context?.globalState?.get?.(key, []);
  return Array.isArray(value) ? value : [];
}

function storedDedupeKeys(records) {
  return (Array.isArray(records) ? records : [])
    .map((record) => (typeof record?.dedupeKey === 'string' ? record.dedupeKey : undefined))
    .filter(Boolean);
}

function normalizePid(value) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 1 ? parsed : undefined;
}

function normalizeSessionRegistryRecords(source) {
  const records = Array.isArray(source) ? source : source?.records;
  return (Array.isArray(records) ? records : [])
    .map((record) => {
      const sessionId = typeof record?.sessionId === 'string' && record.sessionId
        ? record.sessionId
        : undefined;
      const terminalPidValue = normalizePid(record?.terminalPid ?? record?.processId);
      if (!sessionId || !terminalPidValue) {
        return undefined;
      }
      return {
        sessionId,
        terminalPid: terminalPidValue,
        updatedAt: Number.isFinite(Number(record.updatedAt)) ? Number(record.updatedAt) : 0,
      };
    })
    .filter(Boolean)
    .sort((left, right) => right.updatedAt - left.updatedAt);
}

function createAgentNotificationManager(vscode, {
  context,
  eventsPath = DEFAULT_EVENTS_PATH,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
  readFile = readFileDefault,
  readSessionRegistry = readSessionRegistryDefault,
  setIntervalFn = setInterval,
  clearIntervalFn = clearInterval,
  nativeNotificationBridge,
  store,
} = {}) {
  const initialRecords = readStoredArray(context, RECORDS_STORAGE_KEY);
  const seenEventIds = new Set(readStoredArray(context, SEEN_EVENT_IDS_STORAGE_KEY));
  const seenDedupeKeys = new Set([
    ...readStoredArray(context, SEEN_DEDUPE_KEYS_STORAGE_KEY),
    ...storedDedupeKeys(initialRecords),
  ]);
  const notificationStore = store || createAgentNotificationStore({
    initialRecords,
  });
  let statusBarItem;
  let pollTimer;
  let started = false;
  let pendingPersist = Promise.resolve();

  function persistState() {
    if (!context?.globalState?.update) {
      return pendingPersist;
    }
    const seenIds = Array.from(seenEventIds).slice(-MAX_SEEN_EVENT_IDS);
    const seenDedupes = Array.from(seenDedupeKeys).slice(-MAX_SEEN_DEDUPE_KEYS);
    const records = notificationStore.records();
    const writeSnapshot = () => Promise.all([
      context.globalState.update(SEEN_EVENT_IDS_STORAGE_KEY, seenIds),
      context.globalState.update(SEEN_DEDUPE_KEYS_STORAGE_KEY, seenDedupes),
      context.globalState.update(RECORDS_STORAGE_KEY, records),
    ]).then(
      () => undefined,
      () => undefined,
    );
    pendingPersist = pendingPersist.then(writeSnapshot, writeSnapshot);
    return pendingPersist;
  }

  function rememberDedupeKey(record) {
    const dedupeKey = typeof record?.dedupeKey === 'string' ? record.dedupeKey : undefined;
    if (!dedupeKey) {
      return;
    }
    if (seenDedupeKeys.has(dedupeKey)) {
      seenDedupeKeys.delete(dedupeKey);
    }
    seenDedupeKeys.add(dedupeKey);
  }

  function rememberDedupeKeys(records) {
    for (const record of Array.isArray(records) ? records : []) {
      rememberDedupeKey(record);
    }
  }

  function updateStatusBar() {
    if (!statusBarItem) {
      return;
    }
    const unreadCount = notificationStore.unreadCount();
    if (unreadCount <= 0) {
      statusBarItem.hide();
      return;
    }

    const latestUnread = notificationStore.latestUnread();
    statusBarItem.text = formatStatusText(latestUnread, unreadCount);
    statusBarItem.tooltip = formatTooltip(latestUnread, unreadCount);
    statusBarItem.command = SHOW_AGENT_NOTIFICATIONS_COMMAND;
    statusBarItem.show();
  }

  async function findTerminalForRecord(record) {
    const expectedPids = [];
    if (record?.terminalPid) {
      expectedPids.push(record.terminalPid);
    }
    if (record?.sessionId) {
      const registryPid = normalizeSessionRegistryRecords(readSessionRegistry())
        .find((registryRecord) => registryRecord.sessionId === record.sessionId)
        ?.terminalPid;
      if (registryPid && !expectedPids.includes(registryPid)) {
        expectedPids.push(registryPid);
      }
    }
    if (expectedPids.length === 0) {
      return undefined;
    }
    for (const terminal of uniqueTerminals(vscode)) {
      const processId = await terminalPid(terminal);
      if (expectedPids.includes(processId)) {
        return { terminal, processId };
      }
    }
    return undefined;
  }

  async function isActiveFocusedRecord(record) {
    const activeTerminal = vscode.window.activeTerminal;
    if (!record?.terminalPid || !activeTerminal || vscode.window.state?.focused !== true) {
      return false;
    }
    return (await terminalPid(activeTerminal)) === record.terminalPid;
  }

  async function flashActiveTerminalTab() {
    if (!vscode.commands?.executeCommand) {
      return false;
    }
    try {
      await vscode.commands.executeCommand(FLASH_ACTIVE_TERMINAL_TAB_COMMAND, {
        durationMs: FLASH_TERMINAL_TAB_DURATION_MS,
      });
      return true;
    } catch {
      return false;
    }
  }

  async function openRecord(record) {
    const terminalMatch = await findTerminalForRecord(record);
    if (!terminalMatch) {
      return false;
    }
    terminalMatch.terminal.show(false);
    await flashActiveTerminalTab();
    if (notificationStore.markRead(record.id)) {
      rememberDedupeKey(record);
      persistState();
    }
    updateStatusBar();
    return true;
  }

  async function presentRecord(record) {
    const formattedMessage = formatNotificationMessage(record);
    if (nativeNotificationBridge?.notify) {
      void Promise.resolve(
        nativeNotificationBridge.notify(record, {
          message: formattedMessage,
        }),
      ).catch(() => undefined);
    }
    const message = encodeReplaceableNotificationMessage(formattedMessage, record);
    const selected = await vscode.window.showInformationMessage(
      message,
      'Open Terminal',
      'Mark Read',
    );
    if (selected === 'Open Terminal') {
      await openRecord(record);
    } else if (selected === 'Mark Read') {
      if (notificationStore.markRead(record.id)) {
        rememberDedupeKey(record);
        persistState();
      }
      updateStatusBar();
    }
  }

  async function ingestEvent(event) {
    if (seenEventIds.has(event.id)) {
      return;
    }
    if (isPresentableAgentNotificationEvent(event) && seenDedupeKeys.has(event.dedupeKey)) {
      seenEventIds.add(event.id);
      persistState();
      return;
    }
    const isTargetedEvent = Boolean(event.terminalPid || event.sessionId);
    const terminalMatch = isTargetedEvent
      ? await findTerminalForRecord(event)
      : undefined;
    if (isTargetedEvent && !terminalMatch) {
      return;
    }
    const resolvedEvent = terminalMatch?.processId && event.terminalPid !== terminalMatch.processId
      ? { ...event, terminalPid: terminalMatch.processId }
      : event;
    seenEventIds.add(event.id);
    const result = notificationStore.ingestEvent(resolvedEvent, {
      isActiveTerminalFocused: await isActiveFocusedRecord(resolvedEvent),
    });
    if (result.record?.isRead || result.record?.isPresented) {
      rememberDedupeKey(result.record);
    }
    persistState();
    updateStatusBar();
    if (result.shouldPresent && result.record) {
      await presentRecord(result.record);
    }
  }

  async function pollEvents() {
    const events = parseAgentNotificationJsonl(readFile(eventsPath));
    for (const event of events) {
      await ingestEvent(event);
    }
  }

  function start() {
    if (started) {
      return;
    }
    started = true;
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 80);
    updateStatusBar();
    if (pollIntervalMs > 0) {
      pollTimer = setIntervalFn(() => {
        void pollEvents();
      }, pollIntervalMs);
    }
  }

  function dispose() {
    if (pollTimer) {
      clearIntervalFn(pollTimer);
      pollTimer = undefined;
    }
    statusBarItem?.dispose();
    statusBarItem = undefined;
    started = false;
    return pendingPersist;
  }

  async function showAgentNotifications() {
    const items = notificationStore.records().map((record) => ({
      label: record.title,
      description: record.body || record.subtitle || '',
      detail: [
        formatProjectLabel(record),
        formatSessionShortId(record) ? `session ${formatSessionShortId(record)}` : undefined,
        notificationKindLabel(record),
      ].filter(Boolean).join(' · '),
      record,
    }));
    const selected = await vscode.window.showQuickPick(items);
    if (selected?.record) {
      await openRecord(selected.record);
    }
  }

  async function openLatestAgentNotification() {
    const latest = notificationStore.latestUnread();
    if (!latest) {
      return false;
    }
    return openRecord(latest);
  }

  function parseAgentNotificationUri(uri) {
    if (!uri) {
      return undefined;
    }

    if (typeof uri === 'string') {
      try {
        const parsed = new URL(uri);
        const pathName = parsed.pathname.replace(/^\/+/, '');
        if (pathName && pathName !== 'open-agent-notification') {
          return undefined;
        }
        return {
          id: parsed.searchParams.get('id') || undefined,
          replacementKey: parsed.searchParams.get('replacementKey') || undefined,
        };
      } catch {
        return undefined;
      }
    }

    const pathName = typeof uri.path === 'string' ? uri.path.replace(/^\/+/, '') : '';
    if (pathName && pathName !== 'open-agent-notification') {
      return undefined;
    }
    const params = new URLSearchParams(typeof uri.query === 'string' ? uri.query : '');
    return {
      id: params.get('id') || undefined,
      replacementKey: params.get('replacementKey') || undefined,
    };
  }

  async function openAgentNotificationUri(uri) {
    const parsed = parseAgentNotificationUri(uri);
    if (!parsed?.id && !parsed?.replacementKey) {
      return false;
    }

    const records = notificationStore.records();
    const record = records.find((candidate) => candidate.id === parsed.id) ||
      (parsed.replacementKey
        ? records.find(
            (candidate) => agentNotificationReplacementKey(candidate) === parsed.replacementKey,
          )
        : undefined);
    if (!record) {
      return false;
    }
    return openRecord(record);
  }

  function markAgentNotificationsRead() {
    const count = notificationStore.markAllRead();
    if (count > 0) {
      rememberDedupeKeys(notificationStore.records());
      persistState();
    }
    updateStatusBar();
    return count;
  }

  function clearAgentNotifications() {
    const records = notificationStore.records();
    const count = notificationStore.clear();
    if (count > 0) {
      rememberDedupeKeys(records);
      persistState();
    }
    updateStatusBar();
    return count;
  }

  return {
    start,
    dispose,
    flush: pollEvents,
    showAgentNotifications,
    openAgentNotificationUri,
    openLatestAgentNotification,
    markAgentNotificationsRead,
    clearAgentNotifications,
    _store: notificationStore,
  };
}

module.exports = {
  CLEAR_AGENT_NOTIFICATIONS_COMMAND,
  DEFAULT_EVENTS_PATH,
  DEFAULT_SESSION_REGISTRY_PATH,
  RECORDS_STORAGE_KEY,
  SEEN_DEDUPE_KEYS_STORAGE_KEY,
  SEEN_EVENT_IDS_STORAGE_KEY,
  MARK_AGENT_NOTIFICATIONS_READ_COMMAND,
  OPEN_LATEST_AGENT_NOTIFICATION_COMMAND,
  SHOW_AGENT_NOTIFICATIONS_COMMAND,
  createAgentNotificationManager,
};
