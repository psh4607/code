#!/usr/bin/env node

const fs = require('node:fs');

const cssPath =
  process.env.VSCODE_WORKBENCH_CSS ||
  '/Applications/Code.app/Contents/Resources/app/out/vs/workbench/workbench.desktop.main.css';

const patchMarker =
  '/* codex-vscode-terminal-tools: terminal-tabs-two-line-layout. Reapply with patch-vscode-terminal-tabs-layout. */';
const patchRules = [
  '.monaco-workbench .pane-body.integrated-terminal .tabs-list .monaco-list-row{height:68px!important;line-height:20px!important;}',
  '.monaco-workbench .pane-body.integrated-terminal .tabs-list .terminal-tabs-entry{min-height:68px!important;height:68px!important;align-items:center!important;padding-top:5px!important;padding-bottom:5px!important;padding-left:12px!important;padding-right:10px!important;box-sizing:border-box!important;}',
  '.monaco-workbench .pane-body.integrated-terminal .tabs-list .terminal-tabs-entry .monaco-icon-label{height:100%!important;min-height:58px!important;line-height:19px!important;display:flex!important;align-items:center!important;}',
  '.monaco-workbench .pane-body.integrated-terminal .tabs-list .terminal-tabs-entry .monaco-icon-label-container{white-space:normal!important;overflow:visible!important;display:flex!important;flex-direction:column!important;justify-content:center!important;min-height:58px!important;}',
  '.monaco-workbench .pane-body.integrated-terminal .tabs-list .terminal-tabs-entry .monaco-icon-name-container,.monaco-workbench .pane-body.integrated-terminal .tabs-list .terminal-tabs-entry .monaco-icon-description-container{white-space:normal!important;overflow:hidden!important;text-overflow:clip!important;}',
  '.monaco-workbench .pane-body.integrated-terminal .tabs-list .terminal-tabs-entry .monaco-highlighted-label{white-space:pre-line!important;line-height:19px!important;letter-spacing:0!important;font-kerning:normal!important;overflow:hidden!important;text-overflow:clip!important;overflow-wrap:normal!important;word-break:normal!important;display:-webkit-box!important;-webkit-box-orient:vertical!important;-webkit-line-clamp:3!important;line-clamp:3!important;}',
];
const patchBlock = `${patchMarker}\n${patchRules.join('\n')}\n`;
const legacy44PatchRules = [
  '.monaco-workbench .pane-body.integrated-terminal .tabs-list .monaco-list-row{height:44px!important;line-height:20px!important;}',
  '.monaco-workbench .pane-body.integrated-terminal .tabs-list .terminal-tabs-entry{min-height:44px!important;height:44px!important;align-items:flex-start!important;padding-top:3px!important;padding-bottom:3px!important;box-sizing:border-box!important;}',
  '.monaco-workbench .pane-body.integrated-terminal .tabs-list .terminal-tabs-entry .monaco-icon-label{height:auto!important;line-height:18px!important;}',
  '.monaco-workbench .pane-body.integrated-terminal .tabs-list .terminal-tabs-entry .monaco-icon-label-container{white-space:normal!important;overflow:visible!important;}',
  '.monaco-workbench .pane-body.integrated-terminal .tabs-list .terminal-tabs-entry .monaco-icon-name-container,.monaco-workbench .pane-body.integrated-terminal .tabs-list .terminal-tabs-entry .monaco-icon-description-container{white-space:normal!important;overflow:hidden!important;text-overflow:clip!important;}',
  '.monaco-workbench .pane-body.integrated-terminal .tabs-list .terminal-tabs-entry .monaco-highlighted-label{white-space:normal!important;overflow:hidden!important;text-overflow:clip!important;overflow-wrap:anywhere!important;word-break:normal!important;display:-webkit-box!important;-webkit-box-orient:vertical!important;-webkit-line-clamp:2!important;line-clamp:2!important;}',
];
const legacy48PatchRules = [
  '.monaco-workbench .pane-body.integrated-terminal .tabs-list .monaco-list-row{height:48px!important;line-height:20px!important;}',
  '.monaco-workbench .pane-body.integrated-terminal .tabs-list .terminal-tabs-entry{min-height:48px!important;height:48px!important;align-items:flex-start!important;padding-top:5px!important;padding-bottom:5px!important;padding-left:12px!important;padding-right:10px!important;box-sizing:border-box!important;}',
  '.monaco-workbench .pane-body.integrated-terminal .tabs-list .terminal-tabs-entry .monaco-icon-label{height:auto!important;line-height:18px!important;}',
  '.monaco-workbench .pane-body.integrated-terminal .tabs-list .terminal-tabs-entry .monaco-icon-label-container{white-space:normal!important;overflow:visible!important;}',
  '.monaco-workbench .pane-body.integrated-terminal .tabs-list .terminal-tabs-entry .monaco-icon-name-container,.monaco-workbench .pane-body.integrated-terminal .tabs-list .terminal-tabs-entry .monaco-icon-description-container{white-space:normal!important;overflow:hidden!important;text-overflow:clip!important;}',
  '.monaco-workbench .pane-body.integrated-terminal .tabs-list .terminal-tabs-entry .monaco-highlighted-label{white-space:normal!important;overflow:hidden!important;text-overflow:clip!important;overflow-wrap:normal!important;word-break:normal!important;display:-webkit-box!important;-webkit-box-orient:vertical!important;-webkit-line-clamp:2!important;line-clamp:2!important;}',
];
const legacy64PatchRules = [
  '.monaco-workbench .pane-body.integrated-terminal .tabs-list .monaco-list-row{height:64px!important;line-height:20px!important;}',
  '.monaco-workbench .pane-body.integrated-terminal .tabs-list .terminal-tabs-entry{min-height:64px!important;height:64px!important;align-items:flex-start!important;padding-top:5px!important;padding-bottom:5px!important;padding-left:12px!important;padding-right:10px!important;box-sizing:border-box!important;}',
  '.monaco-workbench .pane-body.integrated-terminal .tabs-list .terminal-tabs-entry .monaco-icon-label{height:auto!important;line-height:17px!important;}',
  '.monaco-workbench .pane-body.integrated-terminal .tabs-list .terminal-tabs-entry .monaco-icon-label-container{white-space:normal!important;overflow:visible!important;}',
  '.monaco-workbench .pane-body.integrated-terminal .tabs-list .terminal-tabs-entry .monaco-icon-name-container,.monaco-workbench .pane-body.integrated-terminal .tabs-list .terminal-tabs-entry .monaco-icon-description-container{white-space:normal!important;overflow:hidden!important;text-overflow:clip!important;}',
  '.monaco-workbench .pane-body.integrated-terminal .tabs-list .terminal-tabs-entry .monaco-highlighted-label{white-space:pre-line!important;overflow:hidden!important;text-overflow:clip!important;overflow-wrap:normal!important;word-break:normal!important;display:-webkit-box!important;-webkit-box-orient:vertical!important;-webkit-line-clamp:3!important;line-clamp:3!important;}',
];
const legacy68TopAlignedPatchRules = [
  '.monaco-workbench .pane-body.integrated-terminal .tabs-list .monaco-list-row{height:68px!important;line-height:20px!important;}',
  '.monaco-workbench .pane-body.integrated-terminal .tabs-list .terminal-tabs-entry{min-height:68px!important;height:68px!important;align-items:center!important;padding-top:5px!important;padding-bottom:5px!important;padding-left:12px!important;padding-right:10px!important;box-sizing:border-box!important;}',
  '.monaco-workbench .pane-body.integrated-terminal .tabs-list .terminal-tabs-entry .monaco-icon-label{height:auto!important;line-height:19px!important;}',
  '.monaco-workbench .pane-body.integrated-terminal .tabs-list .terminal-tabs-entry .monaco-icon-label-container{white-space:normal!important;overflow:visible!important;}',
  '.monaco-workbench .pane-body.integrated-terminal .tabs-list .terminal-tabs-entry .monaco-icon-name-container,.monaco-workbench .pane-body.integrated-terminal .tabs-list .terminal-tabs-entry .monaco-icon-description-container{white-space:normal!important;overflow:hidden!important;text-overflow:clip!important;}',
  '.monaco-workbench .pane-body.integrated-terminal .tabs-list .terminal-tabs-entry .monaco-highlighted-label{white-space:pre-line!important;line-height:19px!important;letter-spacing:0!important;font-kerning:normal!important;overflow:hidden!important;text-overflow:clip!important;overflow-wrap:normal!important;word-break:normal!important;display:-webkit-box!important;-webkit-box-orient:vertical!important;-webkit-line-clamp:3!important;line-clamp:3!important;}',
];
const legacyPatchBlocks = [
  `${patchMarker}\n${legacy44PatchRules.join('\n')}\n`,
  `${patchMarker}\n${legacy48PatchRules.join('\n')}\n`,
  `${patchMarker}\n${legacy64PatchRules.join('\n')}\n`,
  `${patchMarker}\n${legacy68TopAlignedPatchRules.join('\n')}\n`,
];

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

  if (
    ![legacy44PatchRules, legacy48PatchRules, legacy64PatchRules, legacy68TopAlignedPatchRules].some((rules) =>
      rules.every((rule) => source.includes(rule)),
    )
  ) {
    fail('Found an unknown terminal tabs layout patch marker. Re-check workbench CSS before patching.');
  }
}

if (
  !source.includes('.pane-body.integrated-terminal .tabs-list .terminal-tabs-entry') ||
  !source.includes('.monaco-icon-name-container')
) {
  fail('Could not apply VS Code terminal tabs layout patch safely. Re-check workbench CSS before patching.');
}

const stat = fs.statSync(cssPath);
const backupPath = `${cssPath}.codex-backup-${timestamp()}-terminal-tabs-layout`;
const tempPath = `${cssPath}.codex-tmp-${process.pid}.css`;
const legacyPatchBlock = legacyPatchBlocks.find((block) => source.includes(block));
const nextSource = legacyPatchBlock
  ? source.replace(legacyPatchBlock, patchBlock)
  : `${source.replace(/\s*$/, '\n\n')}${patchBlock}`;

fs.copyFileSync(cssPath, backupPath);
fs.writeFileSync(tempPath, nextSource, { mode: stat.mode });
fs.chmodSync(tempPath, stat.mode);
fs.renameSync(tempPath, cssPath);

console.log(`Patched VS Code terminal tabs layout: ${cssPath}`);
console.log(`Backup: ${backupPath}`);
console.log('Fully quit and reopen VS Code for the terminal tabs layout change to take effect.');
