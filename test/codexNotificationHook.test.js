const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const HOOK_SCRIPT = path.join(__dirname, '..', 'scripts', 'codex-notification-hook.js');

function runRawHook(input, env = {}) {
  return childProcess.spawnSync(process.execPath, [HOOK_SCRIPT], {
    encoding: 'utf8',
    input,
    env: {
      ...process.env,
      ...env,
    },
  });
}

function runHook(payload, env = {}) {
  return runRawHook(JSON.stringify(payload), env);
}

test('Codex notification hook appends a normalized event and prints an empty response', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-notification-hook-test-'));
  const eventsPath = path.join(tmpDir, 'events.jsonl');

  const result = runHook(
    {
      hook_event_name: 'PermissionRequest',
      session_id: '00000000-0000-4000-8000-000000000011',
      cwd: '/tmp/project',
      tool_name: 'Bash',
      tool_input: { command: 'npm test' },
    },
    {
      CODEX_AGENT_NOTIFICATION_EVENTS_PATH: eventsPath,
      CODEX_AGENT_NOTIFICATION_NOW_MS: '1234',
    },
  );

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

test('Stop hook uses the matching transcript user prompt as the completed notification title', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-notification-hook-test-'));
  const eventsPath = path.join(tmpDir, 'events.jsonl');
  const transcriptPath = path.join(tmpDir, 'transcript.jsonl');
  const turnId = '019f3708-b336-7732-81cd-f27467622c6c';

  fs.writeFileSync(transcriptPath, [
    JSON.stringify({
      type: 'response_item',
      payload: {
        type: 'message',
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: '음\n\n1, 2, 3, 은 좋아.\n\n다만 1에서 완료 문구만 바로 제목에 내용을 적어줘 알림 문구 개선 이렇게..!',
          },
        ],
        internal_chat_message_metadata_passthrough: {
          turn_id: turnId,
        },
      },
    }),
    '',
  ].join('\n'));

  const result = runHook(
    {
      hook_event_name: 'Stop',
      session_id: '019f3640-3432-7612-9c11-9902ef1b7245',
      cwd: '/tmp/codex-vscode-terminal-tools',
      transcript_path: transcriptPath,
      turn_id: turnId,
    },
    {
      CODEX_AGENT_NOTIFICATION_EVENTS_PATH: eventsPath,
      CODEX_AGENT_NOTIFICATION_NOW_MS: '3000',
    },
  );

  assert.equal(result.status, 0);
  assert.equal(result.stdout, '{}');
  const [event] = fs.readFileSync(eventsPath, 'utf8').trim().split('\n').map(JSON.parse);
  assert.equal(event.event, 'turn_finished');
  assert.equal(event.title, '알림 문구 개선');
  assert.equal(event.body, undefined);
});

test('Codex notification hook ignores malformed stdin without failing', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-notification-hook-test-'));
  const eventsPath = path.join(tmpDir, 'events.jsonl');

  const result = runRawHook('{bad json', {
    CODEX_AGENT_NOTIFICATION_EVENTS_PATH: eventsPath,
  });

  assert.equal(result.status, 0);
  assert.equal(result.stdout, '{}');
  assert.equal(result.stderr, '');
  assert.equal(fs.existsSync(eventsPath), false);
});

test('Codex notification hook ignores unsupported hook events without writing', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-notification-hook-test-'));
  const eventsPath = path.join(tmpDir, 'events.jsonl');

  const result = runHook(
    {
      hook_event_name: 'PreCompact',
      session_id: '00000000-0000-4000-8000-000000000012',
    },
    {
      CODEX_AGENT_NOTIFICATION_EVENTS_PATH: eventsPath,
    },
  );

  assert.equal(result.status, 0);
  assert.equal(result.stdout, '{}');
  assert.equal(result.stderr, '');
  assert.equal(fs.existsSync(eventsPath), false);
});
