const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const scriptPath = path.join(__dirname, '..', 'scripts', 'patch-vscode-terminal-tabs-layout.js');

function runPatchScript({ cssPath }) {
  return childProcess.spawnSync(process.execPath, [scriptPath], {
    env: {
      ...process.env,
      VSCODE_WORKBENCH_CSS: cssPath,
    },
    encoding: 'utf8',
  });
}

const terminalTabsCss = [
  '.monaco-workbench .pane-body.integrated-terminal .tabs-list .terminal-tabs-entry{text-align:center}',
  '.monaco-workbench .pane-body.integrated-terminal .tabs-container.has-text .tabs-list .terminal-tabs-entry{padding-left:10px;padding-right:10px;text-align:left}',
  '.monaco-workbench .pane-body.integrated-terminal .tabs-list .actions,.monaco-workbench .pane-body.integrated-terminal .tabs-list .editable-tab .monaco-icon-name-container{display:none}',
  '',
].join('\n');
const patchMarker =
  '/* codex-vscode-terminal-tools: terminal-tabs-two-line-layout. Reapply with patch-vscode-terminal-tabs-layout. */';
const labelIconPositionRule =
  '.monaco-workbench .pane-body.integrated-terminal .tabs-list .terminal-tabs-entry .monaco-icon-label:before,.monaco-workbench .pane-body.integrated-terminal .tabs-list .terminal-tabs-entry .monaco-icon-label>.monaco-icon-label-iconpath{position:absolute!important;left:0!important;top:calc(50% - 19px)!important;font-size:24px!important;width:28px!important;height:38px!important;line-height:38px!important;text-align:center!important;display:block!important;margin:0!important;padding:0!important;opacity:1!important;}';
const previousLabelIconPositionRule =
  '.monaco-workbench .pane-body.integrated-terminal .tabs-list .terminal-tabs-entry .monaco-icon-label:before,.monaco-workbench .pane-body.integrated-terminal .tabs-list .terminal-tabs-entry .monaco-icon-label>.monaco-icon-label-iconpath{position:absolute!important;left:0!important;top:calc(50% - 19px)!important;font-size:24px!important;width:28px!important;height:38px!important;line-height:38px!important;text-align:center!important;display:block!important;margin:0!important;padding:0!important;color:var(--vscode-icon-foreground)!important;opacity:1!important;}';
const titleCodiconPositionRule =
  '.monaco-workbench .pane-body.integrated-terminal .tabs-list .terminal-tabs-entry .monaco-highlighted-label .codicon:first-child{position:absolute!important;left:0!important;top:calc(50% - 19px)!important;font-size:24px!important;width:28px!important;height:38px!important;line-height:38px!important;text-align:center!important;opacity:1!important;}';
const defaultTerminalIconFallbackRule =
  '.monaco-workbench .pane-body.integrated-terminal .tabs-list .terminal-tabs-entry .monaco-icon-label:not([class*="codicon-"]):not(.terminal-uri-icon):before{content:"\\ea85"!important;font-family:codicon!important;background-image:none!important;}';
const actionIconsRule =
  '.monaco-workbench .pane-body.integrated-terminal .tabs-list .terminal-tabs-entry .actions .action-label.codicon,.monaco-workbench .pane-body.integrated-terminal .tabs-list .terminal-tabs-entry .monaco-action-bar .action-label.codicon{color:var(--vscode-icon-foreground)!important;opacity:1!important;}';
const activeActionIconsRule =
  '.monaco-workbench .pane-body.integrated-terminal .tabs-list .monaco-list-row.selected .terminal-tabs-entry .actions .action-label.codicon,.monaco-workbench .pane-body.integrated-terminal .tabs-list .monaco-list-row.focused .terminal-tabs-entry .actions .action-label.codicon,.monaco-workbench .pane-body.integrated-terminal .tabs-list .monaco-list-row.selected .terminal-tabs-entry .monaco-action-bar .action-label.codicon,.monaco-workbench .pane-body.integrated-terminal .tabs-list .monaco-list-row.focused .terminal-tabs-entry .monaco-action-bar .action-label.codicon{color:var(--vscode-list-activeSelectionForeground,var(--vscode-foreground))!important;}';
const currentPatchBlockLines = [
  patchMarker,
  '.monaco-workbench .pane-body.integrated-terminal .tabs-list .monaco-list-row{height:68px!important;line-height:20px!important;}',
  '.monaco-workbench .pane-body.integrated-terminal .tabs-list .terminal-tabs-entry{min-height:68px!important;height:68px!important;align-items:center!important;padding-top:5px!important;padding-bottom:5px!important;padding-left:12px!important;padding-right:10px!important;box-sizing:border-box!important;}',
  '.monaco-workbench .pane-body.integrated-terminal .tabs-list .terminal-tabs-entry .monaco-icon-label{height:100%!important;min-height:58px!important;line-height:19px!important;display:flex!important;align-items:center!important;position:relative!important;}',
  '.monaco-workbench .pane-body.integrated-terminal .tabs-list .terminal-tabs-entry .monaco-icon-label-container{white-space:normal!important;overflow:visible!important;display:flex!important;flex-direction:column!important;justify-content:center!important;min-height:58px!important;padding-left:38px!important;}',
  '.monaco-workbench .pane-body.integrated-terminal .tabs-list .terminal-tabs-entry .monaco-icon-name-container,.monaco-workbench .pane-body.integrated-terminal .tabs-list .terminal-tabs-entry .monaco-icon-description-container{white-space:normal!important;overflow:hidden!important;text-overflow:clip!important;}',
  labelIconPositionRule,
  titleCodiconPositionRule,
  defaultTerminalIconFallbackRule,
  '.monaco-workbench .pane-body.integrated-terminal .tabs-list .terminal-tabs-entry .monaco-highlighted-label{white-space:pre-line!important;line-height:19px!important;letter-spacing:0!important;font-kerning:normal!important;overflow:hidden!important;text-overflow:clip!important;overflow-wrap:normal!important;word-break:normal!important;display:-webkit-box!important;-webkit-box-orient:vertical!important;-webkit-line-clamp:3!important;line-clamp:3!important;}',
  actionIconsRule,
  activeActionIconsRule,
];

test('patch script adds multi-line wrapping rules for terminal tab labels', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-terminal-tabs-layout-test-'));
  const cssPath = path.join(tmpDir, 'workbench.desktop.main.css');
  fs.writeFileSync(cssPath, terminalTabsCss);

  const result = runPatchScript({ cssPath });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Patched VS Code terminal tabs layout:/);
  const nextSource = fs.readFileSync(cssPath, 'utf8');
  assert.match(nextSource, /codex-vscode-terminal-tools: terminal-tabs-two-line-layout/);
  assert.match(nextSource, /\.terminal-tabs-entry\{min-height:68px!important/);
  assert.match(nextSource, /align-items:center!important/);
  assert.match(nextSource, /padding-top:5px!important/);
  assert.match(nextSource, /padding-left:12px!important/);
  assert.match(nextSource, /\.monaco-icon-label\{height:100%!important;min-height:58px!important;line-height:19px!important;display:flex!important;align-items:center!important;position:relative!important/);
  assert.match(nextSource, /\.monaco-icon-label-container\{white-space:normal!important;overflow:visible!important;display:flex!important;flex-direction:column!important;justify-content:center!important;min-height:58px!important;padding-left:38px!important/);
  assert.equal(nextSource.includes(labelIconPositionRule), true);
  assert.equal(nextSource.includes(previousLabelIconPositionRule), false);
  assert.equal(nextSource.includes(titleCodiconPositionRule), true);
  assert.equal(nextSource.includes(defaultTerminalIconFallbackRule), true);
  assert.match(nextSource, /\.monaco-highlighted-label\{white-space:pre-line!important/);
  assert.match(nextSource, /line-height:19px!important/);
  assert.match(nextSource, /letter-spacing:0!important/);
  assert.match(nextSource, /font-kerning:normal!important/);
  assert.match(nextSource, /overflow-wrap:normal!important/);
  assert.match(nextSource, /-webkit-line-clamp:3!important/);
  assert.equal(nextSource.includes(actionIconsRule), true);
  assert.equal(nextSource.includes(activeActionIconsRule), true);

  const backups = fs
    .readdirSync(tmpDir)
    .filter((entry) =>
      entry.startsWith('workbench.desktop.main.css.codex-backup-') && entry.endsWith('-terminal-tabs-layout'),
    );
  assert.equal(backups.length, 1);
  assert.equal(fs.readFileSync(path.join(tmpDir, backups[0]), 'utf8'), terminalTabsCss);
});

test('patch script is idempotent when terminal tab wrapping is already patched', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-terminal-tabs-layout-test-'));
  const cssPath = path.join(tmpDir, 'workbench.desktop.main.css');
  fs.writeFileSync(
    cssPath,
    [
      terminalTabsCss.trimEnd(),
      '',
      ...currentPatchBlockLines,
      '',
    ].join('\n'),
  );

  const result = runPatchScript({ cssPath });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Already patched: .*workbench\.desktop\.main\.css/);

  const backups = fs
    .readdirSync(tmpDir)
    .filter((entry) =>
      entry.startsWith('workbench.desktop.main.css.codex-backup-') && entry.endsWith('-terminal-tabs-layout'),
    );
  assert.equal(backups.length, 0);
});

test('patch script upgrades the previous 44px terminal tab wrapping rules', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-terminal-tabs-layout-test-'));
  const cssPath = path.join(tmpDir, 'workbench.desktop.main.css');
  fs.writeFileSync(
    cssPath,
    [
      terminalTabsCss.trimEnd(),
      '',
      '/* codex-vscode-terminal-tools: terminal-tabs-two-line-layout. Reapply with patch-vscode-terminal-tabs-layout. */',
      '.monaco-workbench .pane-body.integrated-terminal .tabs-list .monaco-list-row{height:44px!important;line-height:20px!important;}',
      '.monaco-workbench .pane-body.integrated-terminal .tabs-list .terminal-tabs-entry{min-height:44px!important;height:44px!important;align-items:flex-start!important;padding-top:3px!important;padding-bottom:3px!important;box-sizing:border-box!important;}',
      '.monaco-workbench .pane-body.integrated-terminal .tabs-list .terminal-tabs-entry .monaco-icon-label{height:auto!important;line-height:18px!important;}',
      '.monaco-workbench .pane-body.integrated-terminal .tabs-list .terminal-tabs-entry .monaco-icon-label-container{white-space:normal!important;overflow:visible!important;}',
      '.monaco-workbench .pane-body.integrated-terminal .tabs-list .terminal-tabs-entry .monaco-icon-name-container,.monaco-workbench .pane-body.integrated-terminal .tabs-list .terminal-tabs-entry .monaco-icon-description-container{white-space:normal!important;overflow:hidden!important;text-overflow:clip!important;}',
      '.monaco-workbench .pane-body.integrated-terminal .tabs-list .terminal-tabs-entry .monaco-highlighted-label{white-space:normal!important;overflow:hidden!important;text-overflow:clip!important;overflow-wrap:anywhere!important;word-break:normal!important;display:-webkit-box!important;-webkit-box-orient:vertical!important;-webkit-line-clamp:2!important;line-clamp:2!important;}',
      '',
    ].join('\n'),
  );

  const result = runPatchScript({ cssPath });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Patched VS Code terminal tabs layout:/);
  const nextSource = fs.readFileSync(cssPath, 'utf8');
  assert.equal(nextSource.includes('min-height:44px!important'), false);
  assert.equal(nextSource.includes('overflow-wrap:anywhere!important'), false);
  assert.equal(nextSource.includes('min-height:68px!important'), true);
  assert.equal(nextSource.includes('padding-left:12px!important'), true);
  assert.equal(nextSource.includes('align-items:center!important'), true);
  assert.equal(nextSource.includes('line-height:19px!important'), true);
  assert.equal(nextSource.includes('height:100%!important;min-height:58px!important'), true);
  assert.equal(nextSource.includes('justify-content:center!important'), true);
  assert.equal(nextSource.includes('padding-left:38px!important'), true);
  assert.equal(nextSource.includes('font-size:24px!important'), true);
  assert.equal(nextSource.includes('height:38px!important;line-height:38px!important'), true);
  assert.equal(nextSource.includes('letter-spacing:0!important'), true);
  assert.equal(nextSource.includes('overflow-wrap:normal!important'), true);
  assert.equal(nextSource.includes('-webkit-line-clamp:3!important'), true);
});

test('patch script upgrades the previous 48px terminal tab wrapping rules', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-terminal-tabs-layout-test-'));
  const cssPath = path.join(tmpDir, 'workbench.desktop.main.css');
  fs.writeFileSync(
    cssPath,
    [
      terminalTabsCss.trimEnd(),
      '',
      '/* codex-vscode-terminal-tools: terminal-tabs-two-line-layout. Reapply with patch-vscode-terminal-tabs-layout. */',
      '.monaco-workbench .pane-body.integrated-terminal .tabs-list .monaco-list-row{height:48px!important;line-height:20px!important;}',
      '.monaco-workbench .pane-body.integrated-terminal .tabs-list .terminal-tabs-entry{min-height:48px!important;height:48px!important;align-items:flex-start!important;padding-top:5px!important;padding-bottom:5px!important;padding-left:12px!important;padding-right:10px!important;box-sizing:border-box!important;}',
      '.monaco-workbench .pane-body.integrated-terminal .tabs-list .terminal-tabs-entry .monaco-icon-label{height:auto!important;line-height:18px!important;}',
      '.monaco-workbench .pane-body.integrated-terminal .tabs-list .terminal-tabs-entry .monaco-icon-label-container{white-space:normal!important;overflow:visible!important;}',
      '.monaco-workbench .pane-body.integrated-terminal .tabs-list .terminal-tabs-entry .monaco-icon-name-container,.monaco-workbench .pane-body.integrated-terminal .tabs-list .terminal-tabs-entry .monaco-icon-description-container{white-space:normal!important;overflow:hidden!important;text-overflow:clip!important;}',
      '.monaco-workbench .pane-body.integrated-terminal .tabs-list .terminal-tabs-entry .monaco-highlighted-label{white-space:normal!important;overflow:hidden!important;text-overflow:clip!important;overflow-wrap:normal!important;word-break:normal!important;display:-webkit-box!important;-webkit-box-orient:vertical!important;-webkit-line-clamp:2!important;line-clamp:2!important;}',
      '',
    ].join('\n'),
  );

  const result = runPatchScript({ cssPath });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Patched VS Code terminal tabs layout:/);
  const nextSource = fs.readFileSync(cssPath, 'utf8');
  assert.equal(nextSource.includes('min-height:48px!important'), false);
  assert.equal(nextSource.includes('-webkit-line-clamp:2!important'), false);
  assert.equal(nextSource.includes('min-height:68px!important'), true);
  assert.equal(nextSource.includes('white-space:pre-line!important'), true);
  assert.equal(nextSource.includes('align-items:center!important'), true);
  assert.equal(nextSource.includes('line-height:19px!important'), true);
  assert.equal(nextSource.includes('height:100%!important;min-height:58px!important'), true);
  assert.equal(nextSource.includes('justify-content:center!important'), true);
  assert.equal(nextSource.includes('padding-left:38px!important'), true);
  assert.equal(nextSource.includes('font-size:24px!important'), true);
  assert.equal(nextSource.includes('height:38px!important;line-height:38px!important'), true);
  assert.equal(nextSource.includes('letter-spacing:0!important'), true);
  assert.equal(nextSource.includes('-webkit-line-clamp:3!important'), true);
});

test('patch script upgrades the previous 64px terminal tab wrapping rules', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-terminal-tabs-layout-test-'));
  const cssPath = path.join(tmpDir, 'workbench.desktop.main.css');
  fs.writeFileSync(
    cssPath,
    [
      terminalTabsCss.trimEnd(),
      '',
      '/* codex-vscode-terminal-tools: terminal-tabs-two-line-layout. Reapply with patch-vscode-terminal-tabs-layout. */',
      '.monaco-workbench .pane-body.integrated-terminal .tabs-list .monaco-list-row{height:64px!important;line-height:20px!important;}',
      '.monaco-workbench .pane-body.integrated-terminal .tabs-list .terminal-tabs-entry{min-height:64px!important;height:64px!important;align-items:flex-start!important;padding-top:5px!important;padding-bottom:5px!important;padding-left:12px!important;padding-right:10px!important;box-sizing:border-box!important;}',
      '.monaco-workbench .pane-body.integrated-terminal .tabs-list .terminal-tabs-entry .monaco-icon-label{height:auto!important;line-height:17px!important;}',
      '.monaco-workbench .pane-body.integrated-terminal .tabs-list .terminal-tabs-entry .monaco-icon-label-container{white-space:normal!important;overflow:visible!important;}',
      '.monaco-workbench .pane-body.integrated-terminal .tabs-list .terminal-tabs-entry .monaco-icon-name-container,.monaco-workbench .pane-body.integrated-terminal .tabs-list .terminal-tabs-entry .monaco-icon-description-container{white-space:normal!important;overflow:hidden!important;text-overflow:clip!important;}',
      '.monaco-workbench .pane-body.integrated-terminal .tabs-list .terminal-tabs-entry .monaco-highlighted-label{white-space:pre-line!important;overflow:hidden!important;text-overflow:clip!important;overflow-wrap:normal!important;word-break:normal!important;display:-webkit-box!important;-webkit-box-orient:vertical!important;-webkit-line-clamp:3!important;line-clamp:3!important;}',
      '',
    ].join('\n'),
  );

  const result = runPatchScript({ cssPath });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Patched VS Code terminal tabs layout:/);
  const nextSource = fs.readFileSync(cssPath, 'utf8');
  assert.equal(nextSource.includes('min-height:64px!important'), false);
  assert.equal(nextSource.includes('align-items:flex-start!important'), false);
  assert.equal(nextSource.includes('line-height:17px!important'), false);
  assert.equal(nextSource.includes('min-height:68px!important'), true);
  assert.equal(nextSource.includes('align-items:center!important'), true);
  assert.equal(nextSource.includes('line-height:19px!important'), true);
  assert.equal(nextSource.includes('height:100%!important;min-height:58px!important'), true);
  assert.equal(nextSource.includes('justify-content:center!important'), true);
  assert.equal(nextSource.includes('padding-left:38px!important'), true);
  assert.equal(nextSource.includes('font-size:24px!important'), true);
  assert.equal(nextSource.includes('height:38px!important;line-height:38px!important'), true);
  assert.equal(nextSource.includes('letter-spacing:0!important'), true);
});

test('patch script upgrades the previous 68px centered terminal tab wrapping rules', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-terminal-tabs-layout-test-'));
  const cssPath = path.join(tmpDir, 'workbench.desktop.main.css');
  fs.writeFileSync(
    cssPath,
    [
      terminalTabsCss.trimEnd(),
      '',
      '/* codex-vscode-terminal-tools: terminal-tabs-two-line-layout. Reapply with patch-vscode-terminal-tabs-layout. */',
      '.monaco-workbench .pane-body.integrated-terminal .tabs-list .monaco-list-row{height:68px!important;line-height:20px!important;}',
      '.monaco-workbench .pane-body.integrated-terminal .tabs-list .terminal-tabs-entry{min-height:68px!important;height:68px!important;align-items:center!important;padding-top:5px!important;padding-bottom:5px!important;padding-left:12px!important;padding-right:10px!important;box-sizing:border-box!important;}',
      '.monaco-workbench .pane-body.integrated-terminal .tabs-list .terminal-tabs-entry .monaco-icon-label{height:100%!important;min-height:58px!important;line-height:19px!important;display:flex!important;align-items:center!important;}',
      '.monaco-workbench .pane-body.integrated-terminal .tabs-list .terminal-tabs-entry .monaco-icon-label-container{white-space:normal!important;overflow:visible!important;display:flex!important;flex-direction:column!important;justify-content:center!important;min-height:58px!important;}',
      '.monaco-workbench .pane-body.integrated-terminal .tabs-list .terminal-tabs-entry .monaco-icon-name-container,.monaco-workbench .pane-body.integrated-terminal .tabs-list .terminal-tabs-entry .monaco-icon-description-container{white-space:normal!important;overflow:hidden!important;text-overflow:clip!important;}',
      '.monaco-workbench .pane-body.integrated-terminal .tabs-list .terminal-tabs-entry .monaco-highlighted-label{white-space:pre-line!important;line-height:19px!important;letter-spacing:0!important;font-kerning:normal!important;overflow:hidden!important;text-overflow:clip!important;overflow-wrap:normal!important;word-break:normal!important;display:-webkit-box!important;-webkit-box-orient:vertical!important;-webkit-line-clamp:3!important;line-clamp:3!important;}',
      '',
    ].join('\n'),
  );

  const result = runPatchScript({ cssPath });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Patched VS Code terminal tabs layout:/);
  const nextSource = fs.readFileSync(cssPath, 'utf8');
  assert.equal(
    nextSource.includes('align-items:center!important;position:relative!important'),
    true,
  );
  assert.equal(nextSource.includes('height:100%!important;min-height:58px!important'), true);
  assert.equal(nextSource.includes('justify-content:center!important'), true);
  assert.equal(nextSource.includes('padding-left:38px!important'), true);
  assert.equal(nextSource.includes('font-size:24px!important'), true);
  assert.equal(nextSource.includes('height:38px!important;line-height:38px!important'), true);
});

test('patch script upgrades the previous 68px top-aligned terminal tab wrapping rules', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-terminal-tabs-layout-test-'));
  const cssPath = path.join(tmpDir, 'workbench.desktop.main.css');
  fs.writeFileSync(
    cssPath,
    [
      terminalTabsCss.trimEnd(),
      '',
      '/* codex-vscode-terminal-tools: terminal-tabs-two-line-layout. Reapply with patch-vscode-terminal-tabs-layout. */',
      '.monaco-workbench .pane-body.integrated-terminal .tabs-list .monaco-list-row{height:68px!important;line-height:20px!important;}',
      '.monaco-workbench .pane-body.integrated-terminal .tabs-list .terminal-tabs-entry{min-height:68px!important;height:68px!important;align-items:center!important;padding-top:5px!important;padding-bottom:5px!important;padding-left:12px!important;padding-right:10px!important;box-sizing:border-box!important;}',
      '.monaco-workbench .pane-body.integrated-terminal .tabs-list .terminal-tabs-entry .monaco-icon-label{height:auto!important;line-height:19px!important;}',
      '.monaco-workbench .pane-body.integrated-terminal .tabs-list .terminal-tabs-entry .monaco-icon-label-container{white-space:normal!important;overflow:visible!important;}',
      '.monaco-workbench .pane-body.integrated-terminal .tabs-list .terminal-tabs-entry .monaco-icon-name-container,.monaco-workbench .pane-body.integrated-terminal .tabs-list .terminal-tabs-entry .monaco-icon-description-container{white-space:normal!important;overflow:hidden!important;text-overflow:clip!important;}',
      '.monaco-workbench .pane-body.integrated-terminal .tabs-list .terminal-tabs-entry .monaco-highlighted-label{white-space:pre-line!important;line-height:19px!important;letter-spacing:0!important;font-kerning:normal!important;overflow:hidden!important;text-overflow:clip!important;overflow-wrap:normal!important;word-break:normal!important;display:-webkit-box!important;-webkit-box-orient:vertical!important;-webkit-line-clamp:3!important;line-clamp:3!important;}',
      '',
    ].join('\n'),
  );

  const result = runPatchScript({ cssPath });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Patched VS Code terminal tabs layout:/);
  const nextSource = fs.readFileSync(cssPath, 'utf8');
  assert.equal(nextSource.includes('height:auto!important;line-height:19px!important'), false);
  assert.equal(nextSource.includes('height:100%!important;min-height:58px!important'), true);
  assert.equal(nextSource.includes('justify-content:center!important'), true);
  assert.equal(nextSource.includes('padding-left:38px!important'), true);
  assert.equal(nextSource.includes('font-size:24px!important'), true);
  assert.equal(nextSource.includes('height:38px!important;line-height:38px!important'), true);
});

test('patch script upgrades forced default label-icon color rules', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-terminal-tabs-layout-test-'));
  const cssPath = path.join(tmpDir, 'workbench.desktop.main.css');
  const forcedColorPatchBlockLines = currentPatchBlockLines.map((line) =>
    line === labelIconPositionRule ? previousLabelIconPositionRule : line,
  );
  fs.writeFileSync(
    cssPath,
    [terminalTabsCss.trimEnd(), '', ...forcedColorPatchBlockLines, ''].join('\n'),
  );

  const result = runPatchScript({ cssPath });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Patched VS Code terminal tabs layout:/);
  const nextSource = fs.readFileSync(cssPath, 'utf8');
  assert.equal(nextSource.includes(labelIconPositionRule), true);
  assert.equal(nextSource.includes(previousLabelIconPositionRule), false);
});

test('patch script fails closed when terminal tabs CSS markers are missing', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-terminal-tabs-layout-test-'));
  const cssPath = path.join(tmpDir, 'workbench.desktop.main.css');
  fs.writeFileSync(cssPath, '.monaco-workbench .part.editor{display:block}\\n');

  const result = runPatchScript({ cssPath });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Could not apply VS Code terminal tabs layout patch safely/);
});
