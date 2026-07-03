const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const scriptPath = path.join(__dirname, '..', 'scripts', 'patch-vscode-icon.js');

function runPatchScript({ sourcePath, targetPath }) {
  return childProcess.spawnSync(process.execPath, [scriptPath], {
    env: {
      ...process.env,
      CODEX_VSCODE_ICON_SOURCE: sourcePath,
      VSCODE_ICON_PATH: targetPath,
    },
    encoding: 'utf8',
  });
}

function runPatchScriptWithPng({ sourcePath, pngSourcePath, targetPath }) {
  return childProcess.spawnSync(process.execPath, [scriptPath], {
    env: {
      ...process.env,
      CODEX_VSCODE_ICON_SOURCE: sourcePath,
      CODEX_VSCODE_ICON_PNG_SOURCE: pngSourcePath,
      VSCODE_ICON_PATH: targetPath,
    },
    encoding: 'utf8',
  });
}

test('patch script copies the managed icon over the VS Code app icon and keeps a backup', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-vscode-icon-test-'));
  const sourcePath = path.join(tmpDir, 'warp-glass-sky.icns');
  const targetPath = path.join(tmpDir, 'Code.icns');
  fs.writeFileSync(sourcePath, Buffer.from('managed-icon'));
  fs.writeFileSync(targetPath, Buffer.from('old-vscode-icon'));

  const result = runPatchScript({ sourcePath, targetPath });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Patched VS Code icon:/);
  assert.deepEqual(fs.readFileSync(targetPath), Buffer.from('managed-icon'));

  const backups = fs
    .readdirSync(tmpDir)
    .filter((entry) => entry.startsWith('Code.icns.codex-backup-') && entry.endsWith('-vscode-icon'));
  assert.equal(backups.length, 1);
  assert.deepEqual(fs.readFileSync(path.join(tmpDir, backups[0])), Buffer.from('old-vscode-icon'));
});

test('patch script is idempotent when the managed icon is already installed', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-vscode-icon-test-'));
  const sourcePath = path.join(tmpDir, 'warp-glass-sky.icns');
  const targetPath = path.join(tmpDir, 'Code.icns');
  fs.writeFileSync(sourcePath, Buffer.from('managed-icon'));
  fs.writeFileSync(targetPath, Buffer.from('managed-icon'));

  const result = runPatchScript({ sourcePath, targetPath });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Already patched: .*Code\.icns/);
  const backups = fs
    .readdirSync(tmpDir)
    .filter((entry) => entry.startsWith('Code.icns.codex-backup-') && entry.endsWith('-vscode-icon'));
  assert.equal(backups.length, 0);
});

test('patch script skips Finder custom icons by default so Code.app can be signed', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-vscode-icon-test-'));
  const appPath = path.join(tmpDir, 'Visual Studio Code.app');
  const resourcesPath = path.join(appPath, 'Contents', 'Resources');
  const sourcePath = path.join(tmpDir, 'warp-glass-sky.icns');
  const targetPath = path.join(resourcesPath, 'Code.icns');
  const pngSourcePath = path.join(__dirname, '..', 'assets', 'warp-glass-sky.png');
  fs.mkdirSync(resourcesPath, { recursive: true });
  fs.writeFileSync(sourcePath, Buffer.from('managed-icon'));
  fs.writeFileSync(targetPath, Buffer.from('managed-icon'));

  const result = runPatchScriptWithPng({ sourcePath, pngSourcePath, targetPath });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Already patched: .*Code\.icns/);
  assert.equal(fs.existsSync(path.join(appPath, 'Icon\r')), false);

  const secondResult = runPatchScriptWithPng({ sourcePath, pngSourcePath, targetPath });

  assert.equal(secondResult.status, 0, secondResult.stderr);
  assert.match(secondResult.stdout, /Already patched: .*Code\.icns/);
});

test('patch script fails closed when the managed icon source is missing', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-vscode-icon-test-'));
  const sourcePath = path.join(tmpDir, 'missing.icns');
  const targetPath = path.join(tmpDir, 'Code.icns');
  fs.writeFileSync(targetPath, Buffer.from('old-vscode-icon'));

  const result = runPatchScript({ sourcePath, targetPath });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Managed VS Code icon source not found:/);
  assert.deepEqual(fs.readFileSync(targetPath), Buffer.from('old-vscode-icon'));
});
