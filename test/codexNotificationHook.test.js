const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const SCRIPT_PATH = path.join(__dirname, '..', 'scripts', 'codex-notification-hook.js');

function runHook(input, env = {}) {
  return spawnSync(process.execPath, [SCRIPT_PATH], {
    input,
    encoding: 'utf8',
    env: {
      ...process.env,
      ...env,
    },
  });
}

test('Codex notification hook appends a normalized event and prints an empty response', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-notification-hook-'));
  const eventsPath = path.join(dir, 'events.jsonl');

  const result = runHook(JSON.stringify({
    hook_event_name: 'PermissionRequest',
    session_id: '00000000-0000-4000-8000-000000000011',
    cwd: '/tmp/project',
    tool_name: 'Bash',
    tool_input: { command: 'npm test' },
  }), {
    CODEX_AGENT_NOTIFICATION_EVENTS_PATH: eventsPath,
    CODEX_AGENT_NOTIFICATION_NOW_MS: '1234',
  });

  assert.equal(result.status, 0);
  assert.equal(result.stdout, '{}');
  assert.equal(result.stderr, '');

  const lines = fs.readFileSync(eventsPath, 'utf8').trim().split('\n');
  assert.equal(lines.length, 1);
  const event = JSON.parse(lines[0]);
  assert.equal(event.event, 'permission_requested');
  assert.equal(event.createdAt, 1234);
  assert.equal(event.body, 'Bash: npm test');
});

test('Codex notification hook ignores malformed stdin without failing', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-notification-hook-'));
  const eventsPath = path.join(dir, 'events.jsonl');

  const result = runHook('{bad json', {
    CODEX_AGENT_NOTIFICATION_EVENTS_PATH: eventsPath,
  });

  assert.equal(result.status, 0);
  assert.equal(result.stdout, '{}');
  assert.equal(result.stderr, '');
  assert.equal(fs.existsSync(eventsPath), false);
});

test('Codex notification hook ignores unsupported hook events without writing', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-notification-hook-'));
  const eventsPath = path.join(dir, 'events.jsonl');

  const result = runHook(JSON.stringify({
    hook_event_name: 'PreCompact',
    session_id: '00000000-0000-4000-8000-000000000012',
  }), {
    CODEX_AGENT_NOTIFICATION_EVENTS_PATH: eventsPath,
  });

  assert.equal(result.status, 0);
  assert.equal(result.stdout, '{}');
  assert.equal(result.stderr, '');
  assert.equal(fs.existsSync(eventsPath), false);
});
