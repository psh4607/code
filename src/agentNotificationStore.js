const {
  isPresentableAgentNotificationEvent,
  isValidAgentNotificationEvent,
} = require('./agentNotificationEvents');

const DEFAULT_MAX_RECORDS = 200;
const WAITING_EVENTS = new Set(['permission_requested', 'needs_input']);

function notificationSort(left, right) {
  return right.createdAt - left.createdAt || right.id.localeCompare(left.id);
}

function cloneRecord(record) {
  return {
    ...record,
    source: { ...(record.source || {}) },
  };
}

function normalizeInitialRecord(record) {
  if (!isValidAgentNotificationEvent(record)) {
    return undefined;
  }
  return {
    ...cloneRecord(record),
    isRead: Boolean(record.isRead),
    isPresented: Boolean(record.isPresented),
  };
}

function createAgentNotificationStore({ maxRecords = DEFAULT_MAX_RECORDS, initialRecords = [] } = {}) {
  let records = [];
  const presentedDedupeKeys = new Set();

  function replaceRecords(nextRecords) {
    records = nextRecords
      .sort(notificationSort)
      .slice(0, maxRecords);
  }

  replaceRecords(
    (Array.isArray(initialRecords) ? initialRecords : [])
      .map(normalizeInitialRecord)
      .filter(Boolean),
  );
  for (const record of records) {
    if (record.isPresented && record.dedupeKey) {
      presentedDedupeKeys.add(record.dedupeKey);
    }
  }

  function markWaitingReadForSession(sessionId) {
    if (!sessionId) {
      return 0;
    }
    let changed = 0;
    records = records.map((record) => {
      if (
        record.sessionId === sessionId &&
        WAITING_EVENTS.has(record.event) &&
        !record.isRead
      ) {
        changed += 1;
        return { ...record, isRead: true };
      }
      return record;
    });
    return changed;
  }

  function ingestEvent(event, context = {}) {
    if (!isValidAgentNotificationEvent(event)) {
      return { record: undefined, shouldPresent: false, changed: false };
    }

    if (event.event === 'prompt_submitted') {
      const changedCount = markWaitingReadForSession(event.sessionId);
      return { record: undefined, shouldPresent: false, changed: changedCount > 0 };
    }

    if (!isPresentableAgentNotificationEvent(event)) {
      return { record: undefined, shouldPresent: false, changed: false };
    }

    const existingRecord = records.find((record) => record.dedupeKey === event.dedupeKey);
    const shouldSuppressPresentation = Boolean(context.isActiveTerminalFocused);
    const wasPresented = presentedDedupeKeys.has(event.dedupeKey) || Boolean(existingRecord?.isPresented);
    const isRead = shouldSuppressPresentation || Boolean(existingRecord?.isRead);
    const shouldPresent = !isRead && !wasPresented;
    const record = {
      ...cloneRecord(event),
      isRead,
      isPresented: wasPresented || shouldPresent,
    };

    replaceRecords([
      record,
      ...records.filter((existing) => existing.dedupeKey !== event.dedupeKey),
    ]);

    if (record.isPresented) {
      presentedDedupeKeys.add(event.dedupeKey);
    }

    return { record: cloneRecord(record), shouldPresent, changed: true };
  }

  function unreadCount() {
    return records.filter((record) => !record.isRead).length;
  }

  function latestUnread() {
    return records.find((record) => !record.isRead);
  }

  function markAllRead() {
    let changed = 0;
    records = records.map((record) => {
      if (!record.isRead) {
        changed += 1;
        return { ...record, isRead: true };
      }
      return record;
    });
    return changed;
  }

  function markRead(id) {
    let changed = false;
    records = records.map((record) => {
      if (record.id === id && !record.isRead) {
        changed = true;
        return { ...record, isRead: true };
      }
      return record;
    });
    return changed;
  }

  function clear() {
    const count = records.length;
    records = [];
    presentedDedupeKeys.clear();
    return count;
  }

  return {
    ingestEvent,
    records: () => records.map(cloneRecord),
    unreadCount,
    latestUnread: () => {
      const record = latestUnread();
      return record ? cloneRecord(record) : undefined;
    },
    markRead,
    markAllRead,
    clear,
  };
}

module.exports = {
  createAgentNotificationStore,
};
