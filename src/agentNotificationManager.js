const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { parseAgentNotificationJsonl } = require('./agentNotificationEvents');
const { createAgentNotificationStore } = require('./agentNotificationStore');

const DEFAULT_EVENTS_PATH = path.join(
  os.homedir(),
  '.codex',
  'codex-vscode-terminal-tools',
  'notifications',
  'events.jsonl',
);
const DEFAULT_POLL_INTERVAL_MS = 1000;
const SHOW_AGENT_NOTIFICATIONS_COMMAND = 'codexTerminal.showAgentNotifications';
const OPEN_LATEST_AGENT_NOTIFICATION_COMMAND = 'codexTerminal.openLatestAgentNotification';
const MARK_AGENT_NOTIFICATIONS_READ_COMMAND = 'codexTerminal.markAgentNotificationsRead';
const CLEAR_AGENT_NOTIFICATIONS_COMMAND = 'codexTerminal.clearAgentNotifications';
const RECORDS_STORAGE_KEY = 'codexTerminal.agentNotifications.records';
const SEEN_EVENT_IDS_STORAGE_KEY = 'codexTerminal.agentNotifications.seenEventIds';
const MAX_SEEN_EVENT_IDS = 1000;

function readFileDefault(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return '';
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

function formatTooltip(record, unreadCount) {
  const text = [record?.title, record?.body || record?.subtitle].filter(Boolean).join('\n');
  return text ? `${unreadCount} unread\n${text}` : `${unreadCount} unread agent notification(s)`;
}

function readStoredArray(context, key) {
  const value = context?.globalState?.get?.(key, []);
  return Array.isArray(value) ? value : [];
}

function createAgentNotificationManager(vscode, {
  context,
  eventsPath = DEFAULT_EVENTS_PATH,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
  readFile = readFileDefault,
  setIntervalFn = setInterval,
  clearIntervalFn = clearInterval,
  store,
} = {}) {
  const seenEventIds = new Set(readStoredArray(context, SEEN_EVENT_IDS_STORAGE_KEY));
  const notificationStore = store || createAgentNotificationStore({
    initialRecords: readStoredArray(context, RECORDS_STORAGE_KEY),
  });
  let statusBarItem;
  let pollTimer;
  let started = false;

  function persistState() {
    if (!context?.globalState?.update) {
      return;
    }
    const seenIds = Array.from(seenEventIds).slice(-MAX_SEEN_EVENT_IDS);
    void context.globalState.update(SEEN_EVENT_IDS_STORAGE_KEY, seenIds);
    void context.globalState.update(RECORDS_STORAGE_KEY, notificationStore.records());
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
    if (!record?.terminalPid) {
      return undefined;
    }
    for (const terminal of uniqueTerminals(vscode)) {
      if ((await terminalPid(terminal)) === record.terminalPid) {
        return terminal;
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

  async function openRecord(record) {
    const terminal = await findTerminalForRecord(record);
    if (!terminal) {
      return false;
    }
    terminal.show();
    if (notificationStore.markRead(record.id)) {
      persistState();
    }
    updateStatusBar();
    return true;
  }

  async function presentRecord(record) {
    const selected = await vscode.window.showInformationMessage(
      record.body ? `${record.title}: ${record.body}` : record.title,
      'Open Terminal',
      'Mark Read',
    );
    if (selected === 'Open Terminal') {
      await openRecord(record);
    } else if (selected === 'Mark Read') {
      if (notificationStore.markRead(record.id)) {
        persistState();
      }
      updateStatusBar();
    }
  }

  async function ingestEvent(event) {
    if (seenEventIds.has(event.id)) {
      return;
    }
    seenEventIds.add(event.id);
    const result = notificationStore.ingestEvent(event, {
      isActiveTerminalFocused: await isActiveFocusedRecord(event),
    });
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
  }

  async function showAgentNotifications() {
    const items = notificationStore.records().map((record) => ({
      label: record.title,
      description: record.body || record.subtitle || '',
      detail: record.cwd || record.sessionId || '',
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

  function markAgentNotificationsRead() {
    const count = notificationStore.markAllRead();
    if (count > 0) {
      persistState();
    }
    updateStatusBar();
    return count;
  }

  function clearAgentNotifications() {
    const count = notificationStore.clear();
    if (count > 0) {
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
    openLatestAgentNotification,
    markAgentNotificationsRead,
    clearAgentNotifications,
    _store: notificationStore,
  };
}

module.exports = {
  CLEAR_AGENT_NOTIFICATIONS_COMMAND,
  DEFAULT_EVENTS_PATH,
  RECORDS_STORAGE_KEY,
  SEEN_EVENT_IDS_STORAGE_KEY,
  MARK_AGENT_NOTIFICATIONS_READ_COMMAND,
  OPEN_LATEST_AGENT_NOTIFICATION_COMMAND,
  SHOW_AGENT_NOTIFICATIONS_COMMAND,
  createAgentNotificationManager,
};
