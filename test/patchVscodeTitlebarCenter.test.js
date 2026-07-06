const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const scriptPath = path.join(__dirname, '..', 'scripts', 'patch-vscode-titlebar-center.js');

function runPatchScript({ cssPath }) {
  return childProcess.spawnSync(process.execPath, [scriptPath], {
    env: {
      ...process.env,
      VSCODE_WORKBENCH_CSS: cssPath,
    },
    encoding: 'utf8',
  });
}

const titlebarCss = [
  '.monaco-workbench .part.titlebar>.titlebar-container>.titlebar-center>.window-title>.command-center{z-index:2500;-webkit-app-region:no-drag}',
  '.monaco-workbench .part.titlebar>.titlebar-container>.titlebar-center>.window-title>.command-center .action-item.command-center-center{display:flex;align-items:stretch}',
  '.agent-status-container{display:flex;flex-direction:row;flex-wrap:nowrap;align-items:center;justify-content:flex-start;gap:4px;}',
  '',
].join('\n');

test('patch script hides the titlebar command center and agent status container', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-titlebar-center-test-'));
  const cssPath = path.join(tmpDir, 'workbench.desktop.main.css');
  fs.writeFileSync(cssPath, titlebarCss);

  const result = runPatchScript({ cssPath });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Patched VS Code titlebar center:/);
  const nextSource = fs.readFileSync(cssPath, 'utf8');
  assert.match(nextSource, /codex-vscode-terminal-tools: hide-titlebar-center/);
  assert.match(
    nextSource,
    /\.monaco-workbench \.part\.titlebar>\.titlebar-container>\.titlebar-center>\.window-title>\.command-center\{display:none!important;\}/,
  );
  assert.match(
    nextSource,
    /\.monaco-workbench \.part\.titlebar \.agent-status-container\{display:none!important;\}/,
  );

  const backups = fs
    .readdirSync(tmpDir)
    .filter((entry) =>
      entry.startsWith('workbench.desktop.main.css.codex-backup-') &&
      entry.endsWith('-titlebar-center'),
    );
  assert.equal(backups.length, 1);
  assert.equal(fs.readFileSync(path.join(tmpDir, backups[0]), 'utf8'), titlebarCss);
});

test('patch script is idempotent when the titlebar center is already hidden', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-titlebar-center-test-'));
  const cssPath = path.join(tmpDir, 'workbench.desktop.main.css');
  fs.writeFileSync(
    cssPath,
    [
      titlebarCss.trimEnd(),
      '',
      '/* codex-vscode-terminal-tools: hide-titlebar-center. Reapply with patch-vscode-titlebar-center. */',
      '.monaco-workbench .part.titlebar>.titlebar-container>.titlebar-center>.window-title>.command-center{display:none!important;}',
      '.monaco-workbench .part.titlebar .agent-status-container{display:none!important;}',
      '',
    ].join('\n'),
  );

  const result = runPatchScript({ cssPath });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Already patched: .*workbench\.desktop\.main\.css/);

  const backups = fs
    .readdirSync(tmpDir)
    .filter((entry) =>
      entry.startsWith('workbench.desktop.main.css.codex-backup-') &&
      entry.endsWith('-titlebar-center'),
    );
  assert.equal(backups.length, 0);
});

test('patch script fails closed when the titlebar center selectors are missing', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-titlebar-center-test-'));
  const cssPath = path.join(tmpDir, 'workbench.desktop.main.css');
  fs.writeFileSync(cssPath, '.monaco-workbench{color:inherit}\n');

  const result = runPatchScript({ cssPath });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Could not apply VS Code titlebar center patch safely/);
});
