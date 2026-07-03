#!/usr/bin/env node

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const REGISTRY_VERSION = 1;
const MAX_RECORDS = 100;
const SESSION_ID_RE =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i;
const CLI_NAMES = new Set(['codex']);
const WALK_DEPTH_LIMIT = 16;

function normalizePid(value) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 1 ? parsed : undefined;
}

function normalizeSessionId(value) {
  const match = String(value ?? '').match(SESSION_ID_RE);
  return match?.[0]?.toLowerCase();
}

function normalizeCwd(value) {
  return typeof value === 'string' && value ? value : undefined;
}

function registryPath() {
  return (
    process.env.CODEX_SESSION_REGISTRY_PATH ||
    path.join(os.homedir(), '.codex', 'codex-vscode-terminal-tools', 'session-registry.json')
  );
}

function now() {
  const overridden = Number(process.env.CODEX_SESSION_REGISTRY_NOW_MS);
  return Number.isFinite(overridden) ? overridden : Date.now();
}

function readStdinSync() {
  try {
    return fs.readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

function readJsonFile(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJsonFileAtomic(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tmpPath, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(tmpPath, filePath);
}

function execFileText(command, args) {
  try {
    return execFileSync(command, args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 1000,
    }).trim();
  } catch {
    return '';
  }
}

function getCommandBaseName(pid) {
  const command = execFileText('ps', ['-p', String(pid), '-o', 'comm=']);
  return path.basename(command.replace(/^-/, ''));
}

function getParentPid(pid) {
  return normalizePid(execFileText('ps', ['-p', String(pid), '-o', 'ppid=']));
}

function findTerminalShellPid() {
  const overridden = normalizePid(process.env.CODEX_SESSION_REGISTRY_TERMINAL_PID);
  if (overridden) {
    return overridden;
  }

  let pid = process.pid;
  for (let depth = 0; depth < WALK_DEPTH_LIMIT; depth += 1) {
    const parent = getParentPid(pid);
    if (!parent) {
      return undefined;
    }
    const command = getCommandBaseName(parent);
    if (CLI_NAMES.has(command)) {
      return getParentPid(parent);
    }
    pid = parent;
  }

  return undefined;
}

function normalizeRegistry(source) {
  const bySessionId = new Map();

  for (const record of Array.isArray(source?.records) ? source.records : []) {
    const sessionId = normalizeSessionId(record?.sessionId ?? record?.session_id);
    if (!sessionId) {
      continue;
    }

    const normalized = {
      sessionId,
      updatedAt: Number.isFinite(Number(record.updatedAt)) ? Number(record.updatedAt) : 0,
    };
    const cwd = normalizeCwd(record.cwd);
    const terminalPid = normalizePid(record.terminalPid);

    if (cwd) {
      normalized.cwd = cwd;
    }
    if (typeof record.hookEventName === 'string' && record.hookEventName) {
      normalized.hookEventName = record.hookEventName;
    }
    if (terminalPid) {
      normalized.terminalPid = terminalPid;
    }

    const existing = bySessionId.get(sessionId);
    if (!existing || normalized.updatedAt >= existing.updatedAt) {
      bySessionId.set(sessionId, normalized);
    }
  }

  return {
    version: REGISTRY_VERSION,
    records: Array.from(bySessionId.values())
      .sort((left, right) => right.updatedAt - left.updatedAt)
      .slice(0, MAX_RECORDS),
  };
}

function recordSessionStart(payload) {
  if (payload?.hook_event_name !== 'SessionStart') {
    return;
  }

  const sessionId = normalizeSessionId(
    payload.session_id ?? payload.thread_id ?? payload['thread-id'],
  );
  if (!sessionId) {
    return;
  }

  const filePath = registryPath();
  const registry = normalizeRegistry(readJsonFile(filePath, {}));
  const nextRecord = {
    sessionId,
    hookEventName: 'SessionStart',
    updatedAt: now(),
  };
  const cwd = normalizeCwd(payload.cwd ?? process.cwd());
  const terminalPid = findTerminalShellPid();

  if (cwd) {
    nextRecord.cwd = cwd;
  }
  if (terminalPid) {
    nextRecord.terminalPid = terminalPid;
  }

  writeJsonFileAtomic(
    filePath,
    normalizeRegistry({
      records: [nextRecord, ...registry.records],
    }),
  );
}

function main() {
  try {
    const raw = readStdinSync();
    const payload = raw ? JSON.parse(raw) : {};
    recordSessionStart(payload);
  } catch {
    // Hooks are best-effort; never block Codex startup.
  }

  process.stdout.write('{}');
}

main();
