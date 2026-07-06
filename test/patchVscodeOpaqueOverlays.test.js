const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const scriptPath = path.join(__dirname, '..', 'scripts', 'patch-vscode-opaque-overlays.js');

function runPatchScript({ cssPath }) {
  return childProcess.spawnSync(process.execPath, [scriptPath], {
    env: {
      ...process.env,
      VSCODE_WORKBENCH_CSS: cssPath,
    },
    encoding: 'utf8',
  });
}

const overlayCss = [
  '.quick-input-widget{position:absolute;width:600px;z-index:2550;left:50%;}',
  '.monaco-dialog-box{display:flex;flex-direction:column-reverse;width:min-content;}',
  '',
].join('\n');

test('patch script makes quick input and dialog surfaces opaque', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-opaque-overlays-test-'));
  const cssPath = path.join(tmpDir, 'workbench.desktop.main.css');
  fs.writeFileSync(cssPath, overlayCss);

  const result = runPatchScript({ cssPath });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Patched VS Code opaque overlays:/);
  const nextSource = fs.readFileSync(cssPath, 'utf8');
  assert.match(nextSource, /codex-vscode-terminal-tools: opaque-overlays/);
  assert.match(nextSource, /\.quick-input-widget\{background:var\(--vscode-quickInput-background,var\(--vscode-editorWidget-background,#252526\)\)!important;background-image:none!important;backdrop-filter:none!important;opacity:1!important;\}/);
  assert.match(nextSource, /\.quick-input-widget \.quick-input-list \.monaco-list\{background:var\(--vscode-quickInput-background,var\(--vscode-editorWidget-background,#252526\)\)!important;\}/);
  assert.match(nextSource, /\.monaco-dialog-box\{background:var\(--vscode-editorWidget-background,#252526\)!important;background-image:none!important;backdrop-filter:none!important;opacity:1!important;\}/);

  const backups = fs
    .readdirSync(tmpDir)
    .filter((entry) =>
      entry.startsWith('workbench.desktop.main.css.codex-backup-') && entry.endsWith('-opaque-overlays'),
    );
  assert.equal(backups.length, 1);
  assert.equal(fs.readFileSync(path.join(tmpDir, backups[0]), 'utf8'), overlayCss);
});

test('patch script is idempotent when opaque overlay rules are already present', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-opaque-overlays-test-'));
  const cssPath = path.join(tmpDir, 'workbench.desktop.main.css');
  fs.writeFileSync(
    cssPath,
    [
      overlayCss.trimEnd(),
      '',
      '/* codex-vscode-terminal-tools: opaque-overlays. Reapply with patch-vscode-opaque-overlays. */',
      '.quick-input-widget{background:var(--vscode-quickInput-background,var(--vscode-editorWidget-background,#252526))!important;background-image:none!important;backdrop-filter:none!important;opacity:1!important;}',
      '.quick-input-widget .quick-input-list .monaco-list{background:var(--vscode-quickInput-background,var(--vscode-editorWidget-background,#252526))!important;}',
      '.monaco-dialog-box{background:var(--vscode-editorWidget-background,#252526)!important;background-image:none!important;backdrop-filter:none!important;opacity:1!important;}',
      '',
    ].join('\n'),
  );

  const result = runPatchScript({ cssPath });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Already patched: .*workbench\.desktop\.main\.css/);

  const backups = fs
    .readdirSync(tmpDir)
    .filter((entry) =>
      entry.startsWith('workbench.desktop.main.css.codex-backup-') && entry.endsWith('-opaque-overlays'),
    );
  assert.equal(backups.length, 0);
});

test('patch script fails closed when overlay selectors are missing', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-opaque-overlays-test-'));
  const cssPath = path.join(tmpDir, 'workbench.desktop.main.css');
  fs.writeFileSync(cssPath, '.monaco-workbench{color:inherit}\\n');

  const result = runPatchScript({ cssPath });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Could not apply VS Code opaque overlays patch safely/);
});
