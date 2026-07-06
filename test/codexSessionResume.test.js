const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  CODEX_SESSION_RESUME_STORAGE_KEY,
  createCodexSessionResumeManager,
  createDefaultHasSavedSession,
  extractCodexResumeSessionId,
  extractCodexSessionId,
  isCodexProcessCommand,
  normalizeRecords,
  parsePsRowsWithCommand,
} = require('../src/codexSessionResume');

const SESSION_ID_A = '019f2643-b7b8-76b2-baed-9faae1f809fd';
const SESSION_ID_B = '019f2643-1747-77e3-a2c8-8feb72a510a6';
const HAS_SAVED_SESSION = async () => true;

function createGlobalState(initialRecords = []) {
  return {
    values: {
      [CODEX_SESSION_RESUME_STORAGE_KEY]: initialRecords,
    },
    get(key, fallback) {
      return this.values[key] ?? fallback;
    },
    async update(key, value) {
      this.values[key] = value;
    },
  };
}

function createTerminal({
  name,
  cwd,
  pid,
} = {}) {
  const sentText = [];
  return {
    name,
    sentText,
    processId: Promise.resolve(pid),
    shellIntegration: cwd
      ? {
          cwd: { fsPath: cwd },
        }
      : undefined,
    sendText(text, shouldExecute) {
      sentText.push([text, shouldExecute]);
    },
  };
}

function createFakeVscode({
  terminals = [],
  autoResume = true,
  startupDelayMs,
} = {}) {
  const listeners = {
    activeTerminal: [],
    endExecution: [],
    openTerminal: [],
    shellExecution: [],
    shellIntegration: [],
    terminalState: [],
  };

  return {
    listeners,
    vscode: {
      workspace: {
        getConfiguration(section) {
          assert.equal(section, 'codexTerminal');
          return {
            get(key, fallback) {
              if (key === 'autoResumeCodexSessions') {
                return autoResume;
              }
              if (key === 'codexResumeStartupDelayMs') {
                return startupDelayMs ?? fallback;
              }
              return fallback;
            },
          };
        },
      },
      window: {
        terminals,
        activeTerminal: terminals[0],
        onDidChangeActiveTerminal(listener) {
          listeners.activeTerminal.push(listener);
          return { dispose() {} };
        },
        onDidCloseTerminal() {
          return { dispose() {} };
        },
        onDidEndTerminalShellExecution(listener) {
          listeners.endExecution.push(listener);
          return { dispose() {} };
        },
        onDidOpenTerminal(listener) {
          listeners.openTerminal.push(listener);
          return { dispose() {} };
        },
        onDidStartTerminalShellExecution(listener) {
          listeners.shellExecution.push(listener);
          return { dispose() {} };
        },
        onDidChangeTerminalShellIntegration(listener) {
          listeners.shellIntegration.push(listener);
          return { dispose() {} };
        },
        onDidChangeTerminalState(listener) {
          listeners.terminalState.push(listener);
          return { dispose() {} };
        },
      },
    },
  };
}

test('extractCodexSessionId finds a Codex UUID in a terminal title', () => {
  assert.equal(
    extractCodexSessionId(`codex-vscode-terminal | ${SESSION_ID_A} | Fast off`),
    SESSION_ID_A,
  );
});

test('extractCodexResumeSessionId only accepts Codex resume invocations', () => {
  assert.equal(
    extractCodexResumeSessionId(`codex resume ${SESSION_ID_B}`),
    SESSION_ID_B,
  );
  assert.equal(
    extractCodexResumeSessionId({ value: `codex --profile medium resume ${SESSION_ID_B}` }),
    SESSION_ID_B,
  );
  assert.equal(
    extractCodexResumeSessionId(`echo codex resume ${SESSION_ID_B}`),
    undefined,
  );
});

test('parsePsRowsWithCommand preserves commands that contain spaces', () => {
  assert.deepEqual(
    parsePsRowsWithCommand(`101 1 /bin/zsh -l\n102 101 node /tmp/bin/codex resume ${SESSION_ID_A}\n`),
    [
      { pid: 101, ppid: 1, command: '/bin/zsh -l' },
      { pid: 102, ppid: 101, command: `node /tmp/bin/codex resume ${SESSION_ID_A}` },
    ],
  );
});

test('isCodexProcessCommand detects the CLI but ignores Codex app helper processes', () => {
  assert.equal(isCodexProcessCommand('/opt/homebrew/bin/codex resume 123'), true);
  assert.equal(isCodexProcessCommand('node /tmp/node_modules/.bin/codex'), true);
  assert.equal(
    isCodexProcessCommand(
      '/Applications/Codex.app/Contents/Resources/cua_node/bin/node_repl',
    ),
    false,
  );
  assert.equal(
    isCodexProcessCommand(
      '/Users/seongho/.codex/computer-use/Codex Computer Use.app/Contents/MacOS/SkyComputerUseClient',
    ),
    false,
  );
});

test('default saved session checker reads the Codex session index', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-session-index-test-'));
  try {
    fs.writeFileSync(
      path.join(tmpDir, 'session_index.jsonl'),
      `${JSON.stringify({ id: SESSION_ID_A, thread_name: 'saved' })}\n`,
    );
    const hasSavedSession = createDefaultHasSavedSession(tmpDir);

    assert.equal(await hasSavedSession(SESSION_ID_A), true);
    assert.equal(await hasSavedSession(SESSION_ID_B), false);
  } finally {
    fs.rmSync(tmpDir, { force: true, recursive: true });
  }
});

test('default saved session checker falls back to session filenames', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-session-file-test-'));
  try {
    const sessionDir = path.join(tmpDir, 'sessions', '2026', '07', '06');
    fs.mkdirSync(sessionDir, { recursive: true });
    fs.writeFileSync(
      path.join(sessionDir, `rollout-2026-07-06T12-00-47-${SESSION_ID_A}.jsonl`),
      '',
    );
    const hasSavedSession = createDefaultHasSavedSession(tmpDir);

    assert.equal(await hasSavedSession(SESSION_ID_A), true);
    assert.equal(await hasSavedSession(SESSION_ID_B), false);
  } finally {
    fs.rmSync(tmpDir, { force: true, recursive: true });
  }
});

test('manager snapshots Codex terminal metadata in tab order', async () => {
  const globalState = createGlobalState();
  const first = createTerminal({
    name: `inf | ${SESSION_ID_A} | Fast off`,
    cwd: '/Users/seongho/projects/dalpha/inf',
    pid: 101,
  });
  const second = createTerminal({
    name: `multi-pc | ${SESSION_ID_B} | Fast off`,
    cwd: '/Users/seongho/projects/seongho/projects/multi-pc-failover-plan',
    pid: 201,
  });
  const fake = createFakeVscode({ terminals: [first, second] });
  const manager = createCodexSessionResumeManager(fake.vscode, {
    context: { globalState },
    listProcesses: async () => [
      { pid: 101, ppid: 1, command: '/bin/zsh -l' },
      { pid: 102, ppid: 101, command: `/opt/homebrew/bin/codex resume ${SESSION_ID_A}` },
      { pid: 201, ppid: 1, command: '/bin/zsh -l' },
      { pid: 202, ppid: 201, command: `/opt/homebrew/bin/codex resume ${SESSION_ID_B}` },
    ],
    now: () => 1000,
    startTimers: false,
  });

  await manager.snapshotTerminals({ inspectProcesses: true });

  assert.deepEqual(globalState.values[CODEX_SESSION_RESUME_STORAGE_KEY], [
    {
      codexProcessActive: true,
      cwd: '/Users/seongho/projects/dalpha/inf',
      lastCodexProcessCheckAt: 1000,
      lastObservedCodexProcessAt: 1000,
      lastSeenAt: 1000,
      processId: 101,
      sessionId: SESSION_ID_A,
      terminalIndex: 0,
      title: `inf | ${SESSION_ID_A} | Fast off`,
    },
    {
      codexProcessActive: true,
      cwd: '/Users/seongho/projects/seongho/projects/multi-pc-failover-plan',
      lastCodexProcessCheckAt: 1000,
      lastObservedCodexProcessAt: 1000,
      lastSeenAt: 1000,
      processId: 201,
      sessionId: SESSION_ID_B,
      terminalIndex: 1,
      title: `multi-pc | ${SESSION_ID_B} | Fast off`,
    },
  ]);
});

test('manager records a Codex resume command from shell execution', async () => {
  const globalState = createGlobalState();
  const terminal = createTerminal({
    name: 'custom codex terminal',
    cwd: '/tmp/codex-work',
    pid: 101,
  });
  const fake = createFakeVscode({ terminals: [terminal] });
  const manager = createCodexSessionResumeManager(fake.vscode, {
    context: { globalState },
    listProcesses: async () => [],
    now: () => 2000,
    startTimers: false,
  });

  await manager.recordShellExecution({
    terminal,
    execution: { commandLine: { value: `codex resume ${SESSION_ID_A}` } },
  });

  assert.deepEqual(globalState.values[CODEX_SESSION_RESUME_STORAGE_KEY], [
    {
      codexProcessActive: true,
      cwd: '/tmp/codex-work',
      lastObservedCodexProcessAt: 2000,
      lastSeenAt: 2000,
      processId: 101,
      sessionId: SESSION_ID_A,
      terminalIndex: 0,
      title: 'custom codex terminal',
    },
  ]);
});

test('manager snapshots a title-hidden Codex session from the hook registry', async () => {
  const globalState = createGlobalState();
  const terminal = createTerminal({
    name: 'inf review',
    cwd: '/Users/seongho/projects/dalpha/inf',
    pid: 101,
  });
  const fake = createFakeVscode({ terminals: [terminal] });
  const manager = createCodexSessionResumeManager(fake.vscode, {
    context: { globalState },
    listProcesses: async () => [
      { pid: 101, ppid: 1, command: '/bin/zsh -l' },
      { pid: 102, ppid: 101, command: '/opt/homebrew/bin/codex' },
    ],
    loadSessionRegistryRecords: async () => [
      {
        sessionId: SESSION_ID_A,
        cwd: '/Users/seongho/projects/dalpha/inf',
        terminalPid: 101,
        updatedAt: 900,
      },
    ],
    now: () => 1000,
    startTimers: false,
  });

  await manager.snapshotTerminals({ inspectProcesses: true });

  assert.deepEqual(globalState.values[CODEX_SESSION_RESUME_STORAGE_KEY], [
    {
      codexProcessActive: true,
      cwd: '/Users/seongho/projects/dalpha/inf',
      lastCodexProcessCheckAt: 1000,
      lastObservedCodexProcessAt: 1000,
      lastSeenAt: 1000,
      processId: 101,
      sessionId: SESSION_ID_A,
      terminalIndex: 0,
      title: 'inf review',
    },
  ]);
});

test('manager auto-resumes a restored shell from the matching stored Codex record', async () => {
  const terminal = createTerminal({
    name: `inf | ${SESSION_ID_A} | Fast off`,
    cwd: '/Users/seongho/projects/dalpha/inf',
    pid: 101,
  });
  const globalState = createGlobalState([
    {
      codexProcessActive: true,
      cwd: '/Users/seongho/projects/dalpha/inf',
      lastObservedCodexProcessAt: 900,
      lastSeenAt: 900,
      processId: 501,
      sessionId: SESSION_ID_A,
      terminalIndex: 0,
      title: `inf | ${SESSION_ID_A} | Fast off`,
    },
  ]);
  const fake = createFakeVscode({ terminals: [terminal] });
  const manager = createCodexSessionResumeManager(fake.vscode, {
    context: { globalState },
    hasSavedSession: HAS_SAVED_SESSION,
    listProcesses: async () => [{ pid: 101, ppid: 1, command: '/bin/zsh -l' }],
    now: () => 1000,
    startTimers: false,
  });

  await manager.restoreCodexSessions();

  assert.deepEqual(terminal.sentText, [[`codex resume ${SESSION_ID_A}`, true]]);
  assert.equal(
    globalState.values[CODEX_SESSION_RESUME_STORAGE_KEY][0].lastAutoResumedAt,
    1000,
  );
});

test('manager auto-resumes an idle shell from a hook registry pid match', async () => {
  const terminal = createTerminal({
    name: 'inf review',
    cwd: '/Users/seongho/projects/dalpha/inf',
    pid: 101,
  });
  const globalState = createGlobalState();
  const fake = createFakeVscode({ terminals: [terminal] });
  const manager = createCodexSessionResumeManager(fake.vscode, {
    context: { globalState },
    hasSavedSession: HAS_SAVED_SESSION,
    listProcesses: async () => [{ pid: 101, ppid: 1, command: '/bin/zsh -l' }],
    loadSessionRegistryRecords: async () => [
      {
        sessionId: SESSION_ID_A,
        cwd: '/Users/seongho/projects/dalpha/inf',
        terminalPid: 101,
        updatedAt: 900,
      },
    ],
    now: () => 1000,
    startTimers: false,
  });

  await manager.restoreCodexSessions();

  assert.deepEqual(terminal.sentText, [[`codex resume ${SESSION_ID_A}`, true]]);
  assert.deepEqual(globalState.values[CODEX_SESSION_RESUME_STORAGE_KEY], [
    {
      codexProcessActive: true,
      cwd: '/Users/seongho/projects/dalpha/inf',
      lastAutoResumedAt: 1000,
      lastCodexProcessCheckAt: 1000,
      lastRestoreCheckedAt: 1000,
      lastRestoreDecision: 'sent',
      lastSeenAt: 1000,
      processId: 101,
      sessionId: SESSION_ID_A,
      terminalIndex: 0,
      title: 'inf review',
    },
  ]);
});

test('manager confirms a sent auto-resume after observing the Codex process', async () => {
  const terminal = createTerminal({
    name: `inf | ${SESSION_ID_A} | Fast off`,
    cwd: '/Users/seongho/projects/dalpha/inf',
    pid: 101,
  });
  const globalState = createGlobalState([
    {
      codexProcessActive: true,
      cwd: '/Users/seongho/projects/dalpha/inf',
      lastAutoResumedAt: 1000,
      lastCodexProcessCheckAt: 1000,
      lastRestoreCheckedAt: 1000,
      lastRestoreDecision: 'sent',
      lastSeenAt: 1000,
      processId: 101,
      sessionId: SESSION_ID_A,
      terminalIndex: 0,
      title: `inf | ${SESSION_ID_A} | Fast off`,
    },
  ]);
  const fake = createFakeVscode({ terminals: [terminal] });
  const manager = createCodexSessionResumeManager(fake.vscode, {
    context: { globalState },
    listProcesses: async () => [
      { pid: 101, ppid: 1, command: '/bin/zsh -l' },
      { pid: 102, ppid: 101, command: `/opt/homebrew/bin/codex resume ${SESSION_ID_A}` },
    ],
    now: () => 2000,
    startTimers: false,
  });

  await manager.snapshotTerminals({ inspectProcesses: true });

  assert.equal(
    globalState.values[CODEX_SESSION_RESUME_STORAGE_KEY][0].lastRestoreDecision,
    'confirmed',
  );
  assert.equal(
    globalState.values[CODEX_SESSION_RESUME_STORAGE_KEY][0].lastAutoResumeConfirmedAt,
    2000,
  );
});

test('manager marks a sent auto-resume as unconfirmed after the grace period', async () => {
  const terminal = createTerminal({
    name: `inf | ${SESSION_ID_A} | Fast off`,
    cwd: '/Users/seongho/projects/dalpha/inf',
    pid: 101,
  });
  const globalState = createGlobalState([
    {
      codexProcessActive: true,
      cwd: '/Users/seongho/projects/dalpha/inf',
      lastAutoResumedAt: 1000,
      lastCodexProcessCheckAt: 1000,
      lastRestoreCheckedAt: 1000,
      lastRestoreDecision: 'sent',
      lastSeenAt: 1000,
      processId: 101,
      sessionId: SESSION_ID_A,
      terminalIndex: 0,
      title: `inf | ${SESSION_ID_A} | Fast off`,
    },
  ]);
  const fake = createFakeVscode({ terminals: [terminal] });
  const manager = createCodexSessionResumeManager(fake.vscode, {
    context: { globalState },
    listProcesses: async () => [{ pid: 101, ppid: 1, command: '/bin/zsh -l' }],
    now: () => 7000,
    startTimers: false,
  });

  await manager.snapshotTerminals({ inspectProcesses: true });

  assert.equal(
    globalState.values[CODEX_SESSION_RESUME_STORAGE_KEY][0].lastRestoreDecision,
    'sent:no-confirmation',
  );
});

test('manager auto-resumes an idle shell when the restored title directly exposes a session id', async () => {
  const terminal = createTerminal({
    name: `inf | ${SESSION_ID_A} | Fast off`,
    cwd: '/Users/seongho/projects/dalpha/inf',
    pid: 101,
  });
  const globalState = createGlobalState();
  const fake = createFakeVscode({ terminals: [terminal] });
  const manager = createCodexSessionResumeManager(fake.vscode, {
    context: { globalState },
    hasSavedSession: HAS_SAVED_SESSION,
    listProcesses: async () => [{ pid: 101, ppid: 1, command: '/bin/zsh -l' }],
    now: () => 1000,
    startTimers: false,
  });

  await manager.restoreCodexSessions();

  assert.deepEqual(terminal.sentText, [[`codex resume ${SESSION_ID_A}`, true]]);
});

test('manager auto-resumes the latest same-tab same-cwd Codex record when restored title is only cwd', async () => {
  const terminal = createTerminal({
    name: '~/projects/seongho/projects/codex-vscode-terminal-tools',
    cwd: '/Users/seongho/projects/seongho/projects/codex-vscode-terminal-tools',
    pid: 101,
  });
  const globalState = createGlobalState([
    {
      codexProcessActive: true,
      cwd: '/Users/seongho/projects/seongho/projects/codex-vscode-terminal-tools',
      lastObservedCodexProcessAt: 100,
      lastSeenAt: 100,
      processId: 501,
      sessionId: SESSION_ID_A,
      terminalIndex: 0,
      title: `old | ${SESSION_ID_A} | Fast off`,
    },
    {
      codexProcessActive: true,
      cwd: '/Users/seongho/projects/seongho/projects/codex-vscode-terminal-tools',
      lastObservedCodexProcessAt: 900,
      lastSeenAt: 900,
      processId: 601,
      sessionId: SESSION_ID_B,
      terminalIndex: 0,
      title: `latest | ${SESSION_ID_B} | Fast off`,
    },
  ]);
  const fake = createFakeVscode({ terminals: [terminal] });
  const manager = createCodexSessionResumeManager(fake.vscode, {
    context: { globalState },
    hasSavedSession: HAS_SAVED_SESSION,
    listProcesses: async () => [{ pid: 101, ppid: 1, command: '/bin/zsh -l' }],
    now: () => 1000,
    startTimers: false,
  });

  await manager.restoreCodexSessions();

  assert.deepEqual(terminal.sentText, [[`codex resume ${SESSION_ID_B}`, true]]);
  assert.equal(
    globalState.values[CODEX_SESSION_RESUME_STORAGE_KEY][1].lastRestoreDecision,
    'sent',
  );
});

test('manager skips auto-resume when the saved Codex session is missing', async () => {
  const terminal = createTerminal({
    name: '~/projects/dalpha/inf',
    cwd: '/Users/seongho/projects/dalpha/inf',
    pid: 101,
  });
  const globalState = createGlobalState([
    {
      codexProcessActive: true,
      cwd: '/Users/seongho/projects/dalpha/inf',
      lastObservedCodexProcessAt: 900,
      lastSeenAt: 900,
      processId: 601,
      sessionId: SESSION_ID_A,
      terminalIndex: 0,
      title: `inf | ${SESSION_ID_A} | Fast off`,
    },
  ]);
  const fake = createFakeVscode({ terminals: [terminal] });
  const manager = createCodexSessionResumeManager(fake.vscode, {
    context: { globalState },
    hasSavedSession: async () => false,
    listProcesses: async () => [{ pid: 101, ppid: 1, command: '/bin/zsh -l' }],
    now: () => 1000,
    startTimers: false,
  });

  await manager.restoreCodexSessions();

  assert.deepEqual(terminal.sentText, []);
  assert.equal(
    globalState.values[CODEX_SESSION_RESUME_STORAGE_KEY][0].lastRestoreDecision,
    'skipped:missing-saved-session',
  );
});

test('manager does not auto-resume a cwd title from a different tab index', async () => {
  const terminal = createTerminal({
    name: '~/projects/dalpha/inf',
    cwd: '/Users/seongho/projects/dalpha/inf',
    pid: 101,
  });
  const globalState = createGlobalState([
    {
      codexProcessActive: true,
      cwd: '/Users/seongho/projects/dalpha/inf',
      lastObservedCodexProcessAt: 900,
      lastSeenAt: 900,
      processId: 501,
      sessionId: SESSION_ID_A,
      terminalIndex: 5,
      title: `inf | ${SESSION_ID_A} | Fast off`,
    },
  ]);
  const fake = createFakeVscode({ terminals: [terminal] });
  const manager = createCodexSessionResumeManager(fake.vscode, {
    context: { globalState },
    hasSavedSession: HAS_SAVED_SESSION,
    listProcesses: async () => [{ pid: 101, ppid: 1, command: '/bin/zsh -l' }],
    now: () => 1000,
    startTimers: false,
  });

  await manager.restoreCodexSessions();

  assert.deepEqual(terminal.sentText, []);
});

test('manager does not auto-resume when Codex is already alive under the terminal process', async () => {
  const terminal = createTerminal({
    name: `inf | ${SESSION_ID_A} | Fast off`,
    cwd: '/Users/seongho/projects/dalpha/inf',
    pid: 101,
  });
  const globalState = createGlobalState([
    {
      codexProcessActive: true,
      cwd: '/Users/seongho/projects/dalpha/inf',
      lastObservedCodexProcessAt: 900,
      lastSeenAt: 900,
      processId: 501,
      sessionId: SESSION_ID_A,
      terminalIndex: 0,
      title: `inf | ${SESSION_ID_A} | Fast off`,
    },
  ]);
  const fake = createFakeVscode({ terminals: [terminal] });
  const manager = createCodexSessionResumeManager(fake.vscode, {
    context: { globalState },
    listProcesses: async () => [
      { pid: 101, ppid: 1, command: '/bin/zsh -l' },
      { pid: 102, ppid: 101, command: `/opt/homebrew/bin/codex resume ${SESSION_ID_A}` },
    ],
    now: () => 1000,
    startTimers: false,
  });

  await manager.restoreCodexSessions();

  assert.deepEqual(terminal.sentText, []);
  assert.equal(
    globalState.values[CODEX_SESSION_RESUME_STORAGE_KEY][0].lastRestoreDecision,
    'skipped:codex-process-active',
  );
});

test('manager does not auto-resume a terminal that was last observed as an idle shell', async () => {
  const terminal = createTerminal({
    name: `inf | ${SESSION_ID_A} | Fast off`,
    cwd: '/Users/seongho/projects/dalpha/inf',
    pid: 101,
  });
  const globalState = createGlobalState([
    {
      codexProcessActive: false,
      cwd: '/Users/seongho/projects/dalpha/inf',
      lastObservedCodexProcessAt: 500,
      lastSeenAt: 900,
      processId: 501,
      sessionId: SESSION_ID_A,
      terminalIndex: 0,
      title: `inf | ${SESSION_ID_A} | Fast off`,
    },
  ]);
  const fake = createFakeVscode({ terminals: [terminal] });
  const manager = createCodexSessionResumeManager(fake.vscode, {
    context: { globalState },
    hasSavedSession: HAS_SAVED_SESSION,
    listProcesses: async () => [{ pid: 101, ppid: 1, command: '/bin/zsh -l' }],
    now: () => 1000,
    startTimers: false,
  });

  await manager.restoreCodexSessions();

  assert.deepEqual(terminal.sentText, []);
  assert.equal(
    globalState.values[CODEX_SESSION_RESUME_STORAGE_KEY][0].lastRestoreDecision,
    'skipped:not-resume-candidate',
  );
});

test('manager does not move a Codex record to an idle shell by cwd title only', async () => {
  const terminal = createTerminal({
    name: '~/projects/dalpha/inf',
    cwd: '/Users/seongho/projects/dalpha/inf',
    pid: 6755,
  });
  const globalState = createGlobalState([
    {
      codexProcessActive: true,
      cwd: '/Users/seongho/projects/dalpha/inf',
      lastObservedCodexProcessAt: 900,
      lastSeenAt: 900,
      processId: 6716,
      sessionId: SESSION_ID_A,
      terminalIndex: 5,
      title: '~/projects/dalpha/inf',
    },
  ]);
  const fake = createFakeVscode({ terminals: [terminal] });
  const manager = createCodexSessionResumeManager(fake.vscode, {
    context: { globalState },
    listProcesses: async () => [{ pid: 6755, ppid: 6465, command: '/bin/zsh -il' }],
    now: () => 1000,
    startTimers: false,
  });

  await manager.snapshotTerminals({ inspectProcesses: true });

  assert.deepEqual(globalState.values[CODEX_SESSION_RESUME_STORAGE_KEY], [
    {
      codexProcessActive: true,
      cwd: '/Users/seongho/projects/dalpha/inf',
      lastObservedCodexProcessAt: 900,
      lastSeenAt: 900,
      processId: 6716,
      sessionId: SESSION_ID_A,
      terminalIndex: 5,
      title: '~/projects/dalpha/inf',
    },
  ]);
});

test('manager does not send duplicate resume commands during one activation', async () => {
  const terminal = createTerminal({
    name: `inf | ${SESSION_ID_A} | Fast off`,
    cwd: '/Users/seongho/projects/dalpha/inf',
    pid: 101,
  });
  const globalState = createGlobalState([
    {
      codexProcessActive: true,
      cwd: '/Users/seongho/projects/dalpha/inf',
      lastObservedCodexProcessAt: 900,
      lastSeenAt: 900,
      processId: 501,
      sessionId: SESSION_ID_A,
      terminalIndex: 0,
      title: `inf | ${SESSION_ID_A} | Fast off`,
    },
  ]);
  const fake = createFakeVscode({ terminals: [terminal] });
  const manager = createCodexSessionResumeManager(fake.vscode, {
    context: { globalState },
    listProcesses: async () => [{ pid: 101, ppid: 1, command: '/bin/zsh -l' }],
    now: () => 1000,
    startTimers: false,
  });

  await manager.restoreCodexSessions();
  await manager.restoreCodexSessions();

  assert.deepEqual(terminal.sentText, [[`codex resume ${SESSION_ID_A}`, true]]);
});

test('manager honors the autoResumeCodexSessions setting', async () => {
  const terminal = createTerminal({
    name: `inf | ${SESSION_ID_A} | Fast off`,
    cwd: '/Users/seongho/projects/dalpha/inf',
    pid: 101,
  });
  const globalState = createGlobalState([
    {
      codexProcessActive: true,
      cwd: '/Users/seongho/projects/dalpha/inf',
      lastObservedCodexProcessAt: 900,
      lastSeenAt: 900,
      processId: 501,
      sessionId: SESSION_ID_A,
      terminalIndex: 0,
      title: `inf | ${SESSION_ID_A} | Fast off`,
    },
  ]);
  const fake = createFakeVscode({ terminals: [terminal], autoResume: false });
  const manager = createCodexSessionResumeManager(fake.vscode, {
    context: { globalState },
    listProcesses: async () => [{ pid: 101, ppid: 1, command: '/bin/zsh -l' }],
    now: () => 1000,
    startTimers: false,
  });

  await manager.restoreCodexSessions();

  assert.deepEqual(terminal.sentText, []);
});

test('manager startup does not clear a previous active Codex record before restore', async () => {
  const terminal = createTerminal({
    name: `inf | ${SESSION_ID_A} | Fast off`,
    cwd: '/Users/seongho/projects/dalpha/inf',
    pid: 101,
  });
  const globalState = createGlobalState([
    {
      codexProcessActive: true,
      cwd: '/Users/seongho/projects/dalpha/inf',
      lastObservedCodexProcessAt: 900,
      lastSeenAt: 900,
      processId: 501,
      sessionId: SESSION_ID_A,
      terminalIndex: 0,
      title: `inf | ${SESSION_ID_A} | Fast off`,
    },
  ]);
  const fake = createFakeVscode({ terminals: [terminal] });
  const manager = createCodexSessionResumeManager(fake.vscode, {
    context: { globalState },
    hasSavedSession: HAS_SAVED_SESSION,
    listProcesses: async () => [{ pid: 101, ppid: 1, command: '/bin/zsh -l' }],
    now: () => 1000,
    startupDelayMs: 0,
    clearTimeout: (handle) => clearTimeout(handle.id),
    setInterval: () => ({ unref() {} }),
    setTimeout: (callback, delayMs) => ({ id: setTimeout(callback, delayMs) }),
  });

  manager.start();
  await manager.flush();
  manager.dispose();

  assert.deepEqual(terminal.sentText, [[`codex resume ${SESSION_ID_A}`, true]]);
});

test('manager retries auto-resume when shell integration arrives after startup', async () => {
  const terminal = createTerminal({
    name: '~/projects/dalpha/inf',
    pid: 101,
  });
  const globalState = createGlobalState([
    {
      codexProcessActive: true,
      cwd: '/Users/seongho/projects/dalpha/inf',
      lastObservedCodexProcessAt: 900,
      lastSeenAt: 900,
      processId: 501,
      sessionId: SESSION_ID_A,
      terminalIndex: 0,
      title: `inf | ${SESSION_ID_A} | Fast off`,
    },
  ]);
  const fake = createFakeVscode({ terminals: [terminal] });
  const manager = createCodexSessionResumeManager(fake.vscode, {
    context: { globalState },
    hasSavedSession: HAS_SAVED_SESSION,
    listProcesses: async () => [{ pid: 101, ppid: 1, command: '/bin/zsh -l' }],
    now: () => 1000,
    startTimers: false,
  });

  manager.start();
  await manager.flush();
  assert.deepEqual(terminal.sentText, []);

  terminal.shellIntegration = {
    cwd: { fsPath: '/Users/seongho/projects/dalpha/inf' },
  };
  fake.listeners.shellIntegration[0]();
  await manager.flush();
  manager.dispose();

  assert.deepEqual(terminal.sentText, [[`codex resume ${SESSION_ID_A}`, true]]);
});

test('manager retries auto-resume when terminal process state arrives after startup', async () => {
  const terminal = createTerminal({
    name: '~/projects/dalpha/inf',
    cwd: '/Users/seongho/projects/dalpha/inf',
  });
  const globalState = createGlobalState([
    {
      codexProcessActive: true,
      cwd: '/Users/seongho/projects/dalpha/inf',
      lastObservedCodexProcessAt: 900,
      lastSeenAt: 900,
      processId: 501,
      sessionId: SESSION_ID_A,
      terminalIndex: 0,
      title: `inf | ${SESSION_ID_A} | Fast off`,
    },
  ]);
  const fake = createFakeVscode({ terminals: [terminal] });
  const manager = createCodexSessionResumeManager(fake.vscode, {
    context: { globalState },
    hasSavedSession: HAS_SAVED_SESSION,
    listProcesses: async () => [{ pid: 101, ppid: 1, command: '/bin/zsh -l' }],
    now: () => 1000,
    startTimers: false,
  });

  manager.start();
  await manager.flush();
  assert.deepEqual(terminal.sentText, []);

  terminal.processId = Promise.resolve(101);
  fake.listeners.terminalState[0]();
  await manager.flush();
  manager.dispose();

  assert.deepEqual(terminal.sentText, [[`codex resume ${SESSION_ID_A}`, true]]);
});

test('manager does not auto-resume a new cwd-title terminal opened after startup', async () => {
  const terminal = createTerminal({
    name: '~/projects/dalpha/inf',
    cwd: '/Users/seongho/projects/dalpha/inf',
    pid: 101,
  });
  const globalState = createGlobalState([
    {
      codexProcessActive: true,
      cwd: '/Users/seongho/projects/dalpha/inf',
      lastObservedCodexProcessAt: 900,
      lastSeenAt: 900,
      processId: 501,
      sessionId: SESSION_ID_A,
      terminalIndex: 0,
      title: `inf | ${SESSION_ID_A} | Fast off`,
    },
  ]);
  const fake = createFakeVscode({ terminals: [] });
  const manager = createCodexSessionResumeManager(fake.vscode, {
    context: { globalState },
    hasSavedSession: HAS_SAVED_SESSION,
    listProcesses: async () => [{ pid: 101, ppid: 1, command: '/bin/zsh -l' }],
    now: () => 1000,
    startTimers: false,
  });

  manager.start();
  await manager.flush();

  fake.vscode.window.terminals.push(terminal);
  fake.vscode.window.activeTerminal = terminal;
  fake.listeners.openTerminal[0](terminal);
  fake.listeners.shellIntegration[0]();
  fake.listeners.terminalState[0]();
  await manager.flush();
  manager.dispose();

  assert.deepEqual(terminal.sentText, []);
});

test('manager stops cwd-title auto-resume for startup terminals after the restore window', async () => {
  let currentTime = 1000;
  const terminal = createTerminal({
    name: '~/projects/dalpha/inf',
    cwd: '/Users/seongho/projects/dalpha/inf',
    pid: 101,
  });
  const globalState = createGlobalState([
    {
      codexProcessActive: true,
      cwd: '/Users/seongho/projects/dalpha/inf',
      lastObservedCodexProcessAt: 900,
      lastSeenAt: 900,
      processId: 501,
      sessionId: SESSION_ID_A,
      terminalIndex: 0,
      title: `inf | ${SESSION_ID_A} | Fast off`,
    },
  ]);
  const fake = createFakeVscode({ terminals: [terminal] });
  const manager = createCodexSessionResumeManager(fake.vscode, {
    context: { globalState },
    hasSavedSession: HAS_SAVED_SESSION,
    listProcesses: async () => [{ pid: 101, ppid: 1, command: '/bin/zsh -l' }],
    now: () => currentTime,
    startTimers: false,
    startupRestoreWindowMs: 1000,
  });

  manager.start();
  await manager.flush();

  currentTime = 3001;
  fake.listeners.terminalState[0]();
  await manager.flush();
  manager.dispose();

  assert.deepEqual(terminal.sentText, []);
});

test('manager auto-resumes Codex sessions one second after startup by default', () => {
  const globalState = createGlobalState();
  const fake = createFakeVscode();
  let timeoutMs;
  const manager = createCodexSessionResumeManager(fake.vscode, {
    clearInterval() {},
    clearTimeout() {},
    context: { globalState },
    listProcesses: async () => [],
    setInterval: () => ({ unref() {} }),
    setTimeout: (_callback, delayMs) => {
      timeoutMs = delayMs;
      return { unref() {} };
    },
  });

  manager.start();
  manager.dispose();

  assert.equal(timeoutMs, 1000);
});

test('manager snapshots Codex process state every three seconds by default', () => {
  const globalState = createGlobalState();
  const fake = createFakeVscode();
  let intervalMs;
  const manager = createCodexSessionResumeManager(fake.vscode, {
    clearInterval() {},
    clearTimeout() {},
    context: { globalState },
    listProcesses: async () => [],
    setInterval: (_callback, delayMs) => {
      intervalMs = delayMs;
      return { unref() {} };
    },
    setTimeout: () => ({ unref() {} }),
  });

  manager.start();
  manager.dispose();

  assert.equal(intervalMs, 3000);
});

test('normalizeRecords keeps the most recent record per session id', () => {
  assert.deepEqual(
    normalizeRecords([
      {
        sessionId: SESSION_ID_A,
        title: 'old',
        lastSeenAt: 1,
        terminalIndex: 1,
      },
      {
        sessionId: SESSION_ID_A,
        title: 'new',
        lastSeenAt: 2,
        terminalIndex: 0,
      },
    ]),
    [
      {
        codexProcessActive: false,
        lastSeenAt: 2,
        sessionId: SESSION_ID_A,
        terminalIndex: 0,
        title: 'new',
      },
    ],
  );
});
