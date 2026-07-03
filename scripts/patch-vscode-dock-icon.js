#!/usr/bin/env node

const childProcess = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const mainPath =
  process.env.VSCODE_MAIN_PATH ||
  '/Applications/Code.app/Contents/Resources/app/out/main.js';
const pngSourcePath =
  process.env.CODEX_VSCODE_ICON_PNG_SOURCE || path.join(projectRoot, 'assets', 'warp-glass-sky.png');
const pngTargetPath =
  process.env.VSCODE_DOCK_ICON_PNG_PATH ||
  '/Applications/Code.app/Contents/Resources/codex-warp-glass-sky.png';

const electronImportMarker =
  'import{app as st,protocol as tN,crashReporter as rN,Menu as nN,contentTracing as iN}from"electron";';
const patchMarker = '/* Codex VS Code Dock icon patch. Reapply with patch-vscode-dock-icon. */';
const patchSource = `${patchMarker}try{process.platform==="darwin"&&st.dock?.setIcon?.(zn.join(import.meta.dirname,"..","..","codex-warp-glass-sky.png"))}catch(i){console.error("[codex-vscode-icon] Dock icon patch failed",i)};`;

function timestamp() {
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-');
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function copyPngAsset() {
  if (!fs.existsSync(pngSourcePath)) {
    fail(`Managed VS Code icon PNG source not found: ${pngSourcePath}`);
  }

  const source = fs.readFileSync(pngSourcePath);
  const target = fs.existsSync(pngTargetPath) ? fs.readFileSync(pngTargetPath) : undefined;
  if (target && source.equals(target)) {
    return false;
  }

  fs.mkdirSync(path.dirname(pngTargetPath), { recursive: true });
  fs.writeFileSync(pngTargetPath, source);
  return true;
}

function checkSyntax(filePath) {
  childProcess.execFileSync(process.execPath, ['--check', filePath], {
    stdio: 'inherit',
  });
}

if (!fs.existsSync(mainPath)) {
  fail(`VS Code main bundle not found: ${mainPath}`);
}

const copiedPng = copyPngAsset();
const source = fs.readFileSync(mainPath, 'utf8');

if (source.includes(patchMarker)) {
  if (!source.includes(patchSource)) {
    fail('Found an unknown runtime Dock icon patch marker. Re-check main.js before patching.');
  }

  console.log(`Already patched: ${mainPath}`);
  if (copiedPng) {
    console.log(`Copied Dock icon asset: ${pngTargetPath}`);
  }
  process.exit(0);
}

const markerIndex = source.indexOf(electronImportMarker);
if (markerIndex === -1) {
  fail('Could not apply VS Code runtime Dock icon patch safely. Re-check Electron app import in main.js.');
}

const insertIndex = markerIndex + electronImportMarker.length;
const nextSource = `${source.slice(0, insertIndex)}${patchSource}${source.slice(insertIndex)}`;
const stat = fs.statSync(mainPath);
const backupPath = `${mainPath}.codex-backup-${timestamp()}-vscode-dock-icon`;
const tempPath = `${mainPath}.codex-tmp-${process.pid}.js`;

fs.copyFileSync(mainPath, backupPath);
fs.writeFileSync(tempPath, nextSource, { mode: stat.mode });
fs.chmodSync(tempPath, stat.mode);
checkSyntax(tempPath);
fs.renameSync(tempPath, mainPath);

console.log(`Patched VS Code runtime Dock icon: ${mainPath}`);
console.log(`Backup: ${backupPath}`);
if (copiedPng) {
  console.log(`Copied Dock icon asset: ${pngTargetPath}`);
}
console.log('Fully quit and reopen VS Code for the runtime Dock icon patch to load.');
