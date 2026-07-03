const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  checkVscodeDockIconPatch,
  checkVscodeIconPatch,
  checkVscodeWatermarkPatch,
  checkWorkbenchPatches,
  checkHostConfig,
  ensureGlobalPatchWrapper,
  ensureImeGuardPatchWrapper,
  normalizeCodexConfigToml,
  normalizeKeybindings,
  normalizeSettings,
  normalizeZshrc,
  parseJsonc,
} = require('../src/hostConfig');

test('normalizeSettings applies managed VS Code settings without dropping existing values', () => {
  const settings = {
    'files.autoSave': 'afterDelay',
    'terminal.integrated.commandsToSkipShell': ['workbench.action.terminal.clear'],
    'workbench.settings.applyToAllProfiles': ['claudeCode.selectedModel'],
    'workbench.colorCustomizations': {
      'editor.lineHighlightBackground': '#111111',
    },
  };

  const { value, changed } = normalizeSettings(settings);

  assert.equal(changed, true);
  assert.equal(value['files.autoSave'], 'afterDelay');
  assert.equal(value['update.mode'], 'none');
  assert.equal(value['terminal.integrated.splitCwd'], 'inherited');
  assert.equal(value['terminal.integrated.tabs.focusMode'], 'singleClick');
  assert.equal(
    value['terminal.integrated.persistentSessionReviveProcess'],
    'onExitAndWindowClose',
  );
  assert.deepEqual(value['terminal.integrated.commandsToSkipShell'], [
    'workbench.action.terminal.clear',
  ]);
  assert.equal(value['workbench.colorCustomizations']['editor.lineHighlightBackground'], '#111111');
  assert.equal(value['workbench.colorCustomizations']['editorCursor.foreground'], '#E9072D');
  assert.equal(
    value['workbench.settings.applyToAllProfiles'].includes('terminal.integrated.tabs.focusMode'),
    true,
  );
  assert.equal(
    value['workbench.settings.applyToAllProfiles'].includes('workbench.browser.openLocalhostLinks'),
    true,
  );
  assert.equal(
    value['workbench.settings.applyToAllProfiles'].includes('terminal.integrated.commandsToSkipShell'),
    true,
  );
  assert.equal(
    value['workbench.settings.applyToAllProfiles'].includes(
      'terminal.integrated.enablePersistentSessions',
    ),
    true,
  );
  assert.equal(
    value['workbench.settings.applyToAllProfiles'].includes(
      'terminal.integrated.persistentSessionReviveProcess',
    ),
    true,
  );
});

test('normalizeKeybindings replaces managed terminal shortcuts and preserves unrelated keys', () => {
  const keybindings = [
    {
      key: 'cmd+t',
      command: 'workbench.action.terminal.new',
      when: 'terminalProcessSupported || terminalWebExtensionContributedProfile',
    },
    {
      key: 'cmd+w',
      command: 'workbench.action.closeActiveEditor',
    },
    {
      key: 'shift+enter',
      command: 'workbench.action.terminal.sendSequence',
      args: {
        text: '\u001b\n',
      },
      when: 'terminalFocus',
    },
    {
      key: 'cmd+v',
      command: 'workbench.action.terminal.paste',
      when: 'terminalFocus',
    },
  ];

  const { value, changed } = normalizeKeybindings(keybindings);

  assert.equal(changed, true);
  assert.equal(value.some((entry) => entry.command === 'workbench.action.closeActiveEditor'), true);
  assert.deepEqual(
    value.find((entry) => entry.command === 'codexTerminal.newFromActiveCwd'),
    {
      key: 'cmd+t',
      command: 'codexTerminal.newFromActiveCwd',
      when: 'terminalProcessSupported || terminalWebExtensionContributedProfile',
    },
  );
  assert.deepEqual(
    value.find((entry) => entry.command === 'codexTerminal.detachWithTtl'),
    {
      key: 'cmd+w',
      command: 'codexTerminal.detachWithTtl',
      when: 'terminal.active && terminalFocus',
    },
  );
  assert.deepEqual(
    value.find((entry) => entry.command === '-workbench.action.reopenClosedEditor'),
    {
      key: 'cmd+shift+t',
      command: '-workbench.action.reopenClosedEditor',
    },
  );
  assert.deepEqual(
    value.find((entry) => entry.command === 'codexTerminal.smartPaste'),
    {
      key: 'cmd+v',
      command: 'codexTerminal.smartPaste',
      when: 'terminalFocus',
    },
  );
  assert.equal(
    value.some(
      (entry) =>
        entry.key === 'shift+enter' &&
        entry.command === 'workbench.action.terminal.sendSequence' &&
        entry.when === 'terminalFocus',
    ),
    false,
  );
});

test('normalizeZshrc upgrades the cwd-title hook to the managed block', () => {
  const zshrc = [
    'source $ZSH/oh-my-zsh.sh',
    '',
    '# VS Code terminal tab title: show cwd as ~/...',
    '_vscode_cwd_title() {',
    '  [[ "$TERM_PROGRAM" == "vscode" ]] || return',
    '}',
    'add-zsh-hook precmd _vscode_cwd_title',
    'add-zsh-hook chpwd _vscode_cwd_title',
    '',
    '# User configuration',
    '',
  ].join('\n');

  const { value, changed } = normalizeZshrc(zshrc);

  assert.equal(changed, true);
  assert.match(value, /# BEGIN codex-vscode-terminal-tools: vscode-cwd-title/);
  assert.match(value, /add-zsh-hook -d precmd _vscode_cwd_title/);
  assert.match(value, /# END codex-vscode-terminal-tools: vscode-cwd-title/);
  assert.equal(value.includes('# User configuration'), true);
});

test('normalizeCodexConfigToml keeps Codex thread id in terminal titles', () => {
  const source = [
    'model = "gpt-5"',
    'terminal_title = ["activity", "project-name", "thread-title", "fast-mode"]',
    'status_line = ["model-with-reasoning", "thread-id", "fast-mode"]',
    '',
  ].join('\n');

  const { value, changed } = normalizeCodexConfigToml(source);

  assert.equal(changed, true);
  assert.equal(
    value.includes(
      'terminal_title = ["activity", "project-name", "thread-title", "thread-id", "fast-mode"]',
    ),
    true,
  );
  assert.equal(value.includes('status_line = ["model-with-reasoning", "thread-id", "fast-mode"]'), true);
});

test('ensureGlobalPatchWrapper writes a wrapper that applies every local patch', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-host-config-test-'));
  const wrapperPath = path.join(tmpDir, 'bin', 'patch-vscode-terminal-order');
  const projectRoot = '/tmp/codex-vscode-terminal-tools';

  const result = ensureGlobalPatchWrapper({ wrapperPath, projectRoot });

  assert.equal(result.changed, true);
  assert.equal(fs.statSync(wrapperPath).mode & 0o111, 0o111);
  assert.equal(
    fs.readFileSync(wrapperPath, 'utf8'),
    [
      '#!/bin/sh',
      'set -eu',
      '',
      'cd /tmp/codex-vscode-terminal-tools',
      'exec npm run patch',
      '',
    ].join('\n'),
  );
});

test('ensureImeGuardPatchWrapper writes a wrapper for the focused IME patch', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-host-config-test-'));
  const wrapperPath = path.join(tmpDir, 'bin', 'patch-vscode-ime-guard');
  const projectRoot = '/tmp/codex-vscode-terminal-tools';

  const result = ensureImeGuardPatchWrapper({ wrapperPath, projectRoot });

  assert.equal(result.changed, true);
  assert.equal(fs.statSync(wrapperPath).mode & 0o111, 0o111);
  assert.equal(
    fs.readFileSync(wrapperPath, 'utf8'),
    [
      '#!/bin/sh',
      'set -eu',
      '',
      'cd /tmp/codex-vscode-terminal-tools',
      'exec npm run patch:vscode-ime-guard',
      '',
    ].join('\n'),
  );
});

test('checkHostConfig reports managed files as ok', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-host-config-test-'));
  const home = path.join(tmpDir, 'home');
  const userDir = path.join(home, 'Library', 'Application Support', 'Code', 'User');
  const binDir = path.join(home, '.local', 'bin');
  const extensionDir = path.join(home, '.vscode', 'extensions', 'seongho.codex-vscode-terminal-tools-0.0.1');
  const projectRoot = path.join(tmpDir, 'project');
  fs.mkdirSync(userDir, { recursive: true });
  fs.mkdirSync(binDir, { recursive: true });
  fs.mkdirSync(path.dirname(extensionDir), { recursive: true });
  fs.mkdirSync(projectRoot, { recursive: true });
  fs.symlinkSync(projectRoot, extensionDir);

  fs.writeFileSync(
    path.join(userDir, 'settings.json'),
    `${JSON.stringify(normalizeSettings({}).value, null, 2)}\n`,
  );
  fs.writeFileSync(
    path.join(userDir, 'keybindings.json'),
    `${JSON.stringify(normalizeKeybindings([]).value, null, 2)}\n`,
  );
  fs.writeFileSync(path.join(home, '.zshrc'), normalizeZshrc('').value);
  fs.mkdirSync(path.join(home, '.codex'), { recursive: true });
  fs.writeFileSync(
    path.join(home, '.codex', 'config.toml'),
    normalizeCodexConfigToml('').value,
  );
  ensureGlobalPatchWrapper({
    wrapperPath: path.join(binDir, 'patch-vscode-terminal-order'),
    projectRoot,
  });
  ensureImeGuardPatchWrapper({
    wrapperPath: path.join(binDir, 'patch-vscode-ime-guard'),
    projectRoot,
  });

  const statuses = checkHostConfig({
    paths: {
      home,
      projectRoot,
      userSettingsPath: path.join(userDir, 'settings.json'),
      userKeybindingsPath: path.join(userDir, 'keybindings.json'),
      zshrcPath: path.join(home, '.zshrc'),
      codexConfigPath: path.join(home, '.codex', 'config.toml'),
      extensionPath: extensionDir,
      wrapperPath: path.join(binDir, 'patch-vscode-terminal-order'),
      imeWrapperPath: path.join(binDir, 'patch-vscode-ime-guard'),
      workbenchPath: path.join(tmpDir, 'missing-workbench.js'),
      claudeExtensionsDir: path.join(tmpDir, 'missing-claude'),
    },
    checkWorkbench: false,
    checkClaude: false,
    checkVscodeIcon: false,
    checkDockIcon: false,
    checkWatermark: false,
  });

  assert.deepEqual(
    Object.fromEntries(statuses.map((status) => [status.id, status.ok])),
    {
      settings: true,
      keybindings: true,
      zshrc: true,
      codexConfig: true,
      extension: true,
      wrapper: true,
      imeWrapper: true,
    },
  );
});

test('checkWorkbenchPatches requires the IME terminal sendSequence hooks', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-host-config-test-'));
  const workbenchPath = path.join(tmpDir, 'workbench.desktop.main.js');
  fs.writeFileSync(
    workbenchPath,
    [
      'this.groups.splice(Math.min(o+1,this.groups.length),0,n)',
      'codexTerminal.rememberCwdColor',
      'typeof t=="string"||t===null',
      'this._terminalGroupService.instances.length-1,I=this._terminalGroupService.instances[S]',
      'this._register($(this._tabListDomElement,"mousedown",async o=>{if(o.button!==0)return',
      '/* Codex VS Code IME guard patch. Reapply with patch-vscode-ime-guard. */',
      '_dispatch(e,t){let o=this.resolveKeyboardEvent(e),n=globalThis.__codexVscodeImeGuard?.defer?.(e,t,()=>this._doDispatch(o,t,!1));return n!==void 0?n:this._doDispatch(o,t,!1)}',
    ].join('\n'),
  );

  assert.deepEqual(checkWorkbenchPatches(workbenchPath), {
    ok: false,
    detail:
      'missing: IME early-capture hook, IME recent-composition defer, IME terminal-target defer, IME native line-break suppressor, IME native paragraph suppressor, IME native CR suppressor, IME native keypress suppressor, IME terminal commit deferral, IME terminal native commit preservation, IME activity quiet-window tracking, IME terminal key handler, IME terminal direct sequence emitter, IME terminal direct sequence dedupe, IME terminal sequence queue, IME terminal legacy LF consume, IME terminal CR sequence queue, IME terminal sequence dedupe, IME sendSequence hook',
  });
});

test('checkVscodeIconPatch reports whether the managed icon is installed', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-host-config-test-'));
  const sourcePath = path.join(tmpDir, 'warp-glass-sky.icns');
  const targetPath = path.join(tmpDir, 'Code.icns');
  fs.writeFileSync(sourcePath, Buffer.from('managed-icon'));

  assert.deepEqual(checkVscodeIconPatch({ sourcePath, targetPath }), {
    ok: false,
    detail: 'VS Code icon missing',
  });

  fs.writeFileSync(targetPath, Buffer.from('old-vscode-icon'));
  assert.deepEqual(checkVscodeIconPatch({ sourcePath, targetPath }), {
    ok: false,
    detail: 'VS Code icon differs from managed Warp Glass Sky icon',
  });

  fs.writeFileSync(targetPath, Buffer.from('managed-icon'));
  assert.deepEqual(checkVscodeIconPatch({ sourcePath, targetPath }), {
    ok: true,
    detail: 'VS Code icon matches managed Warp Glass Sky icon',
  });
});

test('checkVscodeIconPatch requires the Finder custom app icon when checking an app bundle', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-host-config-test-'));
  const appBundlePath = path.join(tmpDir, 'Visual Studio Code.app');
  const sourcePath = path.join(tmpDir, 'warp-glass-sky.icns');
  const targetPath = path.join(tmpDir, 'Code.icns');
  fs.mkdirSync(appBundlePath, { recursive: true });
  fs.writeFileSync(sourcePath, Buffer.from('managed-icon'));
  fs.writeFileSync(targetPath, Buffer.from('managed-icon'));

  assert.deepEqual(checkVscodeIconPatch({ sourcePath, targetPath, appBundlePath }), {
    ok: false,
    detail: 'VS Code Finder custom app icon missing',
  });

  fs.writeFileSync(path.join(appBundlePath, 'Icon\r'), Buffer.from('custom-icon'));
  assert.deepEqual(checkVscodeIconPatch({ sourcePath, targetPath, appBundlePath }), {
    ok: true,
    detail: 'VS Code icon and Finder custom app icon match managed Warp Glass Sky icon',
  });
});

test('checkVscodeDockIconPatch reports whether the runtime Dock icon patch is installed', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-host-config-test-'));
  const mainPath = path.join(tmpDir, 'main.js');
  const pngSourcePath = path.join(tmpDir, 'warp-glass-sky.png');
  const pngTargetPath = path.join(tmpDir, 'codex-warp-glass-sky.png');

  assert.deepEqual(checkVscodeDockIconPatch({ mainPath, pngSourcePath, pngTargetPath }), {
    ok: false,
    detail: 'VS Code main bundle missing',
  });

  fs.writeFileSync(mainPath, 'console.log("main");\n');
  fs.writeFileSync(pngSourcePath, Buffer.from('managed-png'));
  assert.deepEqual(checkVscodeDockIconPatch({ mainPath, pngSourcePath, pngTargetPath }), {
    ok: false,
    detail: 'VS Code Dock icon PNG asset missing',
  });

  fs.writeFileSync(pngTargetPath, Buffer.from('old-png'));
  assert.deepEqual(checkVscodeDockIconPatch({ mainPath, pngSourcePath, pngTargetPath }), {
    ok: false,
    detail: 'VS Code Dock icon PNG asset differs from managed icon',
  });

  fs.writeFileSync(pngTargetPath, Buffer.from('managed-png'));
  assert.deepEqual(checkVscodeDockIconPatch({ mainPath, pngSourcePath, pngTargetPath }), {
    ok: false,
    detail: 'runtime Dock icon patch missing',
  });

  fs.writeFileSync(mainPath, '/* Codex VS Code Dock icon patch. Reapply with patch-vscode-dock-icon. */');
  assert.deepEqual(checkVscodeDockIconPatch({ mainPath, pngSourcePath, pngTargetPath }), {
    ok: true,
    detail: 'runtime Dock icon patch is present',
  });
});

test('checkVscodeWatermarkPatch reports whether the empty editor logo is hidden', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-host-config-test-'));
  const cssPath = path.join(tmpDir, 'workbench.desktop.main.css');

  assert.deepEqual(checkVscodeWatermarkPatch(cssPath), {
    ok: false,
    detail: 'VS Code workbench CSS missing',
  });

  fs.writeFileSync(cssPath, '.editor-group-watermark .letterpress{background-image:url("x.svg")}');
  assert.deepEqual(checkVscodeWatermarkPatch(cssPath), {
    ok: false,
    detail: 'empty editor watermark logo patch missing',
  });

  fs.writeFileSync(
    cssPath,
    [
      '.editor-group-watermark .letterpress{background-image:url("x.svg")}',
      '/* codex-vscode-terminal-tools: hide-empty-editor-watermark. Reapply with patch-vscode-watermark. */',
      '.monaco-workbench .part.editor>.content .editor-group-container>.editor-group-watermark-wrapper .editor-group-watermark .letterpress{display:none!important;}',
      '',
    ].join('\n'),
  );
  assert.deepEqual(checkVscodeWatermarkPatch(cssPath), {
    ok: true,
    detail: 'empty editor watermark logo is hidden',
  });
});

test('parseJsonc accepts VS Code style trailing commas and line comments', () => {
  assert.deepEqual(
    parseJsonc([
      '{',
      '  // comment',
      '  "one": true,',
      '  "nested": {',
      '    "two": 2,',
      '  },',
      '}',
      '',
    ].join('\n')),
    {
      one: true,
      nested: {
        two: 2,
      },
    },
  );
});
