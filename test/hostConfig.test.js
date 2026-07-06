const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  applyHostConfig,
  checkVscodeDockIconPatch,
  checkVscodeIconPatch,
  checkVscodeTerminalTabsLayoutPatch,
  checkVscodeWatermarkPatch,
  checkWorkbenchPatches,
  checkHostConfig,
  createDefaultPaths,
  ensureGlobalPatchWrapper,
  ensureImeGuardPatchWrapper,
  normalizeCodexHooksJson,
  normalizeCodexConfigToml,
  normalizeKeybindings,
  normalizeSettings,
  normalizeZshrc,
  parseJsonc,
} = require('../src/hostConfig');

test('createDefaultPaths targets managed Code and upstream VS Code bundle patches', () => {
  const paths = createDefaultPaths({ home: '/tmp/home', projectRoot: '/tmp/project' });

  assert.equal(paths.vscodeSourceAppPath, '/Applications/Visual Studio Code.app');
  assert.equal(paths.vscodeAppPath, '/Applications/Code.app');
  assert.equal(
    paths.workbenchPath,
    '/Applications/Code.app/Contents/Resources/app/out/vs/workbench/workbench.desktop.main.js',
  );
  assert.equal(
    paths.workbenchCssPath,
    '/Applications/Code.app/Contents/Resources/app/out/vs/workbench/workbench.desktop.main.css',
  );
  assert.equal(paths.mainPath, '/Applications/Code.app/Contents/Resources/app/out/main.js');
  assert.equal(paths.vscodeIconPath, '/Applications/Code.app/Contents/Resources/Code.icns');
  assert.equal(
    paths.vscodeDockIconPngPath,
    '/Applications/Code.app/Contents/Resources/codex-warp-glass-sky.png',
  );
  assert.equal(
    paths.sourceWorkbenchPath,
    '/Applications/Visual Studio Code.app/Contents/Resources/app/out/vs/workbench/workbench.desktop.main.js',
  );
  assert.equal(
    paths.sourceWorkbenchCssPath,
    '/Applications/Visual Studio Code.app/Contents/Resources/app/out/vs/workbench/workbench.desktop.main.css',
  );
  assert.equal(
    paths.sourceMainPath,
    '/Applications/Visual Studio Code.app/Contents/Resources/app/out/main.js',
  );
  assert.equal(
    paths.sourceVscodeIconPath,
    '/Applications/Visual Studio Code.app/Contents/Resources/Code.icns',
  );
  assert.equal(
    paths.sourceVscodeDockIconPngPath,
    '/Applications/Visual Studio Code.app/Contents/Resources/codex-warp-glass-sky.png',
  );
});

test('applyHostConfig ensures the managed Code app before shared host config', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-host-config-test-'));
  const home = path.join(tmpDir, 'home');
  const projectRoot = path.join(tmpDir, 'project');
  fs.mkdirSync(projectRoot, { recursive: true });

  const results = applyHostConfig({
    paths: createDefaultPaths({
      home,
      projectRoot,
      applicationsDir: tmpDir,
    }),
    ensureManagedCodeApp: () => ({ changed: true, reason: 'managed app missing' }),
  });

  assert.deepEqual(results[0], {
    id: 'managedCodeApp',
    changed: true,
    detail: 'managed app missing',
  });
});

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

test('normalizeCodexConfigToml removes Codex thread id from visible title surfaces', () => {
  const source = [
    'model = "gpt-5"',
    'terminal_title = ["activity", "project-name", "thread-title", "thread-id", "fast-mode"]',
    'status_line = ["model-with-reasoning", "thread-id", "fast-mode"]',
    '',
  ].join('\n');

  const { value, changed } = normalizeCodexConfigToml(source);

  assert.equal(changed, true);
  assert.equal(
    value.includes(
      'terminal_title = ["activity", "project-name", "thread-title", "fast-mode"]',
    ),
    true,
  );
  assert.equal(value.includes('status_line = ["model-with-reasoning", "fast-mode"]'), true);
});

test('normalizeCodexHooksJson appends the managed SessionStart hook', () => {
  const existing = {
    hooks: {
      SessionStart: [
        {
          matcher: '*',
          hooks: [
            {
              type: 'command',
              command: 'node /Users/seongho/.loom/hooks/loom-state-bridge.js #loom-state-bridge:v1',
            },
          ],
        },
      ],
      Stop: [
        {
          matcher: '*',
          hooks: [
            {
              type: 'command',
              command: 'node /Users/seongho/.loom/hooks/loom-state-bridge.js #loom-state-bridge:v1',
            },
          ],
        },
      ],
    },
  };

  const { value, changed } = normalizeCodexHooksJson(existing, {
    projectRoot: '/tmp/codex-vscode-terminal-tools',
  });

  assert.equal(changed, true);
  assert.equal(value.hooks.SessionStart.length, 1);
  assert.deepEqual(value.hooks.Stop, existing.hooks.Stop);
  assert.equal(value.hooks.SessionStart[0].hooks.length, 2);
  assert.equal(
    value.hooks.SessionStart[0].hooks[0].command,
    'node /Users/seongho/.loom/hooks/loom-state-bridge.js #loom-state-bridge:v1',
  );
  assert.match(
    value.hooks.SessionStart[0].hooks[1].command,
    /^node '\/tmp\/codex-vscode-terminal-tools\/scripts\/codex-session-registry-hook\.js' #codex-vscode-terminal-tools:session-registry:v1$/,
  );

  assert.deepEqual(
    normalizeCodexHooksJson(value, {
      projectRoot: '/tmp/codex-vscode-terminal-tools',
    }),
    {
      value,
      changed: false,
    },
  );
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
  fs.writeFileSync(
    path.join(home, '.codex', 'hooks.json'),
    `${JSON.stringify(
      normalizeCodexHooksJson({}, { projectRoot }).value,
      null,
      2,
    )}\n`,
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
      codexHooksPath: path.join(home, '.codex', 'hooks.json'),
      extensionPath: extensionDir,
      wrapperPath: path.join(binDir, 'patch-vscode-terminal-order'),
      imeWrapperPath: path.join(binDir, 'patch-vscode-ime-guard'),
      workbenchPath: path.join(tmpDir, 'missing-workbench.js'),
      claudeExtensionsDir: path.join(tmpDir, 'missing-claude'),
    },
    checkManagedCodeApp: false,
    checkWorkbench: false,
    checkClaude: false,
    checkVscodeIcon: false,
    checkDockIcon: false,
    checkWatermark: false,
    checkTerminalTabsLayout: false,
  });

  assert.deepEqual(
    Object.fromEntries(statuses.map((status) => [status.id, status.ok])),
    {
      settings: true,
      keybindings: true,
      zshrc: true,
      codexConfig: true,
      codexHooks: true,
      extension: true,
      wrapper: true,
      imeWrapper: true,
    },
  );
});

test('checkHostConfig includes managed and upstream bundle patch statuses', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-host-config-test-'));
  const paths = {
    home: path.join(tmpDir, 'home'),
    projectRoot: path.join(tmpDir, 'project'),
    userSettingsPath: path.join(tmpDir, 'settings.json'),
    userKeybindingsPath: path.join(tmpDir, 'keybindings.json'),
    zshrcPath: path.join(tmpDir, '.zshrc'),
    codexConfigPath: path.join(tmpDir, 'config.toml'),
    codexHooksPath: path.join(tmpDir, 'hooks.json'),
    extensionPath: path.join(tmpDir, 'extension'),
    wrapperPath: path.join(tmpDir, 'patch-vscode-terminal-order'),
    imeWrapperPath: path.join(tmpDir, 'patch-vscode-ime-guard'),
    workbenchPath: path.join(tmpDir, 'managed-workbench.js'),
    sourceWorkbenchPath: path.join(tmpDir, 'upstream-workbench.js'),
    workbenchCssPath: path.join(tmpDir, 'managed-workbench.css'),
    sourceWorkbenchCssPath: path.join(tmpDir, 'upstream-workbench.css'),
    mainPath: path.join(tmpDir, 'managed-main.js'),
    sourceMainPath: path.join(tmpDir, 'upstream-main.js'),
    vscodeIconSourcePath: path.join(tmpDir, 'warp-glass-sky.icns'),
    vscodeIconPath: path.join(tmpDir, 'managed-Code.icns'),
    sourceVscodeIconPath: path.join(tmpDir, 'upstream-Code.icns'),
    vscodeIconPngSourcePath: path.join(tmpDir, 'warp-glass-sky.png'),
    vscodeDockIconPngPath: path.join(tmpDir, 'managed-dock-icon.png'),
    sourceVscodeDockIconPngPath: path.join(tmpDir, 'upstream-dock-icon.png'),
    vscodeAppPath: path.join(tmpDir, 'Code.app'),
    vscodeSourceAppPath: path.join(tmpDir, 'Visual Studio Code.app'),
    claudeExtensionsDir: path.join(tmpDir, 'claude'),
  };

  const statuses = checkHostConfig({
    paths,
    checkManagedCodeApp: false,
    checkClaude: false,
  });
  const byId = Object.fromEntries(statuses.map((status) => [status.id, status]));

  for (const id of [
    'workbench',
    'upstreamWorkbench',
    'vscodeIcon',
    'upstreamVscodeIcon',
    'dockIcon',
    'upstreamDockIcon',
    'watermark',
    'upstreamWatermark',
    'terminalTabsLayout',
    'upstreamTerminalTabsLayout',
  ]) {
    assert.equal(byId[id].ok, false, id);
  }
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
      'super("TerminalTabsList",e,{getHeight:()=>68,getTemplateId:()=>"terminal.tabs"}',
      'paddingBottom:68,dnd:l.createInstance(pft)',
      '__codexVscodeTerminalTabTitleBreaks',
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

test('checkVscodeIconPatch does not require a Finder custom app icon for signed Code.app', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-host-config-test-'));
  const appBundlePath = path.join(tmpDir, 'Visual Studio Code.app');
  const sourcePath = path.join(tmpDir, 'warp-glass-sky.icns');
  const targetPath = path.join(tmpDir, 'Code.icns');
  fs.mkdirSync(appBundlePath, { recursive: true });
  fs.writeFileSync(sourcePath, Buffer.from('managed-icon'));
  fs.writeFileSync(targetPath, Buffer.from('managed-icon'));

  assert.deepEqual(checkVscodeIconPatch({ sourcePath, targetPath, appBundlePath }), {
    ok: true,
    detail: 'VS Code icon matches managed Warp Glass Sky icon',
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

test('checkVscodeTerminalTabsLayoutPatch reports whether terminal tabs use multi-line wrapping', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-host-config-test-'));
  const cssPath = path.join(tmpDir, 'workbench.desktop.main.css');

  assert.deepEqual(checkVscodeTerminalTabsLayoutPatch(cssPath), {
    ok: false,
    detail: 'VS Code workbench CSS missing',
  });

  fs.writeFileSync(
    cssPath,
    '.monaco-workbench .pane-body.integrated-terminal .tabs-list .terminal-tabs-entry{text-align:center}',
  );
  assert.deepEqual(checkVscodeTerminalTabsLayoutPatch(cssPath), {
    ok: false,
    detail: 'terminal tabs layout patch missing',
  });

  fs.writeFileSync(
    cssPath,
    [
      '.monaco-workbench .pane-body.integrated-terminal .tabs-list .terminal-tabs-entry{text-align:center}',
      '/* codex-vscode-terminal-tools: terminal-tabs-two-line-layout. Reapply with patch-vscode-terminal-tabs-layout. */',
      '.monaco-workbench .pane-body.integrated-terminal .tabs-list .terminal-tabs-entry .monaco-icon-label{height:auto!important;line-height:19px!important;}',
      '.monaco-workbench .pane-body.integrated-terminal .tabs-list .terminal-tabs-entry .monaco-icon-label-container{white-space:normal!important;overflow:visible!important;}',
      '.monaco-workbench .pane-body.integrated-terminal .tabs-list .terminal-tabs-entry .monaco-highlighted-label{white-space:pre-line!important;line-height:19px!important;letter-spacing:0!important;font-kerning:normal!important;overflow:hidden!important;text-overflow:clip!important;overflow-wrap:normal!important;word-break:normal!important;display:-webkit-box!important;-webkit-box-orient:vertical!important;-webkit-line-clamp:3!important;line-clamp:3!important;}',
      '',
    ].join('\n'),
  );
  assert.deepEqual(checkVscodeTerminalTabsLayoutPatch(cssPath), {
    ok: false,
    detail: 'terminal tabs layout patch missing',
  });

  fs.writeFileSync(
    cssPath,
    [
      '.monaco-workbench .pane-body.integrated-terminal .tabs-list .terminal-tabs-entry{text-align:center}',
      '/* codex-vscode-terminal-tools: terminal-tabs-two-line-layout. Reapply with patch-vscode-terminal-tabs-layout. */',
      '.monaco-workbench .pane-body.integrated-terminal .tabs-list .terminal-tabs-entry .monaco-icon-label{height:100%!important;min-height:58px!important;line-height:19px!important;display:flex!important;align-items:center!important;}',
      '.monaco-workbench .pane-body.integrated-terminal .tabs-list .terminal-tabs-entry .monaco-icon-label-container{white-space:normal!important;overflow:visible!important;display:flex!important;flex-direction:column!important;justify-content:center!important;min-height:58px!important;}',
      '.monaco-workbench .pane-body.integrated-terminal .tabs-list .terminal-tabs-entry .monaco-highlighted-label{white-space:pre-line!important;line-height:19px!important;letter-spacing:0!important;font-kerning:normal!important;overflow:hidden!important;text-overflow:clip!important;overflow-wrap:normal!important;word-break:normal!important;display:-webkit-box!important;-webkit-box-orient:vertical!important;-webkit-line-clamp:3!important;line-clamp:3!important;}',
      '',
    ].join('\n'),
  );
  assert.deepEqual(checkVscodeTerminalTabsLayoutPatch(cssPath), {
    ok: true,
    detail: 'terminal tabs use multi-line wrapping layout',
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
