#!/usr/bin/env node

const fs = require('node:fs');

const workbenchPath =
  process.env.VSCODE_WORKBENCH_MAIN ||
  '/Applications/Code.app/Contents/Resources/app/out/vs/workbench/workbench.desktop.main.js';

const patchMarker =
  '/* Codex VS Code terminal tab title breaks patch. Reapply with patch-vscode-terminal-tabs-title-breaks. */';
const patchHelper =
  'globalThis.__codexVscodeTerminalTabTitleBreaks??=(a=>typeof a=="string"&&a.includes("|")?a.split("|").map(b=>b.trim().replace(/ /g,"\\u00a0")).filter(Boolean).join("\\n"):a);';
const legacyPatchHelpers = [
  'globalThis.__codexVscodeTerminalTabTitleBreaks??=(a=>typeof a=="string"&&a.includes("|")?a.replace(/ /g,"\\u00a0").replace(/\\|/g,"|\\u200b"):a);',
];
const originalTitleRender = 'u+=`$(${l}) ${i.title}`';
const patchedTitleRender =
  'u+=`$(${l}) ${globalThis.__codexVscodeTerminalTabTitleBreaks?.(i.title)??i.title}`';
const patchBlock = `${patchMarker}\n${patchHelper}\n`;

function timestamp() {
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-');
}

function countOccurrences(source, needle) {
  return source.split(needle).length - 1;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function addPatchBlock(source) {
  if (source.includes(patchMarker) && source.includes(patchHelper)) {
    return source;
  }

  for (const legacyPatchHelper of legacyPatchHelpers) {
    const legacyPatchBlock = `${patchMarker}\n${legacyPatchHelper}\n`;
    if (source.includes(legacyPatchBlock)) {
      return source.replace(legacyPatchBlock, patchBlock);
    }
    if (source.includes(legacyPatchHelper)) {
      return source.replace(legacyPatchHelper, patchHelper);
    }
  }

  return `${patchBlock}${source}`;
}

if (!fs.existsSync(workbenchPath)) {
  fail(`VS Code workbench bundle not found: ${workbenchPath}`);
}

const source = fs.readFileSync(workbenchPath, 'utf8');
const originalCount = countOccurrences(source, originalTitleRender);
const patchedCount = countOccurrences(source, patchedTitleRender);
const helperPresent = source.includes(patchMarker) && source.includes(patchHelper);
const legacyHelperPresent =
  source.includes(patchMarker) && legacyPatchHelpers.some((helper) => source.includes(helper));

if (patchedCount === 1 && originalCount === 0 && helperPresent) {
  console.log(`Already patched: ${workbenchPath}`);
  process.exit(0);
}

if (!source.includes('templateId="terminal.tabs"')) {
  fail('Could not apply VS Code terminal tab title breaks patch safely. Re-check terminal tabs renderer before patching.');
}

if (
  !(
    (originalCount === 1 && patchedCount === 0) ||
    (originalCount === 0 && patchedCount === 1 && (!helperPresent || legacyHelperPresent))
  )
) {
  console.error('Could not apply VS Code terminal tab title breaks patch safely.');
  console.error(`Original terminal title marker count: ${originalCount}`);
  console.error(`Patched terminal title marker count: ${patchedCount}`);
  console.error('VS Code internals may have changed. Re-check terminal tabs renderer before patching.');
  process.exit(1);
}

const stat = fs.statSync(workbenchPath);
const backupPath = `${workbenchPath}.codex-backup-${timestamp()}-terminal-tabs-title-breaks`;
const tempPath = `${workbenchPath}.codex-tmp-${process.pid}.js`;
let nextSource = addPatchBlock(source);

if (originalCount === 1) {
  nextSource = nextSource.replace(originalTitleRender, patchedTitleRender);
}

fs.copyFileSync(workbenchPath, backupPath);
fs.writeFileSync(tempPath, nextSource, { mode: stat.mode });
fs.chmodSync(tempPath, stat.mode);
fs.renameSync(tempPath, workbenchPath);

console.log(`Patched VS Code terminal tab title breaks: ${workbenchPath}`);
console.log(`Backup: ${backupPath}`);
console.log('Fully quit and reopen VS Code for terminal tab title breakpoints to load.');
