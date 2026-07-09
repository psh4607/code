#!/usr/bin/env node

const fs = require('node:fs');

const workbenchPath =
  process.env.VSCODE_WORKBENCH_MAIN ||
  '/Applications/Code.app/Contents/Resources/app/out/vs/workbench/workbench.desktop.main.js';

const patchMarker =
  '/* Codex VS Code terminal tab title breaks patch. Reapply with patch-vscode-terminal-tabs-title-breaks. */';
const patchHelper =
  'globalThis.__codexVscodeTerminalTabTitleBreaks??=(a=>{if(typeof a!="string"||!a.includes("|"))return a;let b=a.split("|").map(c=>c.trim()).filter(Boolean),d="$(loading~spin)",e=/^[\\u2800-\\u28ff]$/u,f=/^[\\u2800-\\u28ff]\\s+(.+)$/u;if(b.length>1&&e.test(b[0]))b[1]=d+" "+b[1],b.shift();else b[0]&&(b[0]=b[0].replace(f,d+" $1"));return b.map(c=>c.replace(/ /g,"\\u00a0")).join("\\n")});';
const legacyPatchHelpers = [
  'globalThis.__codexVscodeTerminalTabTitleBreaks??=(a=>typeof a=="string"&&a.includes("|")?a.split("|").map(b=>b.trim().replace(/ /g,"\\u00a0")).filter(Boolean).join("\\n"):a);',
  'globalThis.__codexVscodeTerminalTabTitleBreaks??=(a=>typeof a=="string"&&a.includes("|")?a.replace(/ /g,"\\u00a0").replace(/\\|/g,"|\\u200b"):a);',
  'globalThis.__codexVscodeTerminalTabTitleBreaks??=(a=>typeof a=="string"&&a.includes("|")?a.replace(/\\|/g,"\\n"):a);',
];
const legacyOriginalTitleRender = 'u+=`$(${l}) ${i.title}`';
const legacyPatchedTitleRender =
  'u+=`$(${l}) ${globalThis.__codexVscodeTerminalTabTitleBreaks?.(i.title)??i.title}`';
const vscode127OriginalTitleRender = 'u+=`${i.title}`';
const vscode127PatchedTitleRender =
  'u+=`${globalThis.__codexVscodeTerminalTabTitleBreaks?.(i.title)??i.title}`';
const titleRenderPatches = new Map([
  [legacyOriginalTitleRender, legacyPatchedTitleRender],
  [vscode127OriginalTitleRender, vscode127PatchedTitleRender],
]);
const patchBlock = `${patchMarker}\n${patchHelper}\n`;
const knownPatchHelpers = [patchHelper, ...legacyPatchHelpers];

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

function removeAll(source, needle) {
  return source.split(needle).join('');
}

function normalizePatchBlock(source) {
  let nextSource = source;

  for (const helper of knownPatchHelpers) {
    nextSource = removeAll(nextSource, `${patchMarker}\n${helper}\n`);
  }

  for (const helper of knownPatchHelpers) {
    nextSource = removeAll(nextSource, helper);
  }

  nextSource = removeAll(nextSource, `${patchMarker}\n`);
  return `${patchBlock}${nextSource}`;
}

function getMatches(source, needles) {
  return needles
    .map((needle) => ({
      needle,
      count: countOccurrences(source, needle),
    }))
    .filter((match) => match.count > 0);
}

function sumCounts(matches) {
  return matches.reduce((total, match) => total + match.count, 0);
}

if (!fs.existsSync(workbenchPath)) {
  fail(`VS Code workbench bundle not found: ${workbenchPath}`);
}

const source = fs.readFileSync(workbenchPath, 'utf8');
const originalMatches = getMatches(source, [...titleRenderPatches.keys()]);
const patchedMatches = getMatches(source, [...titleRenderPatches.values()]);
const originalCount = sumCounts(originalMatches);
const patchedCount = sumCounts(patchedMatches);
const nextSourceWithNormalizedHelper = normalizePatchBlock(source);
const helperNeedsPatch = nextSourceWithNormalizedHelper !== source;

if (patchedCount === 1 && originalCount === 0 && !helperNeedsPatch) {
  console.log(`Already patched: ${workbenchPath}`);
  process.exit(0);
}

if (!source.includes('templateId="terminal.tabs"')) {
  fail('Could not apply VS Code terminal tab title breaks patch safely. Re-check terminal tabs renderer before patching.');
}

if (
  !(
    (originalCount === 1 && patchedCount === 0) ||
    (originalCount === 0 && patchedCount === 1 && helperNeedsPatch)
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
let nextSource = nextSourceWithNormalizedHelper;

if (originalCount === 1) {
  const [{ needle }] = originalMatches;
  nextSource = nextSource.replace(needle, titleRenderPatches.get(needle));
}

fs.copyFileSync(workbenchPath, backupPath);
fs.writeFileSync(tempPath, nextSource, { mode: stat.mode });
fs.chmodSync(tempPath, stat.mode);
fs.renameSync(tempPath, workbenchPath);

console.log(`Patched VS Code terminal tab title breaks: ${workbenchPath}`);
console.log(`Backup: ${backupPath}`);
console.log('Fully quit and reopen VS Code for terminal tab title breakpoints to load.');
