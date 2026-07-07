#!/usr/bin/env node

const fs = require('node:fs');

const workbenchPath =
  process.env.VSCODE_WORKBENCH_MAIN ||
  '/Applications/Code.app/Contents/Resources/app/out/vs/workbench/workbench.desktop.main.js';

const extensionIdentifier = 'seongho.codex-vscode-terminal-tools';
const patchMarker =
  'codex-vscode-terminal-tools: sticky-notifications';
const replacementPatchMarker =
  'codex-vscode-terminal-tools: replace-notification-by-session';
const managedStickySourceSnippet =
  `"${extensionIdentifier}"/* ${patchMarker}. Reapply with patch-vscode-sticky-notifications. */`;
const urgentSourcesPattern =
  /([A-Za-z_$][\w$]*\.URGENT_NOTIFICATION_SOURCES=\["vscode\.github-authentication","vscode\.microsoft-authentication")(]\s*,)/g;
const urgentSourcesClassPattern =
  /([A-Za-z_$][\w$]*)\.URGENT_NOTIFICATION_SOURCES=/;
const notificationSourceSnippet =
  's||(s=d(4458,null));';
const notificationHandleSnippet =
  'let u=this._notificationService.notify({severity:i,message:e,actions:{primary:r,secondary:l},source:s,priority:c?3:0,sticky:c});U.once(u.onDidClose)(()=>{n(void 0)})';

function buildReplacementSnippet(serviceClassName) {
  return [
    `let m=s&&s.id==="${extensionIdentifier}"?`,
    '/^\\x1Fcodex-vscode-terminal-tools:replace-notification:([^\\x1F]+)\\x1F/.exec(e):void 0;',
    `m&&(e=e.slice(m[0].length),${serviceClassName}.CODEX_REPLACEABLE_NOTIFICATIONS||`,
    `(${serviceClassName}.CODEX_REPLACEABLE_NOTIFICATIONS=new Map),`,
    `${serviceClassName}.CODEX_REPLACEABLE_NOTIFICATIONS.get(m[1])?.close?.());`,
  ].join('');
}

function buildReplacementHandleSnippet(serviceClassName) {
  return [
    'let u=this._notificationService.notify({severity:i,message:e,actions:{primary:r,secondary:l},source:s,priority:c?3:0,sticky:c});',
    `m&&${serviceClassName}.CODEX_REPLACEABLE_NOTIFICATIONS.set(m[1],u);`,
    `U.once(u.onDidClose)(()=>{m&&${serviceClassName}.CODEX_REPLACEABLE_NOTIFICATIONS?.get(m[1])===u&&`,
    `${serviceClassName}.CODEX_REPLACEABLE_NOTIFICATIONS.delete(m[1]);n(void 0)})`,
    `/* ${replacementPatchMarker}. Reapply with patch-vscode-sticky-notifications. */`,
  ].join('');
}

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

if (source.includes(replacementPatchMarker)) {
  if (source.includes(patchMarker) && source.includes(managedStickySourceSnippet)) {
    console.log(`Already patched: ${workbenchPath}`);
    process.exit(0);
  }

  fail('Found an unknown sticky notifications patch marker. Re-check workbench bundle before patching.');
}

if (!source.includes('sticky:c')) {
  fail('Could not find VS Code notification sticky source path. Re-check workbench bundle before patching.');
}

let nextSource = source;

if (!nextSource.includes(managedStickySourceSnippet)) {
  if (nextSource.includes(extensionIdentifier)) {
    fail('Found sticky notification source without the managed marker. Re-check workbench bundle before patching.');
  }

  const matches = [...nextSource.matchAll(urgentSourcesPattern)];
  if (matches.length !== 1) {
    fail('Could not apply VS Code sticky notifications patch safely. Re-check workbench bundle before patching.');
  }

  nextSource = nextSource.replace(
    urgentSourcesPattern,
    `$1,${managedStickySourceSnippet}$2`,
  );
}

if (!nextSource.includes(notificationSourceSnippet) || !nextSource.includes(notificationHandleSnippet)) {
  fail('Could not apply VS Code replaceable notifications patch safely. Re-check workbench bundle before patching.');
}

const serviceClassName = nextSource.match(urgentSourcesClassPattern)?.[1];
if (!serviceClassName) {
  fail('Could not find VS Code notification service class. Re-check workbench bundle before patching.');
}

nextSource = nextSource.replace(
  notificationSourceSnippet,
  `${notificationSourceSnippet}${buildReplacementSnippet(serviceClassName)}`,
);
nextSource = nextSource.replace(
  notificationHandleSnippet,
  buildReplacementHandleSnippet(serviceClassName),
);

if (nextSource === source) {
  console.log(`Already patched: ${workbenchPath}`);
  process.exit(0);
}

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
