const assert = require('node:assert/strict');
const test = require('node:test');

const { createAgentNotificationStore } = require('../src/agentNotificationStore');

function event(overrides = {}) {
  return {
    schemaVersion: 1,
    id: overrides.id ?? `event-${Math.random()}`,
    provider: 'codex',
    event: 'turn_finished',
    severity: 'success',
    sessionId: 'session-1',
    cwd: '/tmp/project',
    title: 'Codex finished',
    createdAt: overrides.createdAt ?? Date.now(),
    dedupeKey: overrides.dedupeKey ?? 'codex:session-1:turn_finished',
    source: { hookEventName: 'Stop' },
    ...overrides,
  };
}

test('store inserts presentable records newest first and counts unread', () => {
  const store = createAgentNotificationStore();

  store.ingestEvent(event({ id: 'old', createdAt: 1000, dedupeKey: 'old' }));
  store.ingestEvent(event({ id: 'new', createdAt: 2000, dedupeKey: 'new' }));

  assert.deepEqual(store.records().map((record) => record.id), ['new', 'old']);
  assert.equal(store.unreadCount(), 2);
  assert.equal(store.latestUnread().id, 'new');
});

test('store dedupes by dedupeKey and keeps the newest record', () => {
  const store = createAgentNotificationStore();

  store.ingestEvent(event({ id: 'first', createdAt: 1000, body: 'first' }));
  store.ingestEvent(event({ id: 'second', createdAt: 2000, body: 'second' }));

  assert.deepEqual(store.records().map((record) => record.id), ['second']);
  assert.equal(store.records()[0].body, 'second');
});

test('prompt_submitted marks waiting records for the same session read without adding a record', () => {
  const store = createAgentNotificationStore();

  store.ingestEvent(event({
    id: 'needs-permission',
    event: 'permission_requested',
    severity: 'waiting',
    dedupeKey: 'permission',
  }));
  store.ingestEvent(event({
    id: 'other-session',
    event: 'permission_requested',
    severity: 'waiting',
    sessionId: 'session-2',
    dedupeKey: 'permission-other',
  }));

  const result = store.ingestEvent(event({
    id: 'prompt',
    event: 'prompt_submitted',
    severity: 'info',
    dedupeKey: 'prompt',
  }));

  assert.equal(result.record, undefined);
  assert.equal(store.records().length, 2);
  assert.deepEqual(
    store.records().map((record) => [record.id, record.isRead]),
    [
      ['other-session', false],
      ['needs-permission', true],
    ],
  );
  assert.equal(store.unreadCount(), 1);
});

test('focused terminal suppression records the event as read and skips presentation', () => {
  const store = createAgentNotificationStore();

  const result = store.ingestEvent(event({ id: 'focused' }), {
    isActiveTerminalFocused: true,
  });

  assert.equal(result.shouldPresent, false);
  assert.equal(result.record.isRead, true);
  assert.equal(store.unreadCount(), 0);
});

test('store marks all read and clears records', () => {
  const store = createAgentNotificationStore();
  store.ingestEvent(event({ id: 'one', dedupeKey: 'one' }));
  store.ingestEvent(event({ id: 'two', dedupeKey: 'two' }));

  assert.equal(store.markAllRead(), 2);
  assert.equal(store.unreadCount(), 0);
  assert.equal(store.clear(), 2);
  assert.deepEqual(store.records(), []);
});
