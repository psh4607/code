#!/usr/bin/env node

const fs = require('node:fs');

const workbenchPath =
  process.env.VSCODE_WORKBENCH_MAIN ||
  '/Applications/Code.app/Contents/Resources/app/out/vs/workbench/workbench.desktop.main.js';

const extensionIdentifier = 'seongho.codex-vscode-terminal-tools';
const patchMarker =
  'codex-vscode-terminal-tools: sticky-notifications';
const urgentSourcesPattern =
  /([A-Za-z_$][\w$]*\.URGENT_NOTIFICATION_SOURCES=\["vscode\.github-authentication","vscode\.microsoft-authentication")(]\s*,)/g;

function timestamp() {
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-');
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

if (!fs.existsSync(workbenchPath)) {
  fail(`VS Code workbench bundle not found: ${workbenchPath}`);
}

const source = fs.readFileSync(workbenchPath, 'utf8');

if (source.includes(patchMarker)) {
  if (source.includes(extensionIdentifier)) {
    console.log(`Already patched: ${workbenchPath}`);
    process.exit(0);
  }

  fail('Found an unknown sticky notifications patch marker. Re-check workbench bundle before patching.');
}

if (!source.includes('sticky:c')) {
  fail('Could not find VS Code notification sticky source path. Re-check workbench bundle before patching.');
}

const matches = [...source.matchAll(urgentSourcesPattern)];
if (matches.length !== 1) {
  fail('Could not apply VS Code sticky notifications patch safely. Re-check workbench bundle before patching.');
}

const nextSource = source.replace(
  urgentSourcesPattern,
  `$1,"${extensionIdentifier}"/* ${patchMarker}. Reapply with patch-vscode-sticky-notifications. */$2`,
);

const stat = fs.statSync(workbenchPath);
const backupPath = `${workbenchPath}.codex-backup-${timestamp()}-sticky-notifications`;
const tempPath = `${workbenchPath}.codex-tmp-${process.pid}.js`;

fs.copyFileSync(workbenchPath, backupPath);
fs.writeFileSync(tempPath, nextSource, { mode: stat.mode });
fs.chmodSync(tempPath, stat.mode);
fs.renameSync(tempPath, workbenchPath);

console.log(`Patched VS Code sticky notifications: ${workbenchPath}`);
console.log(`Backup: ${backupPath}`);
console.log('Fully quit and reopen VS Code for the sticky notification change to take effect.');
