#!/usr/bin/env node

const fs = require('node:fs');

const cssPath =
  process.env.VSCODE_WORKBENCH_CSS ||
  '/Applications/Code.app/Contents/Resources/app/out/vs/workbench/workbench.desktop.main.css';

const patchMarker =
  '/* codex-vscode-terminal-tools: opaque-overlays. Reapply with patch-vscode-opaque-overlays. */';
const patchRules = [
  '.quick-input-widget{background:var(--vscode-quickInput-background,var(--vscode-editorWidget-background,#252526))!important;background-image:none!important;backdrop-filter:none!important;opacity:1!important;}',
  '.quick-input-widget .quick-input-list .monaco-list{background:var(--vscode-quickInput-background,var(--vscode-editorWidget-background,#252526))!important;}',
  '.monaco-dialog-box{background:var(--vscode-editorWidget-background,#252526)!important;background-image:none!important;backdrop-filter:none!important;opacity:1!important;}',
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
  if (patchRules.every((rule) => source.includes(rule))) {
    console.log(`Already patched: ${cssPath}`);
    process.exit(0);
  }

  fail('Found an unknown opaque overlays patch marker. Re-check workbench CSS before patching.');
}

if (!source.includes('.quick-input-widget') || !source.includes('.monaco-dialog-box')) {
  fail('Could not apply VS Code opaque overlays patch safely. Re-check workbench CSS before patching.');
}

const stat = fs.statSync(cssPath);
const backupPath = `${cssPath}.codex-backup-${timestamp()}-opaque-overlays`;
const tempPath = `${cssPath}.codex-tmp-${process.pid}.css`;
const nextSource = `${source.replace(/\s*$/, '\n\n')}${patchBlock}`;

fs.copyFileSync(cssPath, backupPath);
fs.writeFileSync(tempPath, nextSource, { mode: stat.mode });
fs.chmodSync(tempPath, stat.mode);
fs.renameSync(tempPath, cssPath);

console.log(`Patched VS Code opaque overlays: ${cssPath}`);
console.log(`Backup: ${backupPath}`);
console.log('Fully quit and reopen VS Code for the opaque overlay change to take effect.');
