const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const scriptPath = path.join(__dirname, '..', 'scripts', 'patch-vscode-dock-icon.js');

function runPatchScript({ mainPath, pngSourcePath, pngTargetPath }) {
  return childProcess.spawnSync(process.execPath, [scriptPath], {
    env: {
      ...process.env,
      VSCODE_MAIN_PATH: mainPath,
      CODEX_VSCODE_ICON_PNG_SOURCE: pngSourcePath,
      VSCODE_DOCK_ICON_PNG_PATH: pngTargetPath,
    },
    encoding: 'utf8',
  });
}

function writeMain(mainPath, source = '') {
  fs.writeFileSync(
    mainPath,
    source ||
      [
        'import*as zn from"node:path";',
        'import{app as st,protocol as tN,crashReporter as rN,Menu as nN,contentTracing as iN}from"electron";',
        'console.log("main");',
        '',
      ].join(''),
  );
}

test('patch script injects the runtime Dock icon setter and copies the PNG asset', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-vscode-dock-icon-test-'));
  const mainPath = path.join(tmpDir, 'main.js');
  const pngSourcePath = path.join(tmpDir, 'warp-glass-sky.png');
  const pngTargetPath = path.join(tmpDir, 'codex-warp-glass-sky.png');
  fs.writeFileSync(pngSourcePath, Buffer.from('managed-png'));
  writeMain(mainPath);

  const result = runPatchScript({ mainPath, pngSourcePath, pngTargetPath });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Patched VS Code runtime Dock icon:/);
  assert.match(fs.readFileSync(mainPath, 'utf8'), /Codex VS Code Dock icon patch/);
  assert.match(fs.readFileSync(mainPath, 'utf8'), /st\.dock\?\.setIcon/);
  assert.deepEqual(fs.readFileSync(pngTargetPath), Buffer.from('managed-png'));

  const backups = fs
    .readdirSync(tmpDir)
    .filter((entry) => entry.startsWith('main.js.codex-backup-') && entry.endsWith('-vscode-dock-icon'));
  assert.equal(backups.length, 1);
});

test('patch script is idempotent when the runtime Dock icon patch is already installed', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-vscode-dock-icon-test-'));
  const mainPath = path.join(tmpDir, 'main.js');
  const pngSourcePath = path.join(tmpDir, 'warp-glass-sky.png');
  const pngTargetPath = path.join(tmpDir, 'codex-warp-glass-sky.png');
  fs.writeFileSync(pngSourcePath, Buffer.from('managed-png'));
  writeMain(
    mainPath,
    [
      'import*as zn from"node:path";',
      'import{app as st,protocol as tN,crashReporter as rN,Menu as nN,contentTracing as iN}from"electron";',
      '/* Codex VS Code Dock icon patch. Reapply with patch-vscode-dock-icon. */',
      'try{process.platform==="darwin"&&st.dock?.setIcon?.(zn.join(import.meta.dirname,"..","..","codex-warp-glass-sky.png"))}catch(i){console.error("[codex-vscode-icon] Dock icon patch failed",i)};',
      'console.log("main");',
      '',
    ].join(''),
  );
  fs.writeFileSync(pngTargetPath, Buffer.from('managed-png'));

  const result = runPatchScript({ mainPath, pngSourcePath, pngTargetPath });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Already patched: .*main\.js/);

  const backups = fs
    .readdirSync(tmpDir)
    .filter((entry) => entry.startsWith('main.js.codex-backup-') && entry.endsWith('-vscode-dock-icon'));
  assert.equal(backups.length, 0);
});

test('patch script fails closed when the Electron app import marker is missing', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-vscode-dock-icon-test-'));
  const mainPath = path.join(tmpDir, 'main.js');
  const pngSourcePath = path.join(tmpDir, 'warp-glass-sky.png');
  const pngTargetPath = path.join(tmpDir, 'codex-warp-glass-sky.png');
  fs.writeFileSync(pngSourcePath, Buffer.from('managed-png'));
  fs.writeFileSync(mainPath, 'console.log("main");\n');

  const result = runPatchScript({ mainPath, pngSourcePath, pngTargetPath });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Could not apply VS Code runtime Dock icon patch safely/);
});
