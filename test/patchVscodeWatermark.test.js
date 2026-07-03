const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const scriptPath = path.join(__dirname, '..', 'scripts', 'patch-vscode-watermark.js');

function runPatchScript({ cssPath }) {
  return childProcess.spawnSync(process.execPath, [scriptPath], {
    env: {
      ...process.env,
      VSCODE_WORKBENCH_CSS: cssPath,
    },
    encoding: 'utf8',
  });
}

test('patch script hides the empty editor watermark logo and keeps a backup', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-vscode-watermark-test-'));
  const cssPath = path.join(tmpDir, 'workbench.desktop.main.css');
  const source = [
    '.monaco-workbench .part.editor .editor-group-watermark .letterpress{',
    'background-image:url("../../media/letterpress-dark.svg")',
    '}',
    '',
  ].join('\n');
  fs.writeFileSync(cssPath, source);

  const result = runPatchScript({ cssPath });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Patched VS Code empty editor watermark:/);
  assert.match(fs.readFileSync(cssPath, 'utf8'), /codex-vscode-terminal-tools: hide-empty-editor-watermark/);
  assert.match(fs.readFileSync(cssPath, 'utf8'), /\.editor-group-watermark \.letterpress\{display:none!important;\}/);

  const backups = fs
    .readdirSync(tmpDir)
    .filter((entry) =>
      entry.startsWith('workbench.desktop.main.css.codex-backup-') && entry.endsWith('-vscode-watermark'),
    );
  assert.equal(backups.length, 1);
  assert.equal(fs.readFileSync(path.join(tmpDir, backups[0]), 'utf8'), source);
});

test('patch script is idempotent when the watermark logo is already hidden', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-vscode-watermark-test-'));
  const cssPath = path.join(tmpDir, 'workbench.desktop.main.css');
  fs.writeFileSync(
    cssPath,
    [
      '.monaco-workbench .part.editor .editor-group-watermark .letterpress{background-image:url("../../media/letterpress-dark.svg")}',
      '/* codex-vscode-terminal-tools: hide-empty-editor-watermark. Reapply with patch-vscode-watermark. */',
      '.monaco-workbench .part.editor>.content .editor-group-container>.editor-group-watermark-wrapper .editor-group-watermark .letterpress{display:none!important;}',
      '',
    ].join('\n'),
  );

  const result = runPatchScript({ cssPath });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Already patched: .*workbench\.desktop\.main\.css/);
  const backups = fs
    .readdirSync(tmpDir)
    .filter((entry) =>
      entry.startsWith('workbench.desktop.main.css.codex-backup-') && entry.endsWith('-vscode-watermark'),
    );
  assert.equal(backups.length, 0);
});

test('patch script fails closed when the workbench CSS is missing', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-vscode-watermark-test-'));
  const cssPath = path.join(tmpDir, 'missing.css');

  const result = runPatchScript({ cssPath });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /VS Code workbench CSS not found:/);
});
