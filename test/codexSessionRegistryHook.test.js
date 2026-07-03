const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const HOOK_SCRIPT = path.join(__dirname, '..', 'scripts', 'codex-session-registry-hook.js');
const SESSION_ID_A = '019f2643-b7b8-76b2-baed-9faae1f809fd';
const SESSION_ID_B = '019f2643-1747-77e3-a2c8-8feb72a510a6';

function runHook(payload, env = {}) {
  return childProcess.spawnSync(process.execPath, [HOOK_SCRIPT], {
    encoding: 'utf8',
    input: JSON.stringify(payload),
    env: {
      ...process.env,
      ...env,
    },
  });
}

test('SessionStart hook records Codex session metadata and prints an empty response', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-session-hook-test-'));
  const registryPath = path.join(tmpDir, 'registry.json');

  const result = runHook(
    {
      hook_event_name: 'SessionStart',
      session_id: SESSION_ID_A,
      cwd: '/tmp/codex-work',
    },
    {
      CODEX_SESSION_REGISTRY_PATH: registryPath,
      CODEX_SESSION_REGISTRY_NOW_MS: '12345',
      CODEX_SESSION_REGISTRY_TERMINAL_PID: '456',
    },
  );

  assert.equal(result.status, 0);
  assert.equal(result.stdout, '{}');
  assert.equal(result.stderr, '');
  assert.deepEqual(JSON.parse(fs.readFileSync(registryPath, 'utf8')), {
    version: 1,
    records: [
      {
        sessionId: SESSION_ID_A,
        cwd: '/tmp/codex-work',
        hookEventName: 'SessionStart',
        terminalPid: 456,
        updatedAt: 12345,
      },
    ],
  });
});

test('SessionStart hook keeps the newest record per session id first', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-session-hook-test-'));
  const registryPath = path.join(tmpDir, 'registry.json');

  fs.writeFileSync(
    registryPath,
    JSON.stringify({
      version: 1,
      records: [
        {
          sessionId: SESSION_ID_A,
          cwd: '/old',
          hookEventName: 'SessionStart',
          terminalPid: 111,
          updatedAt: 10,
        },
        {
          sessionId: SESSION_ID_B,
          cwd: '/other',
          hookEventName: 'SessionStart',
          terminalPid: 222,
          updatedAt: 20,
        },
      ],
    }),
  );

  const result = runHook(
    {
      hook_event_name: 'SessionStart',
      session_id: SESSION_ID_A,
      cwd: '/new',
    },
    {
      CODEX_SESSION_REGISTRY_PATH: registryPath,
      CODEX_SESSION_REGISTRY_NOW_MS: '30',
      CODEX_SESSION_REGISTRY_TERMINAL_PID: '333',
    },
  );

  assert.equal(result.status, 0);
  assert.deepEqual(JSON.parse(fs.readFileSync(registryPath, 'utf8')), {
    version: 1,
    records: [
      {
        sessionId: SESSION_ID_A,
        cwd: '/new',
        hookEventName: 'SessionStart',
        terminalPid: 333,
        updatedAt: 30,
      },
      {
        sessionId: SESSION_ID_B,
        cwd: '/other',
        hookEventName: 'SessionStart',
        terminalPid: 222,
        updatedAt: 20,
      },
    ],
  });
});

test('non-SessionStart hook payload is a no-op success', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-session-hook-test-'));
  const registryPath = path.join(tmpDir, 'registry.json');

  const result = runHook(
    {
      hook_event_name: 'Stop',
      session_id: SESSION_ID_A,
      cwd: '/tmp/codex-work',
    },
    {
      CODEX_SESSION_REGISTRY_PATH: registryPath,
    },
  );

  assert.equal(result.status, 0);
  assert.equal(result.stdout, '{}');
  assert.equal(fs.existsSync(registryPath), false);
});
