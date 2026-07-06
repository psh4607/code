#!/usr/bin/env node

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { normalizeCodexHookPayload } = require('../src/agentNotificationEvents');

const DEFAULT_EVENTS_PATH = path.join(
  os.homedir(),
  '.codex',
  'codex-vscode-terminal-tools',
  'notifications',
  'events.jsonl',
);

function eventsPath() {
  return process.env.CODEX_AGENT_NOTIFICATION_EVENTS_PATH || DEFAULT_EVENTS_PATH;
}

function now() {
  const overridden = Number(process.env.CODEX_AGENT_NOTIFICATION_NOW_MS);
  return Number.isFinite(overridden) ? overridden : Date.now();
}

function readStdinSync() {
  try {
    return fs.readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

function appendEvent(filePath, event) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, `${JSON.stringify(event)}\n`);
}

function main() {
  try {
    const raw = readStdinSync();
    const payload = raw ? JSON.parse(raw) : {};
    const event = normalizeCodexHookPayload(payload, { now });
    if (event) {
      appendEvent(eventsPath(), event);
    }
  } catch {
    // Hooks are best-effort. Never block Codex startup or turn completion.
  }

  process.stdout.write('{}');
}

main();
