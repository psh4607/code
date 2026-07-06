const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  checkManagedCodeApp: checkManagedCodeAppStatus,
  createManagedCodeAppPaths,
  ensureManagedCodeApp: ensureManagedCodeAppDefault,
} = require('./managedCodeApp');

const MANAGED_APPLY_TO_ALL_PROFILES = [
  'terminal.integrated.splitCwd',
  'terminal.integrated.tabs.title',
  'terminal.integrated.tabs.description',
  'terminal.integrated.tabs.focusMode',
  'terminal.integrated.enablePersistentSessions',
  'terminal.integrated.persistentSessionReviveProcess',
  'terminal.integrated.commandsToSkipShell',
  'window.commandCenter',
  'window.title',
  'workbench.browser.openLocalhostLinks',
  'workbench.secondarySideBar.defaultVisibility',
];

const MANAGED_SETTINGS = {
  'update.mode': 'none',
  'window.commandCenter': false,
  'window.title': '${codexTitlebarInfo}',
  'workbench.browser.openLocalhostLinks': false,
  'terminal.integrated.tabs.title': '${sequence}',
  'terminal.integrated.tabs.description': '',
  'terminal.integrated.tabs.focusMode': 'singleClick',
  'terminal.integrated.enableImages': true,
  'terminal.integrated.enableKittyKeyboardProtocol': false,
  'terminal.integrated.enablePersistentSessions': true,
  'terminal.integrated.persistentSessionReviveProcess': 'onExitAndWindowClose',
  'terminal.integrated.splitCwd': 'inherited',
  'workbench.secondarySideBar.defaultVisibility': 'hidden',
  'editor.cursorStyle': 'block',
  'terminal.integrated.cursorStyle': 'block',
};

const MANAGED_COMMANDS_TO_SKIP_SHELL = [];
const LEGACY_MANAGED_COMMANDS_TO_SKIP_SHELL = ['workbench.action.terminal.sendSequence'];

const MANAGED_COLOR_CUSTOMIZATIONS = {
  'editorCursor.foreground': '#E9072D',
  'editorCursor.background': '#FFFFFF',
  'editor.compositionBorder': '#E9072D',
  'terminalCursor.foreground': '#E9072D',
  'terminalCursor.background': '#FFFFFF',
};

const CODEX_TERMINAL_TITLE_THREAD_ID = 'thread-id';
const DEFAULT_CODEX_TERMINAL_TITLE = [
  'activity',
  'project-name',
  'thread-title',
  'fast-mode',
];
const CODEX_SESSION_REGISTRY_HOOK_MARKER =
  '#codex-vscode-terminal-tools:session-registry:v1';
const CODEX_SESSION_REGISTRY_HOOK_EVENT = 'SessionStart';
const CODEX_AGENT_NOTIFICATION_HOOK_MARKER =
  '#codex-vscode-terminal-tools:agent-notifications:v1';
const CODEX_AGENT_NOTIFICATION_HOOK_EVENTS = [
  'SessionStart',
  'UserPromptSubmit',
  'PermissionRequest',
  'PreToolUse',
  'PostToolUse',
  'Stop',
];

const MANAGED_SIDEBAR_VIEW_TOGGLES = [
  {
    key: 'cmd+1',
    command: 'workbench.view.explorer',
    activeViewlet: 'workbench.view.explorer',
    openWhen: 'viewContainer.workbench.view.explorer.enabled',
    defaultEditorGroupCommand: 'workbench.action.focusFirstEditorGroup',
  },
  {
    key: 'cmd+2',
    command: 'workbench.view.scm',
    activeViewlet: 'workbench.view.scm',
    openWhen: 'workbench.scm.active',
    defaultEditorGroupCommand: 'workbench.action.focusSecondEditorGroup',
  },
  {
    key: 'cmd+3',
    command: 'workbench.view.extension.github-pull-requests',
    activeViewlet: 'workbench.view.extension.github-pull-requests',
    defaultEditorGroupCommand: 'workbench.action.focusThirdEditorGroup',
  },
  {
    key: 'cmd+4',
    command: 'workbench.view.extension.claude-sidebar-secondary',
    activeViewlet: 'workbench.view.extension.claude-sidebar-secondary',
    openWhen: 'viewContainer.workbench.view.extension.claude-sidebar-secondary.enabled',
    defaultEditorGroupCommand: 'workbench.action.focusFourthEditorGroup',
  },
];

function joinWhenClauses(...clauses) {
  return clauses.filter(Boolean).join(' && ');
}

function createManagedSidebarViewKeybindings() {
  return MANAGED_SIDEBAR_VIEW_TOGGLES.flatMap(
    ({ key, command, activeViewlet, openWhen, defaultEditorGroupCommand }) => [
      {
        key,
        command: 'workbench.action.toggleSidebarVisibility',
        when: `activeViewlet == '${activeViewlet}'`,
      },
      {
        key,
        command,
        when: joinWhenClauses(openWhen, `activeViewlet != '${activeViewlet}'`),
      },
      {
        key,
        command: `-${defaultEditorGroupCommand}`,
      },
    ],
  );
}

const MANAGED_KEYBINDINGS = [
  {
    key: 'cmd+t',
    command: 'codexTerminal.newFromActiveCwd',
    when: 'terminalProcessSupported || terminalWebExtensionContributedProfile',
  },
  {
    key: 'cmd+w',
    command: 'codexTerminal.detachWithTtl',
    when: 'terminal.active && terminalFocus',
  },
  {
    key: 'cmd+r',
    command: 'codexTerminal.renameThread',
    when: 'terminalFocus',
  },
  {
    key: 'cmd+v',
    command: 'codexTerminal.smartPaste',
    when: 'terminalFocus',
  },
  {
    key: 'cmd+shift+t',
    command: '-workbench.action.reopenClosedEditor',
  },
  {
    key: 'cmd+shift+t',
    command: 'codexTerminal.attachDetachedSession',
    when: 'terminalProcessSupported',
  },
  ...createManagedSidebarViewKeybindings(),
];

const MANAGED_KEYBINDING_REPLACEMENTS = [
  ...MANAGED_KEYBINDINGS.map(({ key, when }) => ({ key, when })),
  {
    key: 'shift+enter',
    when: 'terminalFocus',
  },
  {
    key: 'cmd+4',
    when: 'viewContainer.workbench.view.extension.claude-sidebar-secondary.enabled',
  },
];

const ZSH_CWD_TITLE_SNIPPET = [
  '# BEGIN codex-vscode-terminal-tools: vscode-cwd-title',
  '# VS Code terminal tab title: show cwd as ~/...',
  '_vscode_cwd_title() {',
  '  [[ "$TERM_PROGRAM" == "vscode" ]] || return',
  '',
  '  local title="${PWD/#$HOME/~}"',
  "  printf '\\033]0;%s\\007' \"$title\"",
  '}',
  '',
  'autoload -Uz add-zsh-hook',
  'add-zsh-hook -d precmd _vscode_cwd_title 2>/dev/null',
  'add-zsh-hook -d chpwd _vscode_cwd_title 2>/dev/null',
  'add-zsh-hook precmd _vscode_cwd_title',
  'add-zsh-hook chpwd _vscode_cwd_title',
  '# END codex-vscode-terminal-tools: vscode-cwd-title',
  '',
].join('\n');

const MANAGED_ZSH_BLOCK_RE =
  /# BEGIN codex-vscode-terminal-tools: vscode-cwd-title\n[\s\S]*?# END codex-vscode-terminal-tools: vscode-cwd-title\n?/;

const LEGACY_ZSH_BLOCK_RE =
  /# VS Code terminal tab title: show cwd as ~\/\.\.\.\n_vscode_cwd_title\(\) \{\n[\s\S]*?add-zsh-hook chpwd _vscode_cwd_title\n?/;

const TERMINAL_ORDER_MARKER = 'this.groups.splice(Math.min(o+1,this.groups.length),0,n)';
const TERMINAL_COLOR_MARKER = 'codexTerminal.rememberCwdColor';
const TERMINAL_COLOR_ARGUMENT_MARKER = 'typeof t=="string"||t===null';
const TERMINAL_EMPTY_AREA_MARKER =
  'this._terminalGroupService.instances.length-1,I=this._terminalGroupService.instances[S]';
const TERMINAL_EMPTY_NATIVE_MARKER =
  'this._register($(this._tabListDomElement,"mousedown",async o=>{if(o.button!==0)return';
const TERMINAL_TABS_TWO_LINE_HEIGHT_MARKER =
  'super("TerminalTabsList",e,{getHeight:()=>68,getTemplateId:()=>"terminal.tabs"}';
const TERMINAL_TABS_TWO_LINE_PADDING_MARKER = 'paddingBottom:68,dnd:l.createInstance(pft)';
const TERMINAL_TABS_TITLE_BREAKS_MARKER = '__codexVscodeTerminalTabTitleBreaks';
const TERMINAL_ATTACH_BY_PID_MARKER = 'codex-vscode-terminal-tools: terminal-attach-by-pid';
const IME_GUARD_MARKER =
  '/* Codex VS Code IME guard patch. Reapply with patch-vscode-ime-guard. */';
const IME_EARLY_CAPTURE_MARKER = 'addEventListener("keydown",p,!0)';
const IME_RECENT_COMPOSITION_MARKER = 'Date.now()-m<180';
const IME_TERMINAL_TARGET_MARKER = 'xterm-helper-textarea';
const IME_NATIVE_LINEBREAK_MARKER = 'insertLineBreak';
const IME_NATIVE_PARAGRAPH_MARKER = 'insertParagraph';
const IME_NATIVE_CR_MARKER = 'a?.data==="\\r"';
const IME_NATIVE_KEYPRESS_MARKER = 'addEventListener("keypress",I,!0)';
const IME_TERMINAL_COMMIT_DEFERRAL_MARKER = 'Math.max(120,360-(Date.now()-m))';
const IME_TERMINAL_NATIVE_COMMIT_MARKER = 'function p(a){u(a)&&!a.defaultPrevented&&(h=Date.now()+1400)}';
const IME_ACTIVITY_QUIET_WINDOW_MARKER = 'addEventListener("compositionupdate",y,!0)';
const IME_TERMINAL_KEY_HANDLER_MARKER = 'globalThis.__codexVscodeImeGuard?.suppressTerminalKey?.(n,';
const IME_TERMINAL_DIRECT_SEQUENCE_MARKER = 'this.sendText("\\x1B\\r",!1)';
const IME_TERMINAL_DIRECT_SEQUENCE_DEDUPE_MARKER = 'C==="\\x1B\\r"&&S-P<80';
const IME_TERMINAL_SEQUENCE_QUEUE_MARKER = 'queueTerminalSequence';
const IME_TERMINAL_LEGACY_LF_CONSUME_MARKER =
  'if(a==="\\x1B\\n")return C=a,P=S,h=S+1400,!0';
const IME_TERMINAL_CR_QUEUE_MARKER = 'queued terminal CR sequence failed';
const IME_TERMINAL_SEQUENCE_DEDUPE_MARKER = 'a===C&&S-P<80';
const IME_TERMINAL_SEND_SEQUENCE_MARKER =
  'globalThis.__codexVscodeImeGuard?.queueTerminalSequence?.(m,()=>s.sendText(m,!1))??s.sendText(m,!1)';
const IME_DISPATCH_MARKER =
  '_dispatch(e,t){let o=this.resolveKeyboardEvent(e),n=globalThis.__codexVscodeImeGuard?.defer?.(e,t,()=>this._doDispatch(o,t,!1));return n!==void 0?n:this._doDispatch(o,t,!1)}';
const WATERMARK_PATCH_MARKER = 'codex-vscode-terminal-tools: hide-empty-editor-watermark';
const WATERMARK_PATCH_RULE =
  '.monaco-workbench .part.editor>.content .editor-group-container>.editor-group-watermark-wrapper .editor-group-watermark .letterpress{display:none!important;}';
const OPAQUE_OVERLAYS_PATCH_MARKER = 'codex-vscode-terminal-tools: opaque-overlays';
const OPAQUE_OVERLAYS_PATCH_RULES = [
  '.quick-input-widget{background:var(--vscode-quickInput-background,var(--vscode-editorWidget-background,#252526))!important;background-image:none!important;backdrop-filter:none!important;opacity:1!important;}',
  '.quick-input-widget .quick-input-list .monaco-list{background:var(--vscode-quickInput-background,var(--vscode-editorWidget-background,#252526))!important;}',
  '.monaco-dialog-box{background:var(--vscode-editorWidget-background,#252526)!important;background-image:none!important;backdrop-filter:none!important;opacity:1!important;}',
];
const TITLEBAR_CENTER_PATCH_MARKER = 'codex-vscode-terminal-tools: hide-titlebar-center';
const TITLEBAR_CENTER_PATCH_RULES = [
  '.monaco-workbench .part.titlebar>.titlebar-container>.titlebar-center>.window-title>.command-center{display:none!important;}',
  '.monaco-workbench .part.titlebar .agent-status-container{display:none!important;}',
];
const TERMINAL_TABS_LAYOUT_PATCH_MARKER =
  'codex-vscode-terminal-tools: terminal-tabs-two-line-layout';
const TERMINAL_TABS_LAYOUT_PATCH_RULES = [
  '.monaco-workbench .pane-body.integrated-terminal .tabs-list .terminal-tabs-entry .monaco-icon-label{height:100%!important;min-height:58px!important;line-height:19px!important;display:flex!important;align-items:center!important;position:relative!important;}',
  '.monaco-workbench .pane-body.integrated-terminal .tabs-list .terminal-tabs-entry .monaco-icon-label-container{white-space:normal!important;overflow:visible!important;display:flex!important;flex-direction:column!important;justify-content:center!important;min-height:58px!important;padding-left:38px!important;}',
  '.monaco-workbench .pane-body.integrated-terminal .tabs-list .terminal-tabs-entry .monaco-highlighted-label .codicon:first-child{position:absolute!important;left:0!important;top:50%!important;transform:translateY(-50%)!important;font-size:24px!important;width:28px!important;height:38px!important;line-height:38px!important;text-align:center!important;}',
  '.monaco-workbench .pane-body.integrated-terminal .tabs-list .terminal-tabs-entry .monaco-highlighted-label{white-space:pre-line!important;line-height:19px!important;letter-spacing:0!important;font-kerning:normal!important;overflow:hidden!important;text-overflow:clip!important;overflow-wrap:normal!important;word-break:normal!important;display:-webkit-box!important;-webkit-box-orient:vertical!important;-webkit-line-clamp:3!important;line-clamp:3!important;}',
];
const DOCK_ICON_PATCH_MARKER = 'Codex VS Code Dock icon patch';

function defaultProjectRoot() {
  return path.resolve(__dirname, '..');
}

function createDefaultPaths({
  home = os.homedir(),
  projectRoot = defaultProjectRoot(),
  applicationsDir = '/Applications',
  vscodeSourceAppPath = process.env.VSCODE_SOURCE_APP_PATH,
  vscodeAppPath = process.env.VSCODE_APP_PATH,
} = {}) {
  const managedCodeAppPaths = createManagedCodeAppPaths({
    applicationsDir,
    sourceAppPath: vscodeSourceAppPath,
    managedAppPath: vscodeAppPath,
  });
  const managedAppPath = managedCodeAppPaths.managedAppPath;
  const sourceAppPath = managedCodeAppPaths.sourceAppPath;

  return {
    home,
    projectRoot,
    applicationsDir,
    vscodeSourceAppPath: sourceAppPath,
    vscodeAppPath: managedAppPath,
    managedCodeAppPaths,
    userSettingsPath: path.join(home, 'Library', 'Application Support', 'Code', 'User', 'settings.json'),
    userKeybindingsPath: path.join(
      home,
      'Library',
      'Application Support',
      'Code',
      'User',
      'keybindings.json',
    ),
    codexConfigPath: path.join(home, '.codex', 'config.toml'),
    codexHooksPath: path.join(home, '.codex', 'hooks.json'),
    zshrcPath: path.join(home, '.zshrc'),
    extensionPath: path.join(
      home,
      '.vscode',
      'extensions',
      'seongho.codex-vscode-terminal-tools-0.0.1',
    ),
    wrapperPath: path.join(home, '.local', 'bin', 'patch-vscode-terminal-order'),
    imeWrapperPath: path.join(home, '.local', 'bin', 'patch-vscode-ime-guard'),
    workbenchPath:
      process.env.VSCODE_WORKBENCH_MAIN ||
      path.join(managedAppPath, 'Contents', 'Resources', 'app', 'out', 'vs', 'workbench', 'workbench.desktop.main.js'),
    sourceWorkbenchPath:
      path.join(sourceAppPath, 'Contents', 'Resources', 'app', 'out', 'vs', 'workbench', 'workbench.desktop.main.js'),
    workbenchCssPath:
      process.env.VSCODE_WORKBENCH_CSS ||
      path.join(managedAppPath, 'Contents', 'Resources', 'app', 'out', 'vs', 'workbench', 'workbench.desktop.main.css'),
    sourceWorkbenchCssPath:
      path.join(sourceAppPath, 'Contents', 'Resources', 'app', 'out', 'vs', 'workbench', 'workbench.desktop.main.css'),
    mainPath:
      process.env.VSCODE_MAIN_PATH ||
      path.join(managedAppPath, 'Contents', 'Resources', 'app', 'out', 'main.js'),
    sourceMainPath:
      path.join(sourceAppPath, 'Contents', 'Resources', 'app', 'out', 'main.js'),
    claudeExtensionsDir: path.join(home, '.vscode', 'extensions'),
    vscodeIconSourcePath:
      process.env.CODEX_VSCODE_ICON_SOURCE || path.join(projectRoot, 'assets', 'warp-glass-sky.icns'),
    vscodeIconPngSourcePath:
      process.env.CODEX_VSCODE_ICON_PNG_SOURCE || path.join(projectRoot, 'assets', 'warp-glass-sky.png'),
    vscodeIconPath:
      process.env.VSCODE_ICON_PATH ||
      path.join(managedAppPath, 'Contents', 'Resources', 'Code.icns'),
    sourceVscodeIconPath:
      path.join(sourceAppPath, 'Contents', 'Resources', 'Code.icns'),
    vscodeDockIconPngPath:
      process.env.VSCODE_DOCK_ICON_PNG_PATH ||
      path.join(managedAppPath, 'Contents', 'Resources', 'codex-warp-glass-sky.png'),
    sourceVscodeDockIconPngPath:
      path.join(sourceAppPath, 'Contents', 'Resources', 'codex-warp-glass-sky.png'),
  };
}

function stripJsoncComments(text) {
  let result = '';
  let inString = false;
  let quote = '';
  let escaped = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (inString) {
      result += char;
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === quote) {
        inString = false;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      inString = true;
      quote = char;
      result += char;
      continue;
    }

    if (char === '/' && next === '/') {
      while (index < text.length && text[index] !== '\n') {
        index += 1;
      }
      result += '\n';
      continue;
    }

    result += char;
  }

  return result;
}

function removeTrailingCommas(text) {
  let result = '';
  let inString = false;
  let quote = '';
  let escaped = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (inString) {
      result += char;
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === quote) {
        inString = false;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      inString = true;
      quote = char;
      result += char;
      continue;
    }

    if (char === ',') {
      let cursor = index + 1;
      while (/\s/.test(text[cursor] || '')) {
        cursor += 1;
      }
      if (text[cursor] === '}' || text[cursor] === ']') {
        continue;
      }
    }

    result += char;
  }

  return result;
}

function parseJsonc(text) {
  const stripped = removeTrailingCommas(stripJsoncComments(text));
  return JSON.parse(stripped);
}

function readJsoncFile(filePath, fallback) {
  if (!fs.existsSync(filePath)) {
    return fallback;
  }

  return parseJsonc(fs.readFileSync(filePath, 'utf8'));
}

function stringifyJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function deepEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function normalizeSettings(settings) {
  const value = { ...settings };

  for (const [key, settingValue] of Object.entries(MANAGED_SETTINGS)) {
    value[key] = settingValue;
  }

  value['workbench.colorCustomizations'] = {
    ...(value['workbench.colorCustomizations'] || {}),
    ...MANAGED_COLOR_CUSTOMIZATIONS,
  };

  const commandsToSkipShell = Array.isArray(value['terminal.integrated.commandsToSkipShell'])
    ? value['terminal.integrated.commandsToSkipShell'].filter(
        (command) => !LEGACY_MANAGED_COMMANDS_TO_SKIP_SHELL.includes(command),
      )
    : [];
  for (const command of MANAGED_COMMANDS_TO_SKIP_SHELL) {
    if (!commandsToSkipShell.includes(command)) {
      commandsToSkipShell.push(command);
    }
  }
  value['terminal.integrated.commandsToSkipShell'] = commandsToSkipShell;

  const applyToAllProfiles = Array.isArray(value['workbench.settings.applyToAllProfiles'])
    ? [...value['workbench.settings.applyToAllProfiles']]
    : [];
  for (const setting of MANAGED_APPLY_TO_ALL_PROFILES) {
    if (!applyToAllProfiles.includes(setting)) {
      applyToAllProfiles.push(setting);
    }
  }
  value['workbench.settings.applyToAllProfiles'] = applyToAllProfiles;

  return {
    value,
    changed: !deepEqual(settings, value),
  };
}

function sameKeybinding(left, right) {
  return (
    left &&
    right &&
    left.key === right.key &&
    left.command === right.command &&
    left.when === right.when &&
    deepEqual(left.args, right.args)
  );
}

function isManagedKeybindingSlot(entry) {
  return MANAGED_KEYBINDING_REPLACEMENTS.some(
    (replacement) => entry.key === replacement.key && entry.when === replacement.when,
  );
}

function normalizeKeybindings(keybindings) {
  const source = Array.isArray(keybindings) ? keybindings : [];
  const pending = [...MANAGED_KEYBINDINGS];
  const value = [];

  for (const entry of source) {
    if (!isManagedKeybindingSlot(entry)) {
      value.push(entry);
      continue;
    }

    const managedIndex = pending.findIndex(
      (managed) => managed.key === entry.key && managed.when === entry.when,
    );
    if (managedIndex === -1) {
      continue;
    }

    value.push(pending[managedIndex]);
    pending.splice(managedIndex, 1);
  }

  value.push(...pending);

  const changed =
    source.length !== value.length ||
    value.some((entry, index) => !sameKeybinding(entry, source[index]));

  return {
    value,
    changed,
  };
}

function normalizeZshrc(source) {
  let value = source || '';

  if (MANAGED_ZSH_BLOCK_RE.test(value)) {
    value = value.replace(MANAGED_ZSH_BLOCK_RE, ZSH_CWD_TITLE_SNIPPET);
  } else if (LEGACY_ZSH_BLOCK_RE.test(value)) {
    value = value.replace(LEGACY_ZSH_BLOCK_RE, ZSH_CWD_TITLE_SNIPPET);
  } else if (value.includes('source $ZSH/oh-my-zsh.sh')) {
    value = value.replace('source $ZSH/oh-my-zsh.sh', `source $ZSH/oh-my-zsh.sh\n\n${ZSH_CWD_TITLE_SNIPPET.trimEnd()}`);
    if (!value.endsWith('\n')) {
      value += '\n';
    }
  } else {
    value = `${value.replace(/\s*$/, '\n\n')}${ZSH_CWD_TITLE_SNIPPET}`;
  }

  return {
    value,
    changed: value !== source,
  };
}

function parseTomlStringArray(value) {
  const items = [];
  const itemRe = /"((?:\\.|[^"\\])*)"/g;
  let match;
  while ((match = itemRe.exec(value))) {
    try {
      items.push(JSON.parse(`"${match[1]}"`));
    } catch {
      return [];
    }
  }
  return items;
}

function stringifyTomlStringArray(values) {
  return `[${values.map((value) => JSON.stringify(value)).join(', ')}]`;
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

function normalizeCodexTerminalTitleComponents(components) {
  const normalized = components.filter(
    (component) =>
      typeof component === 'string' &&
      component &&
      component !== CODEX_TERMINAL_TITLE_THREAD_ID,
  );
  const value = normalized.length ? [...normalized] : [...DEFAULT_CODEX_TERMINAL_TITLE];

  return value;
}

function normalizeCodexConfigToml(source = '') {
  const terminalTitleRe = /^terminal_title\s*=\s*(\[[^\n]*\])\s*$/m;
  const statusLineRe = /^status_line\s*=\s*(\[[^\n]*\])\s*$/m;
  const match = source.match(terminalTitleRe);
  const components = match ? parseTomlStringArray(match[1]) : DEFAULT_CODEX_TERMINAL_TITLE;
  const terminalTitleLine = `terminal_title = ${stringifyTomlStringArray(
    normalizeCodexTerminalTitleComponents(components),
  )}`;
  let value;

  if (match) {
    value = source.replace(terminalTitleRe, terminalTitleLine);
  } else {
    value = `${source.replace(/\s*$/, '\n\n')}${terminalTitleLine}\n`;
  }

  const statusLineMatch = value.match(statusLineRe);
  if (statusLineMatch) {
    const statusLineComponents = parseTomlStringArray(statusLineMatch[1]);
    const normalizedStatusLineComponents = statusLineComponents.filter(
      (component) => component !== CODEX_TERMINAL_TITLE_THREAD_ID,
    );

    if (normalizedStatusLineComponents.length !== statusLineComponents.length) {
      value = value.replace(
        statusLineRe,
        `status_line = ${stringifyTomlStringArray(normalizedStatusLineComponents)}`,
      );
    }
  }

  return {
    value,
    changed: value !== source,
  };
}

function managedCodexSessionRegistryHookCommand(projectRoot) {
  return [
    'node',
    shellQuote(path.join(projectRoot, 'scripts', 'codex-session-registry-hook.js')),
    CODEX_SESSION_REGISTRY_HOOK_MARKER,
  ].join(' ');
}

function managedCodexNotificationHookCommand(projectRoot) {
  return [
    'node',
    shellQuote(path.join(projectRoot, 'scripts', 'codex-notification-hook.js')),
    CODEX_AGENT_NOTIFICATION_HOOK_MARKER,
  ].join(' ');
}

function isManagedCodexSessionRegistryHook(hook) {
  return (
    hook &&
    typeof hook.command === 'string' &&
    hook.command.includes(CODEX_SESSION_REGISTRY_HOOK_MARKER)
  );
}

function isManagedCodexNotificationHook(hook) {
  return (
    hook &&
    typeof hook.command === 'string' &&
    hook.command.includes(CODEX_AGENT_NOTIFICATION_HOOK_MARKER)
  );
}

function cloneHookGroupWithoutManagedHook(group) {
  const nextGroup = {
    ...(group && typeof group === 'object' ? group : {}),
  };
  const hooks = Array.isArray(nextGroup.hooks) ? nextGroup.hooks : [];
  nextGroup.hooks = hooks.filter(
    (hook) =>
      !isManagedCodexSessionRegistryHook(hook) &&
      !isManagedCodexNotificationHook(hook),
  );
  return nextGroup;
}

function appendManagedHook(hooks, eventName, managedHook) {
  const groups = Array.isArray(hooks[eventName]) ? hooks[eventName] : [];
  const wildcardGroup = groups.find(
    (group) => group && typeof group === 'object' && group.matcher === '*',
  );

  if (wildcardGroup) {
    wildcardGroup.hooks = Array.isArray(wildcardGroup.hooks) ? wildcardGroup.hooks : [];
    wildcardGroup.hooks.push(managedHook);
  } else {
    groups.push({
      matcher: '*',
      hooks: [managedHook],
    });
  }

  hooks[eventName] = groups;
}

function normalizeCodexHooksJson(source = {}, { projectRoot = defaultProjectRoot() } = {}) {
  const value = source && typeof source === 'object' && !Array.isArray(source) ? { ...source } : {};
  const sourceHooks = value.hooks && typeof value.hooks === 'object' && !Array.isArray(value.hooks)
    ? value.hooks
    : {};
  const hooks = {};

  for (const [eventName, groups] of Object.entries(sourceHooks)) {
    hooks[eventName] = Array.isArray(groups)
      ? groups.map(cloneHookGroupWithoutManagedHook)
      : groups;
  }

  const managedHook = {
    type: 'command',
    command: managedCodexSessionRegistryHookCommand(projectRoot),
  };
  appendManagedHook(hooks, CODEX_SESSION_REGISTRY_HOOK_EVENT, managedHook);

  const managedNotificationHookCommand = managedCodexNotificationHookCommand(projectRoot);
  for (const eventName of CODEX_AGENT_NOTIFICATION_HOOK_EVENTS) {
    appendManagedHook(hooks, eventName, {
      type: 'command',
      command: managedNotificationHookCommand,
    });
  }
  value.hooks = hooks;

  return {
    value,
    changed: !deepEqual(source, value),
  };
}

function expectedWrapperSource(projectRoot, npmScript = 'patch') {
  return [
    '#!/bin/sh',
    'set -eu',
    '',
    `cd ${projectRoot}`,
    `exec npm run ${npmScript}`,
    '',
  ].join('\n');
}

function ensurePatchWrapper({ wrapperPath, projectRoot, npmScript }) {
  const expected = expectedWrapperSource(projectRoot, npmScript);
  const current = fs.existsSync(wrapperPath) ? fs.readFileSync(wrapperPath, 'utf8') : undefined;

  if (current === expected) {
    return { changed: false };
  }

  fs.mkdirSync(path.dirname(wrapperPath), { recursive: true });
  fs.writeFileSync(wrapperPath, expected, { mode: 0o755 });
  fs.chmodSync(wrapperPath, 0o755);

  return { changed: true };
}

function ensureGlobalPatchWrapper({ wrapperPath, projectRoot }) {
  return ensurePatchWrapper({ wrapperPath, projectRoot, npmScript: 'patch' });
}

function ensureImeGuardPatchWrapper({ wrapperPath, projectRoot }) {
  return ensurePatchWrapper({ wrapperPath, projectRoot, npmScript: 'patch:vscode-ime-guard' });
}

function ensureExtensionLink({ extensionPath, projectRoot }) {
  if (fs.existsSync(extensionPath)) {
    const realPath = fs.realpathSync(extensionPath);
    if (realPath === fs.realpathSync(projectRoot)) {
      return { changed: false };
    }
    throw new Error(`Extension path already exists and does not point to ${projectRoot}: ${extensionPath}`);
  }

  fs.mkdirSync(path.dirname(extensionPath), { recursive: true });
  fs.symlinkSync(projectRoot, extensionPath);
  return { changed: true };
}

function writeIfChanged(filePath, nextSource) {
  const current = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : undefined;
  if (current === nextSource) {
    return { changed: false };
  }

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, nextSource);
  return { changed: true };
}

function applyHostConfig({
  paths = createDefaultPaths(),
  ensureManagedCodeApp = ensureManagedCodeAppDefault,
} = {}) {
  const managedCodeApp = ensureManagedCodeApp({ paths: paths.managedCodeAppPaths });
  const settings = normalizeSettings(readJsoncFile(paths.userSettingsPath, {}));
  const keybindings = normalizeKeybindings(readJsoncFile(paths.userKeybindingsPath, []));
  const zshrc = normalizeZshrc(fs.existsSync(paths.zshrcPath) ? fs.readFileSync(paths.zshrcPath, 'utf8') : '');
  const codexConfig = normalizeCodexConfigToml(
    fs.existsSync(paths.codexConfigPath) ? fs.readFileSync(paths.codexConfigPath, 'utf8') : '',
  );
  const codexHooks = normalizeCodexHooksJson(readJsoncFile(paths.codexHooksPath, {}), {
    projectRoot: paths.projectRoot,
  });
  const wrapper = ensureGlobalPatchWrapper({
    wrapperPath: paths.wrapperPath,
    projectRoot: paths.projectRoot,
  });
  const imeWrapper = ensureImeGuardPatchWrapper({
    wrapperPath: paths.imeWrapperPath,
    projectRoot: paths.projectRoot,
  });
  const extension = ensureExtensionLink({
    extensionPath: paths.extensionPath,
    projectRoot: paths.projectRoot,
  });

  const results = [
    {
      id: 'managedCodeApp',
      changed: managedCodeApp.changed,
      detail: managedCodeApp.detail || managedCodeApp.reason,
    },
    {
      id: 'settings',
      ...(settings.changed
        ? writeIfChanged(paths.userSettingsPath, stringifyJson(settings.value))
        : { changed: false }),
    },
    {
      id: 'keybindings',
      ...(keybindings.changed
        ? writeIfChanged(paths.userKeybindingsPath, stringifyJson(keybindings.value))
        : { changed: false }),
    },
    {
      id: 'zshrc',
      ...(zshrc.changed ? writeIfChanged(paths.zshrcPath, zshrc.value) : { changed: false }),
    },
    {
      id: 'codexConfig',
      ...(codexConfig.changed
        ? writeIfChanged(paths.codexConfigPath, codexConfig.value)
        : { changed: false }),
    },
    {
      id: 'codexHooks',
      ...(codexHooks.changed
        ? writeIfChanged(paths.codexHooksPath, stringifyJson(codexHooks.value))
        : { changed: false }),
    },
    {
      id: 'wrapper',
      ...wrapper,
    },
    {
      id: 'imeWrapper',
      ...imeWrapper,
    },
    {
      id: 'extension',
      ...extension,
    },
  ];

  return results;
}

function hasExpectedSettings(settings) {
  const normalized = normalizeSettings(settings).value;
  return deepEqual(settings, normalized);
}

function hasExpectedKeybindings(keybindings) {
  return MANAGED_KEYBINDINGS.every((managed) =>
    keybindings.some((entry) => sameKeybinding(entry, managed)),
  );
}

function hasExpectedZshrc(source) {
  return (
    source.includes('# BEGIN codex-vscode-terminal-tools: vscode-cwd-title') ||
    (source.includes('_vscode_cwd_title()') &&
      source.includes('add-zsh-hook -d precmd _vscode_cwd_title') &&
      source.includes('add-zsh-hook chpwd _vscode_cwd_title'))
  );
}

function hasExpectedCodexConfig(source) {
  if (typeof source !== 'string') {
    return false;
  }

  const match = source.match(/^terminal_title\s*=\s*(\[[^\n]*\])\s*$/m);
  if (!match) {
    return false;
  }

  return !parseTomlStringArray(match[1]).includes(CODEX_TERMINAL_TITLE_THREAD_ID);
}

function hasExpectedCodexHooks(source, { projectRoot = defaultProjectRoot() } = {}) {
  if (!source || typeof source !== 'object') {
    return false;
  }

  return !normalizeCodexHooksJson(source, { projectRoot }).changed;
}

function hasExpectedWrapper(wrapperPath, projectRoot) {
  return fs.existsSync(wrapperPath) && fs.readFileSync(wrapperPath, 'utf8') === expectedWrapperSource(projectRoot);
}

function hasExpectedImeWrapper(wrapperPath, projectRoot) {
  return (
    fs.existsSync(wrapperPath) &&
    fs.readFileSync(wrapperPath, 'utf8') === expectedWrapperSource(projectRoot, 'patch:vscode-ime-guard')
  );
}

function hasExpectedExtension(extensionPath, projectRoot) {
  return fs.existsSync(extensionPath) && fs.realpathSync(extensionPath) === fs.realpathSync(projectRoot);
}

function checkWorkbenchPatches(workbenchPath) {
  if (!fs.existsSync(workbenchPath)) {
    return { ok: false, detail: 'workbench bundle missing' };
  }

  const source = fs.readFileSync(workbenchPath, 'utf8');
  const missing = [];

  for (const [name, marker] of [
    ['terminal order', TERMINAL_ORDER_MARKER],
    ['terminal color remember', TERMINAL_COLOR_MARKER],
    ['terminal color argument', TERMINAL_COLOR_ARGUMENT_MARKER],
    ['terminal empty-area focus', TERMINAL_EMPTY_AREA_MARKER],
    ['terminal native empty-area focus', TERMINAL_EMPTY_NATIVE_MARKER],
    ['terminal multi-line tab height', TERMINAL_TABS_TWO_LINE_HEIGHT_MARKER],
    ['terminal multi-line tab padding', TERMINAL_TABS_TWO_LINE_PADDING_MARKER],
    ['terminal pipe title breaks', TERMINAL_TABS_TITLE_BREAKS_MARKER],
    ['terminal attach by pid', TERMINAL_ATTACH_BY_PID_MARKER],
    ['IME guard helper', IME_GUARD_MARKER],
    ['IME early-capture hook', IME_EARLY_CAPTURE_MARKER],
    ['IME recent-composition defer', IME_RECENT_COMPOSITION_MARKER],
    ['IME terminal-target defer', IME_TERMINAL_TARGET_MARKER],
    ['IME native line-break suppressor', IME_NATIVE_LINEBREAK_MARKER],
    ['IME native paragraph suppressor', IME_NATIVE_PARAGRAPH_MARKER],
    ['IME native CR suppressor', IME_NATIVE_CR_MARKER],
    ['IME native keypress suppressor', IME_NATIVE_KEYPRESS_MARKER],
    ['IME terminal commit deferral', IME_TERMINAL_COMMIT_DEFERRAL_MARKER],
    ['IME terminal native commit preservation', IME_TERMINAL_NATIVE_COMMIT_MARKER],
    ['IME activity quiet-window tracking', IME_ACTIVITY_QUIET_WINDOW_MARKER],
    ['IME terminal key handler', IME_TERMINAL_KEY_HANDLER_MARKER],
    ['IME terminal direct sequence emitter', IME_TERMINAL_DIRECT_SEQUENCE_MARKER],
    ['IME terminal direct sequence dedupe', IME_TERMINAL_DIRECT_SEQUENCE_DEDUPE_MARKER],
    ['IME terminal sequence queue', IME_TERMINAL_SEQUENCE_QUEUE_MARKER],
    ['IME terminal legacy LF consume', IME_TERMINAL_LEGACY_LF_CONSUME_MARKER],
    ['IME terminal CR sequence queue', IME_TERMINAL_CR_QUEUE_MARKER],
    ['IME terminal sequence dedupe', IME_TERMINAL_SEQUENCE_DEDUPE_MARKER],
    ['IME sendSequence hook', IME_TERMINAL_SEND_SEQUENCE_MARKER],
    ['IME dispatch hook', IME_DISPATCH_MARKER],
  ]) {
    if (!source.includes(marker)) {
      missing.push(name);
    }
  }

  return {
    ok: missing.length === 0,
    detail: missing.length === 0 ? 'all workbench patches present' : `missing: ${missing.join(', ')}`,
  };
}

function checkClaudeTitleMenus(extensionsDir) {
  if (!fs.existsSync(extensionsDir)) {
    return { ok: true, detail: 'Claude Code extension not installed' };
  }

  const packagePaths = fs
    .readdirSync(extensionsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith('anthropic.claude-code-'))
    .map((entry) => path.join(extensionsDir, entry.name, 'package.json'))
    .filter((packagePath) => fs.existsSync(packagePath));

  if (packagePaths.length === 0) {
    return { ok: true, detail: 'Claude Code extension not installed' };
  }

  const unpatched = [];
  for (const packagePath of packagePaths) {
    const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
    const menu = packageJson.contributes?.menus?.['editor/title'];
    const targets = Array.isArray(menu)
      ? menu.filter((entry) =>
          ['claude-vscode.editor.openLast', 'claude-vscode.terminal.open'].includes(entry.command),
        )
      : [];
    if (targets.length === 0 || targets.some((entry) => entry.when !== 'false')) {
      unpatched.push(packagePath);
    }
  }

  return {
    ok: unpatched.length === 0,
    detail: unpatched.length === 0 ? 'Claude title menu patched' : `unpatched: ${unpatched.join(', ')}`,
  };
}

function checkVscodeIconPatch({ sourcePath, targetPath, appBundlePath }) {
  if (!fs.existsSync(sourcePath)) {
    return { ok: false, detail: 'managed Warp Glass Sky icon missing' };
  }

  if (!fs.existsSync(targetPath)) {
    return { ok: false, detail: 'VS Code icon missing' };
  }

  const sourceIcon = fs.readFileSync(sourcePath);
  const targetIcon = fs.readFileSync(targetPath);
  const iconsMatch = sourceIcon.equals(targetIcon);

  if (!iconsMatch) {
    return {
      ok: false,
      detail: 'VS Code icon differs from managed Warp Glass Sky icon',
    };
  }

  return {
    ok: true,
    detail: 'VS Code icon matches managed Warp Glass Sky icon',
  };
}

function checkVscodeWatermarkPatch(cssPath) {
  if (!fs.existsSync(cssPath)) {
    return { ok: false, detail: 'VS Code workbench CSS missing' };
  }

  const source = fs.readFileSync(cssPath, 'utf8');
  const ok = source.includes(WATERMARK_PATCH_MARKER) && source.includes(WATERMARK_PATCH_RULE);

  return {
    ok,
    detail: ok ? 'empty editor watermark logo is hidden' : 'empty editor watermark logo patch missing',
  };
}

function checkVscodeOpaqueOverlaysPatch(cssPath) {
  if (!fs.existsSync(cssPath)) {
    return { ok: false, detail: 'VS Code workbench CSS missing' };
  }

  const source = fs.readFileSync(cssPath, 'utf8');
  const ok =
    source.includes(OPAQUE_OVERLAYS_PATCH_MARKER) &&
    OPAQUE_OVERLAYS_PATCH_RULES.every((rule) => source.includes(rule));

  return {
    ok,
    detail: ok ? 'quick input and dialog overlays are opaque' : 'opaque overlay surface patch missing',
  };
}

function checkVscodeTitlebarCenterPatch(cssPath) {
  if (!fs.existsSync(cssPath)) {
    return { ok: false, detail: 'VS Code workbench CSS missing' };
  }

  const source = fs.readFileSync(cssPath, 'utf8');
  const ok =
    source.includes(TITLEBAR_CENTER_PATCH_MARKER) &&
    TITLEBAR_CENTER_PATCH_RULES.every((rule) => source.includes(rule));

  return {
    ok,
    detail: ok ? 'titlebar center controls are hidden' : 'titlebar center patch missing',
  };
}

function checkVscodeTerminalTabsLayoutPatch(cssPath) {
  if (!fs.existsSync(cssPath)) {
    return { ok: false, detail: 'VS Code workbench CSS missing' };
  }

  const source = fs.readFileSync(cssPath, 'utf8');
  const ok =
    source.includes(TERMINAL_TABS_LAYOUT_PATCH_MARKER) &&
    TERMINAL_TABS_LAYOUT_PATCH_RULES.every((rule) => source.includes(rule));

  return {
    ok,
    detail: ok ? 'terminal tabs use multi-line wrapping layout' : 'terminal tabs layout patch missing',
  };
}

function checkVscodeDockIconPatch({ mainPath, pngSourcePath, pngTargetPath }) {
  if (!fs.existsSync(mainPath)) {
    return { ok: false, detail: 'VS Code main bundle missing' };
  }

  if (!fs.existsSync(pngSourcePath)) {
    return { ok: false, detail: 'managed Dock icon PNG missing' };
  }

  if (!fs.existsSync(pngTargetPath)) {
    return { ok: false, detail: 'VS Code Dock icon PNG asset missing' };
  }

  const sourcePng = fs.readFileSync(pngSourcePath);
  const targetPng = fs.readFileSync(pngTargetPath);
  if (!sourcePng.equals(targetPng)) {
    return { ok: false, detail: 'VS Code Dock icon PNG asset differs from managed icon' };
  }

  const source = fs.readFileSync(mainPath, 'utf8');
  const ok = source.includes(DOCK_ICON_PATCH_MARKER);

  return {
    ok,
    detail: ok ? 'runtime Dock icon patch is present' : 'runtime Dock icon patch missing',
  };
}

function status(id, ok, detail) {
  return { id, ok, detail };
}

function checkHostConfig({
  paths = createDefaultPaths(),
  checkManagedCodeApp = true,
  checkWorkbench = true,
  checkClaude = true,
  checkVscodeIcon = true,
  checkDockIcon = true,
  checkWatermark = true,
  checkOpaqueOverlays = true,
  checkTitlebarCenter = true,
  checkTerminalTabsLayout = true,
} = {}) {
  const settings = fs.existsSync(paths.userSettingsPath)
    ? readJsoncFile(paths.userSettingsPath, {})
    : undefined;
  const keybindings = fs.existsSync(paths.userKeybindingsPath)
    ? readJsoncFile(paths.userKeybindingsPath, [])
    : undefined;
  const zshrc = fs.existsSync(paths.zshrcPath) ? fs.readFileSync(paths.zshrcPath, 'utf8') : undefined;
  const codexConfig = fs.existsSync(paths.codexConfigPath)
    ? fs.readFileSync(paths.codexConfigPath, 'utf8')
    : undefined;
  const codexHooks = fs.existsSync(paths.codexHooksPath)
    ? readJsoncFile(paths.codexHooksPath, {})
    : undefined;
  const statuses = [
  ];

  if (checkManagedCodeApp) {
    const managedCodeApp = checkManagedCodeAppStatus({ paths: paths.managedCodeAppPaths });
    statuses.push(status('managedCodeApp', managedCodeApp.ok, managedCodeApp.detail));
  }

  statuses.push(
    status('settings', Boolean(settings && hasExpectedSettings(settings)), paths.userSettingsPath),
    status('keybindings', Boolean(keybindings && hasExpectedKeybindings(keybindings)), paths.userKeybindingsPath),
    status('zshrc', Boolean(zshrc && hasExpectedZshrc(zshrc)), paths.zshrcPath),
    status(
      'codexConfig',
      Boolean(codexConfig && hasExpectedCodexConfig(codexConfig)),
      paths.codexConfigPath,
    ),
    status(
      'codexHooks',
      Boolean(codexHooks && hasExpectedCodexHooks(codexHooks, { projectRoot: paths.projectRoot })),
      paths.codexHooksPath,
    ),
    status(
      'extension',
      hasExpectedExtension(paths.extensionPath, paths.projectRoot),
      `${paths.extensionPath} -> ${paths.projectRoot}`,
    ),
    status('wrapper', hasExpectedWrapper(paths.wrapperPath, paths.projectRoot), paths.wrapperPath),
    status(
      'imeWrapper',
      hasExpectedImeWrapper(paths.imeWrapperPath, paths.projectRoot),
      paths.imeWrapperPath,
    ),
  );

  if (checkWorkbench) {
    const workbench = checkWorkbenchPatches(paths.workbenchPath);
    statuses.push(status('workbench', workbench.ok, workbench.detail));
    const upstreamWorkbench = checkWorkbenchPatches(paths.sourceWorkbenchPath);
    statuses.push(status('upstreamWorkbench', upstreamWorkbench.ok, upstreamWorkbench.detail));
  }

  if (checkClaude) {
    const claude = checkClaudeTitleMenus(paths.claudeExtensionsDir);
    statuses.push(status('claude', claude.ok, claude.detail));
  }

  if (checkVscodeIcon) {
    const vscodeIcon = checkVscodeIconPatch({
      sourcePath: paths.vscodeIconSourcePath,
      targetPath: paths.vscodeIconPath,
      appBundlePath: paths.vscodeAppPath,
    });
    statuses.push(status('vscodeIcon', vscodeIcon.ok, vscodeIcon.detail));
    const upstreamVscodeIcon = checkVscodeIconPatch({
      sourcePath: paths.vscodeIconSourcePath,
      targetPath: paths.sourceVscodeIconPath,
      appBundlePath: paths.vscodeSourceAppPath,
    });
    statuses.push(status('upstreamVscodeIcon', upstreamVscodeIcon.ok, upstreamVscodeIcon.detail));
  }

  if (checkDockIcon) {
    const dockIcon = checkVscodeDockIconPatch({
      mainPath: paths.mainPath,
      pngSourcePath: paths.vscodeIconPngSourcePath,
      pngTargetPath: paths.vscodeDockIconPngPath,
    });
    statuses.push(status('dockIcon', dockIcon.ok, dockIcon.detail));
    const upstreamDockIcon = checkVscodeDockIconPatch({
      mainPath: paths.sourceMainPath,
      pngSourcePath: paths.vscodeIconPngSourcePath,
      pngTargetPath: paths.sourceVscodeDockIconPngPath,
    });
    statuses.push(status('upstreamDockIcon', upstreamDockIcon.ok, upstreamDockIcon.detail));
  }

  if (checkWatermark) {
    const watermark = checkVscodeWatermarkPatch(paths.workbenchCssPath);
    statuses.push(status('watermark', watermark.ok, watermark.detail));
    const upstreamWatermark = checkVscodeWatermarkPatch(paths.sourceWorkbenchCssPath);
    statuses.push(status('upstreamWatermark', upstreamWatermark.ok, upstreamWatermark.detail));
  }

  if (checkOpaqueOverlays) {
    const opaqueOverlays = checkVscodeOpaqueOverlaysPatch(paths.workbenchCssPath);
    statuses.push(status('opaqueOverlays', opaqueOverlays.ok, opaqueOverlays.detail));
    const upstreamOpaqueOverlays = checkVscodeOpaqueOverlaysPatch(paths.sourceWorkbenchCssPath);
    statuses.push(
      status(
        'upstreamOpaqueOverlays',
        upstreamOpaqueOverlays.ok,
        upstreamOpaqueOverlays.detail,
      ),
    );
  }

  if (checkTitlebarCenter) {
    const titlebarCenter = checkVscodeTitlebarCenterPatch(paths.workbenchCssPath);
    statuses.push(status('titlebarCenter', titlebarCenter.ok, titlebarCenter.detail));
    const upstreamTitlebarCenter = checkVscodeTitlebarCenterPatch(paths.sourceWorkbenchCssPath);
    statuses.push(
      status(
        'upstreamTitlebarCenter',
        upstreamTitlebarCenter.ok,
        upstreamTitlebarCenter.detail,
      ),
    );
  }

  if (checkTerminalTabsLayout) {
    const terminalTabsLayout = checkVscodeTerminalTabsLayoutPatch(paths.workbenchCssPath);
    statuses.push(status('terminalTabsLayout', terminalTabsLayout.ok, terminalTabsLayout.detail));
    const upstreamTerminalTabsLayout = checkVscodeTerminalTabsLayoutPatch(
      paths.sourceWorkbenchCssPath,
    );
    statuses.push(
      status(
        'upstreamTerminalTabsLayout',
        upstreamTerminalTabsLayout.ok,
        upstreamTerminalTabsLayout.detail,
      ),
    );
  }

  return statuses;
}

module.exports = {
  MANAGED_KEYBINDINGS,
  MANAGED_SETTINGS,
  applyHostConfig,
  checkClaudeTitleMenus,
  checkHostConfig,
  checkVscodeDockIconPatch,
  checkVscodeIconPatch,
  checkVscodeOpaqueOverlaysPatch,
  checkVscodeTerminalTabsLayoutPatch,
  checkVscodeTitlebarCenterPatch,
  checkVscodeWatermarkPatch,
  checkWorkbenchPatches,
  createDefaultPaths,
  ensureExtensionLink,
  ensureGlobalPatchWrapper,
  ensureImeGuardPatchWrapper,
  normalizeCodexHooksJson,
  normalizeKeybindings,
  normalizeCodexConfigToml,
  normalizeSettings,
  normalizeZshrc,
  parseJsonc,
  stringifyJson,
};
