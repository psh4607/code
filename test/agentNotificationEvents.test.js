const assert = require('node:assert/strict');
const test = require('node:test');

const {
  parseAgentNotificationJsonl,
  normalizeCodexHookPayload,
  isPresentableAgentNotificationEvent,
} = require('../src/agentNotificationEvents');

test('SessionStart normalizes to a non-presented Codex session_started event', () => {
  const event = normalizeCodexHookPayload({
    hook_event_name: 'SessionStart',
    session_id: '00000000-0000-4000-8000-000000000001',
    cwd: '/tmp/project',
  }, { now: () => 1000 });

  assert.equal(event.provider, 'codex');
  assert.equal(event.event, 'session_started');
  assert.equal(event.severity, 'info');
  assert.equal(event.sessionId, '00000000-0000-4000-8000-000000000001');
  assert.equal(event.cwd, '/tmp/project');
  assert.equal(event.title, 'Codex session started');
  assert.equal(event.createdAt, 1000);
  assert.equal(event.source.hookEventName, 'SessionStart');
  assert.equal(isPresentableAgentNotificationEvent(event), false);
});

test('PermissionRequest normalizes to a waiting Codex permission_requested event', () => {
  const event = normalizeCodexHookPayload({
    hook_event_name: 'PermissionRequest',
    session_id: '00000000-0000-4000-8000-000000000002',
    cwd: '/tmp/project',
    tool_name: 'Bash',
    tool_input: { command: 'npm test' },
  }, { now: () => 2000 });

  assert.equal(event.event, 'permission_requested');
  assert.equal(event.severity, 'waiting');
  assert.equal(event.title, 'Codex needs permission');
  assert.equal(event.body, 'Bash: npm test');
  assert.equal(event.dedupeKey, 'codex:00000000-0000-4000-8000-000000000002:permission_requested:2000');
  assert.equal(event.source.toolName, 'Bash');
  assert.equal(isPresentableAgentNotificationEvent(event), true);
});

test('Stop normalizes to a success Codex turn_finished event', () => {
  const event = normalizeCodexHookPayload({
    hook_event_name: 'Stop',
    session_id: '00000000-0000-4000-8000-000000000003',
    cwd: '/tmp/project',
    transcript_path: '/tmp/transcript.jsonl',
  }, { now: () => 3000 });

  assert.equal(event.event, 'turn_finished');
  assert.equal(event.severity, 'success');
  assert.equal(event.title, 'Codex finished');
  assert.equal(event.subtitle, 'project');
  assert.equal(event.source.transcriptPath, '/tmp/transcript.jsonl');
  assert.equal(isPresentableAgentNotificationEvent(event), true);
});

test('presentable events without explicit turn ids still get distinct dedupe keys', () => {
  const basePayload = {
    hook_event_name: 'Stop',
    session_id: '00000000-0000-4000-8000-000000000003',
    cwd: '/tmp/project',
  };
  const first = normalizeCodexHookPayload(basePayload, { now: () => 3000 });
  const second = normalizeCodexHookPayload(basePayload, { now: () => 4000 });

  assert.notEqual(first.id, second.id);
  assert.notEqual(first.dedupeKey, second.dedupeKey);
});

test('parseAgentNotificationJsonl skips invalid lines and invalid records', () => {
  const valid = {
    schemaVersion: 1,
    id: 'event-1',
    provider: 'codex',
    event: 'turn_finished',
    severity: 'success',
    title: 'Done',
    createdAt: 4000,
    dedupeKey: 'codex:s1:turn_finished',
    source: { hookEventName: 'Stop' },
  };

  assert.deepEqual(
    parseAgentNotificationJsonl([
      '{bad json',
      JSON.stringify({ ...valid, event: 'unsupported' }),
      JSON.stringify(valid),
      '',
    ].join('\n')),
    [valid],
  );
});
