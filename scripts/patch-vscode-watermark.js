#!/usr/bin/env node

const fs = require('node:fs');

const cssPath =
  process.env.VSCODE_WORKBENCH_CSS ||
  '/Applications/Visual Studio Code.app/Contents/Resources/app/out/vs/workbench/workbench.desktop.main.css';

const patchMarker =
  '/* codex-vscode-terminal-tools: hide-empty-editor-watermark. Reapply with patch-vscode-watermark. */';
const patchRule =
  '.monaco-workbench .part.editor>.content .editor-group-container>.editor-group-watermark-wrapper .editor-group-watermark .letterpress{display:none!important;}';
const patchBlock = `${patchMarker}\n${patchRule}\n`;

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
  if (!source.includes(patchRule)) {
    fail('Found an unknown empty editor watermark patch marker. Re-check workbench CSS before patching.');
  }

  console.log(`Already patched: ${cssPath}`);
  process.exit(0);
}

if (!source.includes('editor-group-watermark') || !source.includes('letterpress')) {
  fail('Could not apply VS Code empty editor watermark patch safely. Re-check workbench CSS before patching.');
}

const stat = fs.statSync(cssPath);
const backupPath = `${cssPath}.codex-backup-${timestamp()}-vscode-watermark`;
const tempPath = `${cssPath}.codex-tmp-${process.pid}.css`;
const nextSource = `${source.replace(/\s*$/, '\n\n')}${patchBlock}`;

fs.copyFileSync(cssPath, backupPath);
fs.writeFileSync(tempPath, nextSource, { mode: stat.mode });
fs.chmodSync(tempPath, stat.mode);
fs.renameSync(tempPath, cssPath);

console.log(`Patched VS Code empty editor watermark: ${cssPath}`);
console.log(`Backup: ${backupPath}`);
console.log('Fully quit and reopen VS Code for the empty editor watermark change to take effect.');
