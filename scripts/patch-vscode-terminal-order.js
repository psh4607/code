#!/usr/bin/env node

const childProcess = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const workbenchPath =
  process.env.VSCODE_WORKBENCH_MAIN ||
  '/Applications/Code.app/Contents/Resources/app/out/vs/workbench/workbench.desktop.main.js';

const original =
  'unsplitInstance(e){let t=this.getGroupForInstance(e);!t||t.terminalInstances.length<2||(t.removeInstance(e),this.createGroup(e))}';

const patched =
  'unsplitInstance(e){let t=this.getGroupForInstance(e);if(!t||t.terminalInstances.length<2)return;let o=this.groups.indexOf(t);t.removeInstance(e);let n=this.createGroup(e),r=this.groups.indexOf(n);r!==-1&&o!==-1&&(this.groups.splice(r,1),this.groups.splice(Math.min(o+1,this.groups.length),0,n),this._onDidChangeGroups.fire(),this._onDidChangeInstances.fire()),this.setActiveInstance(e)}';

const originalChangeColor =
  'Kr({id:"workbench.action.terminal.changeColor",title:Ir.changeColor,precondition:Ra.terminalAvailable,run:(i,e,t)=>Omt(i,t)?.changeColor()})';

const patchedChangeColor =
  'Kr({id:"workbench.action.terminal.changeColor",title:Ir.changeColor,precondition:Ra.terminalAvailable,run:async(i,e,t)=>{let o=Omt(i,t),n=await o?.changeColor();n&&await e.get(be).executeCommand("codexTerminal.rememberCwdColor",{cwd:await o.getSpeculativeCwd?.(),color:n})}})';

const vscode127OriginalChangeColor =
  'Kr({id:"workbench.action.terminal.changeColor",title:wr.changeColor,precondition:Aa.terminalAvailable,run:(i,e,t)=>mft(i,t)?.changeColor()})';

const vscode127PatchedChangeColor =
  'Kr({id:"workbench.action.terminal.changeColor",title:wr.changeColor,precondition:Aa.terminalAvailable,run:async(i,e,t)=>{let o=mft(i,t),n=await o?.changeColor();n&&await e.get(be).executeCommand("codexTerminal.rememberCwdColor",{cwd:await o.getSpeculativeCwd?.(),color:n})}})';

const originalChangeColorActiveTab =
  'Kr({id:"workbench.action.terminal.changeColorActiveTab",title:Ir.changeColor,f1:!1,precondition:Ra.terminalAvailable_and_singularSelection,run:async(i,e,t)=>{let o,n=0;if(i.groupService.lastAccessedMenu==="inline-tab"){Omt(i,t)?.changeColor();return}for(let r of EGe(e)??[]){let s=n!==0;o=await r.changeColor(o,s),n++}}})';

const legacyPatchedChangeColorActiveTab =
  'Kr({id:"workbench.action.terminal.changeColorActiveTab",title:Ir.changeColor,f1:!1,precondition:Ra.terminalAvailable_and_singularSelection,run:async(i,e,t)=>{let o,n=0;if(typeof t=="string"||t===null){for(let r of EGe(e)??[]){let s=t===null||n!==0;o=await r.changeColor(t??void 0,s),n++}return}if(i.groupService.lastAccessedMenu==="inline-tab"){Omt(i,t)?.changeColor();return}for(let r of EGe(e)??[]){let s=n!==0;o=await r.changeColor(o,s),n++}}})';

const selectedFallbackPatchedChangeColorActiveTab =
  'Kr({id:"workbench.action.terminal.changeColorActiveTab",title:Ir.changeColor,f1:!1,precondition:Ra.terminalAvailable_and_singularSelection,run:async(i,e,t)=>{let o,n=0,r=EGe(e);if(typeof t=="string"||t===null){r?.length||(r=i.service.activeInstance?[i.service.activeInstance]:[]);for(let s of r){let c=t===null||n!==0;o=await s.changeColor(t??void 0,c),n++}return}async function s(c,l,u){let p=await c?.changeColor(l,u);p&&await e.get(be).executeCommand("codexTerminal.rememberCwdColor",{cwd:await c.getSpeculativeCwd?.(),color:p});return p}if(i.groupService.lastAccessedMenu==="inline-tab"){await s(Omt(i,t));return}for(let c of r??[]){let l=n!==0;o=await s(c,o,l),n++}}})';

const patchedChangeColorActiveTab =
  'Kr({id:"workbench.action.terminal.changeColorActiveTab",title:Ir.changeColor,f1:!1,precondition:Ra.terminalAvailable_and_singularSelection,run:async(i,e,t)=>{let o,n=0,r=EGe(e);if(typeof t=="string"||t===null){for(let s of i.service.activeInstance?[i.service.activeInstance]:[]){let c=t===null||n!==0;o=await s.changeColor(t??void 0,c),n++}return}async function s(c,l,u){let p=await c?.changeColor(l,u);p&&await e.get(be).executeCommand("codexTerminal.rememberCwdColor",{cwd:await c.getSpeculativeCwd?.(),color:p});return p}if(i.groupService.lastAccessedMenu==="inline-tab"){await s(Omt(i,t));return}for(let c of r??[]){let l=n!==0;o=await s(c,o,l),n++}}})';

const vscode127OriginalChangeColorActiveTab =
  'Kr({id:"workbench.action.terminal.changeColorActiveTab",title:wr.changeColor,f1:!1,precondition:Aa.terminalAvailable_and_singularSelection,run:async(i,e,t)=>{let o,n=0;if(i.groupService.lastAccessedMenu==="inline-tab"){mft(i,t)?.changeColor();return}for(let r of Bqe(e)??[]){let s=n!==0;o=await r.changeColor(o,s),n++}}})';

const vscode127PatchedChangeColorActiveTab =
  'Kr({id:"workbench.action.terminal.changeColorActiveTab",title:wr.changeColor,f1:!1,precondition:Aa.terminalAvailable_and_singularSelection,run:async(i,e,t)=>{let o,n=0,r=Bqe(e);if(typeof t=="string"||t===null){for(let s of i.service.activeInstance?[i.service.activeInstance]:[]){let c=t===null||n!==0;o=await s.changeColor(t??void 0,c),n++}return}async function s(c,l,u){let p=await c?.changeColor(l,u);p&&await e.get(be).executeCommand("codexTerminal.rememberCwdColor",{cwd:await c.getSpeculativeCwd?.(),color:p});return p}if(i.groupService.lastAccessedMenu==="inline-tab"){await s(mft(i,t));return}for(let c of r??[]){let l=n!==0;o=await s(c,o,l),n++}}})';

const terminalTabHighlightCommandMarker = 'codexTerminal.flashActiveTerminalTab';

const terminalTabHighlightCommand =
  'Kr({id:"codexTerminal.flashActiveTerminalTab",title:"Flash Active Terminal Tab",f1:!1,run:(i,e,t)=>{let o=Math.max(100,Math.min(Number(t?.durationMs)||1e3,5e3)),n="codex-terminal-tab-highlight-flash",r="codex-terminal-tab-highlight-style",s=document.getElementById(r);s||(s=document.createElement("style"),s.id=r,s.textContent="@keyframes codex-terminal-tab-highlight{0%{background-color:rgba(255,176,32,.52);box-shadow:inset 0 0 0 999px rgba(255,176,32,.18),inset 3px 0 0 #ffb020}100%{background-color:transparent;box-shadow:inset 0 0 0 999px rgba(255,176,32,0),inset 3px 0 0 rgba(255,176,32,0)}}.codex-terminal-tab-highlight-flash .terminal-tabs .monaco-list-row.focused,.codex-terminal-tab-highlight-flash .terminal-tabs .monaco-list-row.selected{animation:codex-terminal-tab-highlight var(--codex-terminal-tab-highlight-duration,1000ms) ease-out 1!important;background-color:rgba(255,176,32,.32)!important;box-shadow:inset 0 0 0 999px rgba(255,176,32,.12),inset 3px 0 0 #ffb020!important;}",document.head.appendChild(s)),document.body.style.setProperty("--codex-terminal-tab-highlight-duration",o+"ms"),document.body.classList.remove(n),void document.body.offsetWidth,document.body.classList.add(n),clearTimeout(globalThis.__codexTerminalTabHighlightTimer),globalThis.__codexTerminalTabHighlightTimer=setTimeout(()=>document.body.classList.remove(n),o)}})';

const vscode127OriginalTabsEmptyDoubleClick =
  'this.disposables.add(this.onMouseDblClick(async b=>{if(!b.element){b.browserEvent.preventDefault(),b.browserEvent.stopPropagation();let S=await this._terminalService.createTerminal({location:1});this._terminalGroupService.setActiveInstance(S),await S.focusWhenReady();return}this._terminalEditingService.getEditingTerminal()?.instanceId!==b.element.instanceId&&this._getFocusMode()==="doubleClick"&&this.getFocus().length===1&&b.element.focus(!0)}))';

const vscode127PatchedTabsEmptyDoubleClick =
  'this.disposables.add(this.onMouseDblClick(async b=>{if(!b.element){b.browserEvent.preventDefault(),b.browserEvent.stopPropagation();let S=this._terminalGroupService.instances.length-1,I=this._terminalGroupService.instances[S];I&&(this._terminalGroupService.setActiveInstance(I),this.setSelection([S]),this.setFocus([S]),this.reveal(S),await I.focusWhenReady());return}this._terminalEditingService.getEditingTerminal()?.instanceId!==b.element.instanceId&&this._getFocusMode()==="doubleClick"&&this.getFocus().length===1&&b.element.focus(!0)}))';

const vscode127OriginalTabsEmptyClick =
  'this.disposables.add(this.onMouseClick(async b=>{this._terminalEditingService.getEditingTerminal()?.instanceId!==b.element?.instanceId&&(b.browserEvent.altKey&&b.element?await this._terminalService.createTerminal({location:{parentTerminal:b.element}}):this._getFocusMode()==="singleClick"&&this.getSelection().length<=1&&b.element?.focus(!0))}))';

const vscode127PatchedTabsEmptyClick =
  'this.disposables.add(this.onMouseClick(async b=>{if(!b.element){b.browserEvent.preventDefault(),b.browserEvent.stopPropagation();let S=this._terminalGroupService.instances.length-1,I=this._terminalGroupService.instances[S];I&&(this._terminalGroupService.setActiveInstance(I),this.setSelection([S]),this.setFocus([S]),this.reveal(S),await I.focusWhenReady());return}this._terminalEditingService.getEditingTerminal()?.instanceId!==b.element?.instanceId&&(b.browserEvent.altKey?await this._terminalService.createTerminal({location:{parentTerminal:b.element}}):this._getFocusMode()==="singleClick"&&this.getSelection().length<=1&&b.element.focus(!0))}))';

const vscode127OriginalTabsNativeEmptyClick =
  'this._register($(this._tabContainer,"drop",o=>{this._shouldHandleEmptyAreaDrop(o)&&this._handleContainerDrop(o)})),this._register($(t,"mousedown",async o=>{';

const vscode127PatchedTabsNativeEmptyClick =
  'this._register($(this._tabContainer,"drop",o=>{this._shouldHandleEmptyAreaDrop(o)&&this._handleContainerDrop(o)})),this._register($(this._tabListDomElement,"mousedown",async o=>{if(o.button!==0)return;let n=o.target;if(n?.closest?.(".monaco-list-row,.terminal-tabs-chat-entry"))return;let r=this._terminalGroupService.instances.length-1,s=this._terminalGroupService.instances[r];s&&(this._terminalGroupService.setActiveInstance(s),this._tabList.setSelection([r]),this._tabList.setFocus([r]),this._tabList.reveal(r),o.preventDefault(),o.stopPropagation(),await s.focusWhenReady())})),this._register($(this._tabListDomElement,"click",o=>{if(o.button!==0)return;let n=o.target;if(n?.closest?.(".monaco-list-row,.terminal-tabs-chat-entry"))return;o.preventDefault(),o.stopPropagation(),setTimeout(async()=>{let r=this._terminalGroupService.instances.length-1,s=this._terminalGroupService.instances[r];s&&(this._terminalGroupService.setActiveInstance(s),this._tabList.setSelection([r]),this._tabList.setFocus([r]),this._tabList.reveal(r),await s.focusWhenReady())},0)})),this._register($(t,"mousedown",async o=>{';

const vscode127OriginalTerminalTabsListHeight =
  'super("TerminalTabsList",e,{getHeight:()=>22,getTemplateId:()=>"terminal.tabs"},[l.createInstance(dft,e,l.createInstance(jc,mO),()=>this.getSelectedElements(),{getHasText:()=>this.hasText,getHasActionBar:()=>this.hasActionBar})],{horizontalScrolling:!1,supportDynamicHeights:!1,selectionNavigation:!0,identityProvider:{getId:b=>b?.instanceId},accessibilityProvider:l.createInstance(uft),smoothScrolling:n.getValue("workbench.list.smoothScrolling"),multipleSelectionSupport:!0,paddingBottom:22,dnd:l.createInstance(pft),openOnSingleClick:!0},t,o,n,l)';

const vscode127LegacyPatchedTerminalTabsListHeight =
  'super("TerminalTabsList",e,{getHeight:()=>44,getTemplateId:()=>"terminal.tabs"},[l.createInstance(dft,e,l.createInstance(jc,mO),()=>this.getSelectedElements(),{getHasText:()=>this.hasText,getHasActionBar:()=>this.hasActionBar})],{horizontalScrolling:!1,supportDynamicHeights:!1,selectionNavigation:!0,identityProvider:{getId:b=>b?.instanceId},accessibilityProvider:l.createInstance(uft),smoothScrolling:n.getValue("workbench.list.smoothScrolling"),multipleSelectionSupport:!0,paddingBottom:44,dnd:l.createInstance(pft),openOnSingleClick:!0},t,o,n,l)';

const vscode127Legacy48PatchedTerminalTabsListHeight =
  'super("TerminalTabsList",e,{getHeight:()=>48,getTemplateId:()=>"terminal.tabs"},[l.createInstance(dft,e,l.createInstance(jc,mO),()=>this.getSelectedElements(),{getHasText:()=>this.hasText,getHasActionBar:()=>this.hasActionBar})],{horizontalScrolling:!1,supportDynamicHeights:!1,selectionNavigation:!0,identityProvider:{getId:b=>b?.instanceId},accessibilityProvider:l.createInstance(uft),smoothScrolling:n.getValue("workbench.list.smoothScrolling"),multipleSelectionSupport:!0,paddingBottom:48,dnd:l.createInstance(pft),openOnSingleClick:!0},t,o,n,l)';

const vscode127Legacy64PatchedTerminalTabsListHeight =
  'super("TerminalTabsList",e,{getHeight:()=>64,getTemplateId:()=>"terminal.tabs"},[l.createInstance(dft,e,l.createInstance(jc,mO),()=>this.getSelectedElements(),{getHasText:()=>this.hasText,getHasActionBar:()=>this.hasActionBar})],{horizontalScrolling:!1,supportDynamicHeights:!1,selectionNavigation:!0,identityProvider:{getId:b=>b?.instanceId},accessibilityProvider:l.createInstance(uft),smoothScrolling:n.getValue("workbench.list.smoothScrolling"),multipleSelectionSupport:!0,paddingBottom:64,dnd:l.createInstance(pft),openOnSingleClick:!0},t,o,n,l)';

const vscode127PatchedTerminalTabsListHeight =
  'super("TerminalTabsList",e,{getHeight:()=>68,getTemplateId:()=>"terminal.tabs"},[l.createInstance(dft,e,l.createInstance(jc,mO),()=>this.getSelectedElements(),{getHasText:()=>this.hasText,getHasActionBar:()=>this.hasActionBar})],{horizontalScrolling:!1,supportDynamicHeights:!1,selectionNavigation:!0,identityProvider:{getId:b=>b?.instanceId},accessibilityProvider:l.createInstance(uft),smoothScrolling:n.getValue("workbench.list.smoothScrolling"),multipleSelectionSupport:!0,paddingBottom:68,dnd:l.createInstance(pft),openOnSingleClick:!0},t,o,n,l)';

const patchHeader = '/* Patched by codex-vscode-terminal-tools. Reapply with patch-vscode-terminal-order. */\n';
const claudeEditorTitleCommands = new Set([
  'claude-vscode.editor.openLast',
  'claude-vscode.terminal.open',
]);

function countOccurrences(source, needle) {
  let count = 0;
  let index = 0;

  while ((index = source.indexOf(needle, index)) !== -1) {
    count += 1;
    index += needle.length;
  }

  return count;
}

function timestamp() {
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-');
}

function checkSyntax(filePath) {
  childProcess.execFileSync(process.execPath, ['--check', filePath], {
    stdio: 'inherit',
  });
}

function getClaudePackagePaths() {
  if (process.env.VSCODE_CLAUDE_EXTENSION_PACKAGE) {
    return [process.env.VSCODE_CLAUDE_EXTENSION_PACKAGE];
  }

  const extensionsDir =
    process.env.VSCODE_EXTENSIONS_DIR || path.join(os.homedir(), '.vscode', 'extensions');

  if (!fs.existsSync(extensionsDir)) {
    return [];
  }

  return fs
    .readdirSync(extensionsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith('anthropic.claude-code-'))
    .map((entry) => path.join(extensionsDir, entry.name, 'package.json'))
    .filter((packagePath) => fs.existsSync(packagePath))
    .sort();
}

function patchClaudePackage(claudePackagePath) {
  if (!fs.existsSync(claudePackagePath)) {
    console.error(`Claude Code extension package not found: ${claudePackagePath}`);
    process.exit(1);
  }

  const source = fs.readFileSync(claudePackagePath, 'utf8');
  let packageJson;

  try {
    packageJson = JSON.parse(source);
  } catch (error) {
    console.error(`Could not parse Claude Code extension package: ${claudePackagePath}`);
    throw error;
  }

  const editorTitleMenu = packageJson.contributes?.menus?.['editor/title'];
  if (!Array.isArray(editorTitleMenu)) {
    console.error('Could not apply Claude Code editor-title menu patch safely.');
    console.error(`No contributes.menus["editor/title"] array found in ${claudePackagePath}.`);
    process.exit(1);
  }

  let targetCount = 0;
  let changed = false;

  for (const menuItem of editorTitleMenu) {
    if (!claudeEditorTitleCommands.has(menuItem.command)) {
      continue;
    }

    targetCount += 1;

    if (menuItem.when !== 'false') {
      menuItem.when = 'false';
      changed = true;
    }
  }

  if (targetCount === 0) {
    console.error('Could not apply Claude Code editor-title menu patch safely.');
    console.error(`No Claude Code title open commands found in ${claudePackagePath}.`);
    console.error('Re-check contributes.menus["editor/title"] before patching.');
    process.exit(1);
  }

  if (!changed) {
    return { state: 'patched' };
  }

  const stat = fs.statSync(claudePackagePath);
  const backupPath = `${claudePackagePath}.codex-backup-${timestamp()}-claude-editor-title`;
  const tempPath = `${claudePackagePath}.codex-tmp-${process.pid}.json`;
  const nextSource = `${JSON.stringify(packageJson, null, 2)}\n`;

  JSON.parse(nextSource);
  fs.copyFileSync(claudePackagePath, backupPath);
  fs.writeFileSync(tempPath, nextSource, { mode: stat.mode });
  fs.renameSync(tempPath, claudePackagePath);

  return { state: 'needs-patch', backupPath };
}

function patchClaudePackages() {
  const claudePackagePaths = getClaudePackagePaths();

  if (claudePackagePaths.length === 0) {
    return { patched: 0, alreadyPatched: 0, skipped: true };
  }

  let patched = 0;
  let alreadyPatched = 0;

  for (const claudePackagePath of claudePackagePaths) {
    const result = patchClaudePackage(claudePackagePath);

    if (result.state === 'patched') {
      alreadyPatched += 1;
      continue;
    }

    patched += 1;
    console.log(`Patched Claude Code editor title menu: ${claudePackagePath}`);
    console.log(`Backup: ${result.backupPath}`);
  }

  return { patched, alreadyPatched, skipped: false };
}

function getPatchState({ originalCount, patchedCount, name, inspectTarget }) {
  if (patchedCount === 1 && originalCount === 0) {
    return 'patched';
  }

  if (originalCount === 1 && patchedCount === 0) {
    return 'needs-patch';
  }

  console.error(`Could not apply VS Code ${name} patch safely.`);
  console.error(`Original marker count: ${originalCount}`);
  console.error(`Patched marker count: ${patchedCount}`);
  console.error(`VS Code internals may have changed. Re-check ${inspectTarget} before patching.`);
  process.exit(1);
}

function getReplacementPatchState({
  source,
  sourceMarkers,
  patchedMarker,
  patchedMarkers = [patchedMarker],
  name,
  inspectTarget,
}) {
  const patchedMatches = patchedMarkers
    .map((marker) => ({
      marker,
      count: countOccurrences(source, marker),
    }))
    .filter((match) => match.count > 0);
  const patchedCount = patchedMatches.reduce((total, match) => total + match.count, 0);
  const sourceMatches = sourceMarkers
    .map((marker) => ({
      marker,
      count: countOccurrences(source, marker),
    }))
    .filter((match) => match.count > 0);
  const originalCount = sourceMatches.reduce((total, match) => total + match.count, 0);

  if (patchedCount === 1 && originalCount === 0) {
    return { state: 'patched', marker: patchedMatches[0].marker };
  }

  if (patchedCount === 0 && sourceMatches.length === 1 && originalCount === 1) {
    return {
      state: 'needs-patch',
      marker: sourceMatches[0].marker,
    };
  }

  console.error(`Could not apply VS Code ${name} patch safely.`);
  console.error(`Original marker count: ${originalCount}`);
  console.error(`Patched marker count: ${patchedCount}`);
  console.error(`VS Code internals may have changed. Re-check ${inspectTarget} before patching.`);
  process.exit(1);
}

function getTerminalColorPatch(marker) {
  return marker === vscode127OriginalChangeColor ? vscode127PatchedChangeColor : patchedChangeColor;
}

function getTerminalActiveTabColorPatch(marker) {
  return marker === vscode127OriginalChangeColorActiveTab
    ? vscode127PatchedChangeColorActiveTab
    : patchedChangeColorActiveTab;
}

function getTerminalTabHighlightPatchState(source, activeTabColorState) {
  const patchedCount = countOccurrences(source, terminalTabHighlightCommandMarker);
  if (patchedCount === 1) {
    return { state: 'patched' };
  }
  if (patchedCount > 1) {
    console.error('Could not apply VS Code terminal tab highlight command patch safely.');
    console.error(`Patched marker count: ${patchedCount}`);
    console.error('VS Code internals may have changed. Re-check terminal command registration before patching.');
    process.exit(1);
  }

  const activeTabColorMarkers = [
    patchedChangeColorActiveTab,
    vscode127PatchedChangeColorActiveTab,
  ];
  const anchorMatches = activeTabColorMarkers
    .map((marker) => ({
      marker,
      count: countOccurrences(source, marker),
    }))
    .filter((match) => match.count > 0);
  const anchorCount = anchorMatches.reduce((total, match) => total + match.count, 0);
  if (anchorMatches.length === 1 && anchorCount === 1) {
    return { state: 'needs-patch', marker: anchorMatches[0].marker };
  }

  if (activeTabColorState.state === 'needs-patch') {
    return { state: 'needs-patch-after-active-tab-color' };
  }

  console.error('Could not apply VS Code terminal tab highlight command patch safely.');
  console.error(`Active tab color anchor count: ${anchorCount}`);
  console.error('VS Code internals may have changed. Re-check terminal command registration before patching.');
  process.exit(1);
}

if (!fs.existsSync(workbenchPath)) {
  console.error(`VS Code workbench bundle not found: ${workbenchPath}`);
  process.exit(1);
}

const source = fs.readFileSync(workbenchPath, 'utf8');
const patchedCount = countOccurrences(source, patched);
const originalCount = countOccurrences(source, original);

const terminalOrderState = getPatchState({
  name: 'terminal-order',
  originalCount,
  patchedCount,
  inspectTarget: 'unsplitInstance',
});
const terminalColorState = getReplacementPatchState({
  source,
  name: 'terminal color-command',
  sourceMarkers: [originalChangeColor, vscode127OriginalChangeColor],
  patchedMarkers: [patchedChangeColor, vscode127PatchedChangeColor],
  inspectTarget: 'changeColor',
});
const terminalActiveTabColorState = getReplacementPatchState({
  source,
  name: 'terminal active-tab color-command',
  sourceMarkers: [
    originalChangeColorActiveTab,
    vscode127OriginalChangeColorActiveTab,
    legacyPatchedChangeColorActiveTab,
    selectedFallbackPatchedChangeColorActiveTab,
  ],
  patchedMarkers: [patchedChangeColorActiveTab, vscode127PatchedChangeColorActiveTab],
  inspectTarget: 'changeColorActiveTab',
});
const terminalTabHighlightState = getTerminalTabHighlightPatchState(
  source,
  terminalActiveTabColorState,
);
const terminalTabsEmptyDoubleClickState = getReplacementPatchState({
  source,
  name: 'terminal tabs empty-area double-click',
  sourceMarkers: [vscode127OriginalTabsEmptyDoubleClick],
  patchedMarkers: [vscode127PatchedTabsEmptyDoubleClick],
  inspectTarget: 'terminal tabs onMouseDblClick',
});
const terminalTabsEmptyClickState = getReplacementPatchState({
  source,
  name: 'terminal tabs empty-area click',
  sourceMarkers: [vscode127OriginalTabsEmptyClick],
  patchedMarkers: [vscode127PatchedTabsEmptyClick],
  inspectTarget: 'terminal tabs onMouseClick',
});
const terminalTabsNativeEmptyClickState = getReplacementPatchState({
  source,
  name: 'terminal tabs native empty-area click',
  sourceMarkers: [vscode127OriginalTabsNativeEmptyClick],
  patchedMarkers: [vscode127PatchedTabsNativeEmptyClick],
  inspectTarget: 'terminal tabs native click listeners',
});
const terminalTabsListHeightState = getReplacementPatchState({
  source,
  name: 'terminal tabs multi-line row height',
  sourceMarkers: [
    vscode127OriginalTerminalTabsListHeight,
    vscode127LegacyPatchedTerminalTabsListHeight,
    vscode127Legacy48PatchedTerminalTabsListHeight,
    vscode127Legacy64PatchedTerminalTabsListHeight,
  ],
  patchedMarkers: [vscode127PatchedTerminalTabsListHeight],
  inspectTarget: 'TerminalTabsList row height',
});

const workbenchNeedsPatch =
  terminalOrderState === 'needs-patch' ||
  terminalColorState.state === 'needs-patch' ||
  terminalActiveTabColorState.state === 'needs-patch' ||
  terminalTabHighlightState.state !== 'patched' ||
  terminalTabsEmptyDoubleClickState.state === 'needs-patch' ||
  terminalTabsEmptyClickState.state === 'needs-patch' ||
  terminalTabsNativeEmptyClickState.state === 'needs-patch' ||
  terminalTabsListHeightState.state === 'needs-patch';

if (!workbenchNeedsPatch) {
  checkSyntax(workbenchPath);
} else {
  const stat = fs.statSync(workbenchPath);
  const backupPath = `${workbenchPath}.codex-backup-${timestamp()}-terminal-order`;
  const tempPath = `${workbenchPath}.codex-tmp-${process.pid}.js`;
  let nextSource = source.startsWith(patchHeader)
    ? source
    : `${patchHeader}${source}`;

  if (terminalOrderState === 'needs-patch') {
    nextSource = nextSource.replace(original, patched);
  }

  if (terminalColorState.state === 'needs-patch') {
    nextSource = nextSource.replace(
      terminalColorState.marker,
      getTerminalColorPatch(terminalColorState.marker),
    );
  }

  if (terminalActiveTabColorState.state === 'needs-patch') {
    nextSource = nextSource.replace(
      terminalActiveTabColorState.marker,
      getTerminalActiveTabColorPatch(terminalActiveTabColorState.marker),
    );
  }

  if (terminalTabHighlightState.state !== 'patched') {
    const terminalTabHighlightAnchor =
      terminalTabHighlightState.marker ??
      getTerminalActiveTabColorPatch(terminalActiveTabColorState.marker);
    nextSource = nextSource.replace(
      terminalTabHighlightAnchor,
      `${terminalTabHighlightAnchor};${terminalTabHighlightCommand}`,
    );
  }

  if (terminalTabsEmptyDoubleClickState.state === 'needs-patch') {
    nextSource = nextSource.replace(
      terminalTabsEmptyDoubleClickState.marker,
      vscode127PatchedTabsEmptyDoubleClick,
    );
  }

  if (terminalTabsEmptyClickState.state === 'needs-patch') {
    nextSource = nextSource.replace(
      terminalTabsEmptyClickState.marker,
      vscode127PatchedTabsEmptyClick,
    );
  }

  if (terminalTabsNativeEmptyClickState.state === 'needs-patch') {
    nextSource = nextSource.replace(
      terminalTabsNativeEmptyClickState.marker,
      vscode127PatchedTabsNativeEmptyClick,
    );
  }

  if (terminalTabsListHeightState.state === 'needs-patch') {
    nextSource = nextSource.replace(
      terminalTabsListHeightState.marker,
      vscode127PatchedTerminalTabsListHeight,
    );
  }

  fs.copyFileSync(workbenchPath, backupPath);
  fs.writeFileSync(tempPath, nextSource, { mode: stat.mode });

  try {
    checkSyntax(tempPath);
    fs.renameSync(tempPath, workbenchPath);
  } catch (error) {
    fs.rmSync(tempPath, { force: true });
    throw error;
  }

  console.log(`Patched: ${workbenchPath}`);
  console.log(`Backup: ${backupPath}`);
}

const claudePatchResult = patchClaudePackages();

if (!workbenchNeedsPatch && claudePatchResult.patched === 0) {
  console.log(`Already patched: ${workbenchPath}`);

  if (!claudePatchResult.skipped) {
    console.log('Already patched: Claude Code editor title menu');
  }
}

console.log('Fully quit and reopen VS Code for the patched workbench bundle to load.');
