#!/usr/bin/env node

const fs = require('node:fs');

const cssPath =
  process.env.VSCODE_WORKBENCH_CSS ||
  '/Applications/Code.app/Contents/Resources/app/out/vs/workbench/workbench.desktop.main.css';

const patchMarker =
  '/* codex-vscode-terminal-tools: hide-titlebar-center. Reapply with patch-vscode-titlebar-center. */';
const patchRules = [
  '.monaco-workbench .part.titlebar>.titlebar-container>.titlebar-center>.window-title>.command-center{display:none!important;}',
  '.monaco-workbench .part.titlebar .agent-status-container{display:none!important;}',
];
const patchBlock = `${patchMarker}\n${patchRules.join('\n')}\n`;

function timestamp() {
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-');
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

if (!fs.existsSync(cssPath)) {
  fail(`VS Code workbench CSS not found: ${cssPath}`);
}

const source = fs.readFileSync(cssPath, 'utf8');

if (source.includes(patchMarker)) {
  if (!patchRules.every((rule) => source.includes(rule))) {
    fail('Found an unknown titlebar center patch marker. Re-check workbench CSS before patching.');
  }

  console.log(`Already patched: ${cssPath}`);
  process.exit(0);
}

if (
  !source.includes('.titlebar-center') ||
  !source.includes('.command-center') ||
  !source.includes('agent-status-container')
) {
  fail('Could not apply VS Code titlebar center patch safely. Re-check workbench CSS before patching.');
}

const stat = fs.statSync(cssPath);
const backupPath = `${cssPath}.codex-backup-${timestamp()}-titlebar-center`;
const tempPath = `${cssPath}.codex-tmp-${process.pid}.css`;
const nextSource = `${source.replace(/\s*$/, '\n\n')}${patchBlock}`;

fs.copyFileSync(cssPath, backupPath);
fs.writeFileSync(tempPath, nextSource, { mode: stat.mode });
fs.chmodSync(tempPath, stat.mode);
fs.renameSync(tempPath, cssPath);

console.log(`Patched VS Code titlebar center: ${cssPath}`);
console.log(`Backup: ${backupPath}`);
console.log('Fully quit and reopen VS Code for the titlebar center change to take effect.');
