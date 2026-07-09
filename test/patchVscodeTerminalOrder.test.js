const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const scriptPath = path.join(__dirname, '..', 'scripts', 'patch-vscode-terminal-order.js');

function runPatchScript({ workbenchPath, tmpDir, env = {} }) {
  const extensionsDir = path.join(tmpDir, 'extensions');
  fs.mkdirSync(extensionsDir, { recursive: true });

  return childProcess.spawnSync(process.execPath, [scriptPath], {
    env: {
      ...process.env,
      VSCODE_WORKBENCH_MAIN: workbenchPath,
      VSCODE_EXTENSIONS_DIR: extensionsDir,
      ...env,
    },
    encoding: 'utf8',
  });
}

const originalUnsplit =
  'unsplitInstance(e){let t=this.getGroupForInstance(e);!t||t.terminalInstances.length<2||(t.removeInstance(e),this.createGroup(e))}';

const patchedUnsplit =
  'unsplitInstance(e){let t=this.getGroupForInstance(e);if(!t||t.terminalInstances.length<2)return;let o=this.groups.indexOf(t);t.removeInstance(e);let n=this.createGroup(e),r=this.groups.indexOf(n);r!==-1&&o!==-1&&(this.groups.splice(r,1),this.groups.splice(Math.min(o+1,this.groups.length),0,n),this._onDidChangeGroups.fire(),this._onDidChangeInstances.fire()),this.setActiveInstance(e)}';

const originalCreateGroup =
  'createGroup(e){let t=this._instantiationService.createInstance(qqe,this._container,e);return this.groups.push(t),t.addDisposable(U.forward(t.onPanelOrientationChanged,this._onDidChangePanelOrientation)),t.addDisposable(U.forward(t.onDidDisposeInstance,this._onDidDisposeInstance)),t.addDisposable(U.forward(t.onDidFocusInstance,this._onDidFocusInstance)),t.addDisposable(U.forward(t.onDidChangeInstanceCapability,this._onDidChangeInstanceCapability)),t.addDisposable(U.forward(t.onInstancesChanged,this._onDidChangeInstances)),t.addDisposable(U.forward(t.onDisposed,this._onDidDisposeGroup)),t.addDisposable(t.onDidChangeActiveInstance(o=>{t===this.activeGroup&&this._onDidChangeActiveInstance.fire(o)})),t.terminalInstances.length>0&&this._onDidChangeInstances.fire(),this.instances.length===1&&this.setActiveInstanceByIndex(0),this._onDidChangeGroups.fire(),t}';

const patchedCreateGroup =
  'createGroup(e){let t=this._instantiationService.createInstance(qqe,this._container,e),o=this.activeGroupIndex;return this.groups.push(t),o!==-1&&this.groups.length>1&&(this.groups.splice(this.groups.length-1,1),this.groups.splice(Math.min(o+1,this.groups.length),0,t)),t.addDisposable(U.forward(t.onPanelOrientationChanged,this._onDidChangePanelOrientation)),t.addDisposable(U.forward(t.onDidDisposeInstance,this._onDidDisposeInstance)),t.addDisposable(U.forward(t.onDidFocusInstance,this._onDidFocusInstance)),t.addDisposable(U.forward(t.onDidChangeInstanceCapability,this._onDidChangeInstanceCapability)),t.addDisposable(U.forward(t.onInstancesChanged,this._onDidChangeInstances)),t.addDisposable(U.forward(t.onDisposed,this._onDidDisposeGroup)),t.addDisposable(t.onDidChangeActiveInstance(n=>{t===this.activeGroup&&this._onDidChangeActiveInstance.fire(n)})),t.terminalInstances.length>0&&this._onDidChangeInstances.fire(),this.instances.length===1&&this.setActiveInstanceByIndex(0),this._onDidChangeGroups.fire(),t}';

const originalChangeColor =
  'Kr({id:"workbench.action.terminal.changeColor",title:Ir.changeColor,precondition:Ra.terminalAvailable,run:(i,e,t)=>Omt(i,t)?.changeColor()})';

const vscode127OriginalChangeColor =
  'Kr({id:"workbench.action.terminal.changeColor",title:wr.changeColor,precondition:Aa.terminalAvailable,run:(i,e,t)=>mft(i,t)?.changeColor()})';

const patchedChangeColor =
  'Kr({id:"workbench.action.terminal.changeColor",title:Ir.changeColor,precondition:Ra.terminalAvailable,run:async(i,e,t)=>{let o=Omt(i,t),n=await o?.changeColor();n&&await e.get(be).executeCommand("codexTerminal.rememberCwdColor",{cwd:await o.getSpeculativeCwd?.(),color:n})}})';

const vscode127PatchedChangeColor =
  'Kr({id:"workbench.action.terminal.changeColor",title:wr.changeColor,precondition:Aa.terminalAvailable,run:async(i,e,t)=>{let o=mft(i,t),n=await o?.changeColor();n&&await e.get(be).executeCommand("codexTerminal.rememberCwdColor",{cwd:await o.getSpeculativeCwd?.(),color:n})}})';

const originalChangeColorActiveTab =
  'Kr({id:"workbench.action.terminal.changeColorActiveTab",title:Ir.changeColor,f1:!1,precondition:Ra.terminalAvailable_and_singularSelection,run:async(i,e,t)=>{let o,n=0;if(i.groupService.lastAccessedMenu==="inline-tab"){Omt(i,t)?.changeColor();return}for(let r of EGe(e)??[]){let s=n!==0;o=await r.changeColor(o,s),n++}}})';

const vscode127OriginalChangeColorActiveTab =
  'Kr({id:"workbench.action.terminal.changeColorActiveTab",title:wr.changeColor,f1:!1,precondition:Aa.terminalAvailable_and_singularSelection,run:async(i,e,t)=>{let o,n=0;if(i.groupService.lastAccessedMenu==="inline-tab"){mft(i,t)?.changeColor();return}for(let r of Bqe(e)??[]){let s=n!==0;o=await r.changeColor(o,s),n++}}})';

const legacyPatchedChangeColorActiveTab =
  'Kr({id:"workbench.action.terminal.changeColorActiveTab",title:Ir.changeColor,f1:!1,precondition:Ra.terminalAvailable_and_singularSelection,run:async(i,e,t)=>{let o,n=0;if(typeof t=="string"||t===null){for(let r of EGe(e)??[]){let s=t===null||n!==0;o=await r.changeColor(t??void 0,s),n++}return}if(i.groupService.lastAccessedMenu==="inline-tab"){Omt(i,t)?.changeColor();return}for(let r of EGe(e)??[]){let s=n!==0;o=await r.changeColor(o,s),n++}}})';

const selectedFallbackPatchedChangeColorActiveTab =
  'Kr({id:"workbench.action.terminal.changeColorActiveTab",title:Ir.changeColor,f1:!1,precondition:Ra.terminalAvailable_and_singularSelection,run:async(i,e,t)=>{let o,n=0,r=EGe(e);if(typeof t=="string"||t===null){r?.length||(r=i.service.activeInstance?[i.service.activeInstance]:[]);for(let s of r){let c=t===null||n!==0;o=await s.changeColor(t??void 0,c),n++}return}async function s(c,l,u){let p=await c?.changeColor(l,u);p&&await e.get(be).executeCommand("codexTerminal.rememberCwdColor",{cwd:await c.getSpeculativeCwd?.(),color:p});return p}if(i.groupService.lastAccessedMenu==="inline-tab"){await s(Omt(i,t));return}for(let c of r??[]){let l=n!==0;o=await s(c,o,l),n++}}})';

const patchedChangeColorActiveTab =
  'Kr({id:"workbench.action.terminal.changeColorActiveTab",title:Ir.changeColor,f1:!1,precondition:Ra.terminalAvailable_and_singularSelection,run:async(i,e,t)=>{let o,n=0,r=EGe(e);if(typeof t=="string"||t===null){for(let s of i.service.activeInstance?[i.service.activeInstance]:[]){let c=t===null||n!==0;o=await s.changeColor(t??void 0,c),n++}return}async function s(c,l,u){let p=await c?.changeColor(l,u);p&&await e.get(be).executeCommand("codexTerminal.rememberCwdColor",{cwd:await c.getSpeculativeCwd?.(),color:p});return p}if(i.groupService.lastAccessedMenu==="inline-tab"){await s(Omt(i,t));return}for(let c of r??[]){let l=n!==0;o=await s(c,o,l),n++}}})';

const vscode127PatchedChangeColorActiveTab =
  'Kr({id:"workbench.action.terminal.changeColorActiveTab",title:wr.changeColor,f1:!1,precondition:Aa.terminalAvailable_and_singularSelection,run:async(i,e,t)=>{let o,n=0,r=Bqe(e);if(typeof t=="string"||t===null){for(let s of i.service.activeInstance?[i.service.activeInstance]:[]){let c=t===null||n!==0;o=await s.changeColor(t??void 0,c),n++}return}async function s(c,l,u){let p=await c?.changeColor(l,u);p&&await e.get(be).executeCommand("codexTerminal.rememberCwdColor",{cwd:await c.getSpeculativeCwd?.(),color:p});return p}if(i.groupService.lastAccessedMenu==="inline-tab"){await s(mft(i,t));return}for(let c of r??[]){let l=n!==0;o=await s(c,o,l),n++}}})';

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

const vscode127PatchedTerminalTabsListHeight =
  'super("TerminalTabsList",e,{getHeight:()=>68,getTemplateId:()=>"terminal.tabs"},[l.createInstance(dft,e,l.createInstance(jc,mO),()=>this.getSelectedElements(),{getHasText:()=>this.hasText,getHasActionBar:()=>this.hasActionBar})],{horizontalScrolling:!1,supportDynamicHeights:!1,selectionNavigation:!0,identityProvider:{getId:b=>b?.instanceId},accessibilityProvider:l.createInstance(uft),smoothScrolling:n.getValue("workbench.list.smoothScrolling"),multipleSelectionSupport:!0,paddingBottom:68,dnd:l.createInstance(pft),openOnSingleClick:!0},t,o,n,l)';

function terminalTabsListHeightFixture(marker) {
  return `class Vce extends ml{constructor(e,t,o,n,r,s,c,l,u,p,m,g,f){${marker};this._configurationService=n}}`;
}

function patchedTabsEmptyAreaMarkers() {
  return [
    vscode127PatchedTabsEmptyDoubleClick,
    vscode127PatchedTabsEmptyClick,
    `${vscode127PatchedTabsNativeEmptyClick}return}))`,
    terminalTabsListHeightFixture(vscode127PatchedTerminalTabsListHeight),
  ];
}

function terminalGroupsFixture({
  unsplitMarker = patchedUnsplit,
  createGroupMarker = patchedCreateGroup,
} = {}) {
  return [
    'class TerminalGroups {',
    createGroupMarker,
    unsplitMarker,
    '}',
  ];
}

test('patch script applies terminal order and programmatic active-tab color patches', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-terminal-patch-test-'));
  const workbenchPath = path.join(tmpDir, 'workbench.desktop.main.js');
  const source = [
    ...terminalGroupsFixture({
      unsplitMarker: originalUnsplit,
      createGroupMarker: originalCreateGroup,
    }),
    'function Kr(){}',
    'const Ir={changeColor:""};',
    'const Ra={terminalAvailable_and_singularSelection:true};',
    'function Omt(){}',
    'function EGe(){return[]}',
    originalChangeColor,
    originalChangeColorActiveTab,
    ...patchedTabsEmptyAreaMarkers(),
  ].join('\n');
  fs.writeFileSync(workbenchPath, source);

  const result = runPatchScript({ workbenchPath, tmpDir });

  assert.equal(result.status, 0, result.stderr);
  const nextSource = fs.readFileSync(workbenchPath, 'utf8');
  assert.match(nextSource, /Patched by codex-vscode-terminal-tools/);
  assert.equal(nextSource.includes(patchedUnsplit), true);
  assert.equal(nextSource.includes(patchedCreateGroup), true);
  assert.equal(nextSource.includes(patchedChangeColor), true);
  assert.equal(nextSource.includes(patchedChangeColorActiveTab), true);
  assert.equal(nextSource.includes('for(let s of i.service.activeInstance?[i.service.activeInstance]:[])'), true);
  assert.equal(nextSource.includes('codexTerminal.rememberCwdColor'), true);
  assert.equal(nextSource.includes('codexTerminal.flashActiveTerminalTab'), true);
  assert.equal(nextSource.includes('codex-terminal-tab-highlight-flash'), true);
});

test('patch script can add color patch when terminal order patch is already applied', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-terminal-patch-test-'));
  const workbenchPath = path.join(tmpDir, 'workbench.desktop.main.js');
  const source = [
    ...terminalGroupsFixture(),
    'function Kr(){}',
    'const Ir={changeColor:""};',
    'const Ra={terminalAvailable_and_singularSelection:true};',
    'function Omt(){}',
    'function EGe(){return[]}',
    originalChangeColor,
    originalChangeColorActiveTab,
    ...patchedTabsEmptyAreaMarkers(),
  ].join('\n');
  fs.writeFileSync(workbenchPath, source);

  const result = runPatchScript({ workbenchPath, tmpDir });

  assert.equal(result.status, 0, result.stderr);
  const nextSource = fs.readFileSync(workbenchPath, 'utf8');
  assert.equal(nextSource.includes(patchedUnsplit), true);
  assert.equal(nextSource.includes(patchedChangeColor), true);
  assert.equal(nextSource.includes(patchedChangeColorActiveTab), true);
});

test('patch script supports VS Code 1.127 terminal color markers', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-terminal-patch-test-'));
  const workbenchPath = path.join(tmpDir, 'workbench.desktop.main.js');
  const source = [
    ...terminalGroupsFixture({
      unsplitMarker: originalUnsplit,
      createGroupMarker: originalCreateGroup,
    }),
    'function Kr(){}',
    'const wr={changeColor:""};',
    'const Aa={terminalAvailable:true,terminalAvailable_and_singularSelection:true};',
    'function mft(){}',
    'function Bqe(){return[]}',
    vscode127OriginalChangeColor,
    vscode127OriginalChangeColorActiveTab,
    ...patchedTabsEmptyAreaMarkers(),
  ].join('\n');
  fs.writeFileSync(workbenchPath, source);

  const result = runPatchScript({ workbenchPath, tmpDir });

  assert.equal(result.status, 0, result.stderr);
  const nextSource = fs.readFileSync(workbenchPath, 'utf8');
  assert.equal(nextSource.includes(patchedUnsplit), true);
  assert.equal(nextSource.includes(patchedCreateGroup), true);
  assert.equal(nextSource.includes(vscode127PatchedChangeColor), true);
  assert.equal(nextSource.includes(vscode127PatchedChangeColorActiveTab), true);
  assert.equal(nextSource.includes('title:Ir.changeColor'), false);
  assert.equal(nextSource.includes('Omt(i,t)'), false);
  assert.equal(nextSource.includes('EGe(e)'), false);
  assert.equal(nextSource.includes('codexTerminal.flashActiveTerminalTab'), true);
});

test('patch script adds terminal tab highlight command to already patched workbench', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-terminal-patch-test-'));
  const workbenchPath = path.join(tmpDir, 'workbench.desktop.main.js');
  const source = [
    ...terminalGroupsFixture(),
    'function Kr(){}',
    'const Ir={changeColor:""};',
    'const Ra={terminalAvailable:true,terminalAvailable_and_singularSelection:true};',
    'function Omt(){}',
    'function EGe(){return[]}',
    patchedChangeColor,
    patchedChangeColorActiveTab,
    ...patchedTabsEmptyAreaMarkers(),
  ].join('\n');
  fs.writeFileSync(workbenchPath, source);

  const result = runPatchScript({ workbenchPath, tmpDir });

  assert.equal(result.status, 0, result.stderr);
  const nextSource = fs.readFileSync(workbenchPath, 'utf8');
  assert.equal(nextSource.includes(patchedChangeColorActiveTab), true);
  assert.equal(nextSource.includes('codexTerminal.flashActiveTerminalTab'), true);
  assert.equal(nextSource.includes('codex-terminal-tab-highlight-flash'), true);
});

test('patch script supports VS Code 1.127 terminal tab empty-area focus markers', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-terminal-patch-test-'));
  const workbenchPath = path.join(tmpDir, 'workbench.desktop.main.js');
  const source = [
    ...terminalGroupsFixture(),
    'function Kr(){}',
    'const wr={changeColor:""};',
    'const Aa={terminalAvailable:true,terminalAvailable_and_singularSelection:true};',
    'function mft(){}',
    'function Bqe(){return[]}',
    vscode127PatchedChangeColor,
    vscode127PatchedChangeColorActiveTab,
    vscode127OriginalTabsEmptyDoubleClick,
    vscode127OriginalTabsEmptyClick,
    `${vscode127OriginalTabsNativeEmptyClick}return}))`,
    terminalTabsListHeightFixture(vscode127OriginalTerminalTabsListHeight),
  ].join('\n');
  fs.writeFileSync(workbenchPath, source);

  const result = runPatchScript({ workbenchPath, tmpDir });

  assert.equal(result.status, 0, result.stderr);
  const nextSource = fs.readFileSync(workbenchPath, 'utf8');
  assert.equal(nextSource.includes(vscode127PatchedTabsEmptyDoubleClick), true);
  assert.equal(nextSource.includes(vscode127PatchedTabsEmptyClick), true);
  assert.equal(nextSource.includes(vscode127PatchedTabsNativeEmptyClick), true);
  assert.equal(nextSource.includes(vscode127PatchedTerminalTabsListHeight), true);
  assert.equal(nextSource.includes('createTerminal({location:1});this._terminalGroupService.setActiveInstance(S)'), false);
});

test('patch script supports VS Code 1.127 multi-line terminal tab row height marker', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-terminal-patch-test-'));
  const workbenchPath = path.join(tmpDir, 'workbench.desktop.main.js');
  const source = [
    ...terminalGroupsFixture(),
    'function Kr(){}',
    'const wr={changeColor:""};',
    'const Aa={terminalAvailable:true,terminalAvailable_and_singularSelection:true};',
    'function mft(){}',
    'function Bqe(){return[]}',
    vscode127PatchedChangeColor,
    vscode127PatchedChangeColorActiveTab,
    vscode127PatchedTabsEmptyDoubleClick,
    vscode127PatchedTabsEmptyClick,
    `${vscode127PatchedTabsNativeEmptyClick}return}))`,
    terminalTabsListHeightFixture(vscode127OriginalTerminalTabsListHeight),
  ].join('\n');
  fs.writeFileSync(workbenchPath, source);

  const result = runPatchScript({ workbenchPath, tmpDir });

  assert.equal(result.status, 0, result.stderr);
  const nextSource = fs.readFileSync(workbenchPath, 'utf8');
  assert.equal(nextSource.includes(vscode127PatchedTerminalTabsListHeight), true);
  assert.equal(nextSource.includes('getHeight:()=>22'), false);
  assert.equal(nextSource.includes('paddingBottom:22'), false);
});

test('patch script upgrades the previous 44px terminal tab row height', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-terminal-patch-test-'));
  const workbenchPath = path.join(tmpDir, 'workbench.desktop.main.js');
  const source = [
    ...terminalGroupsFixture(),
    'function Kr(){}',
    'const wr={changeColor:""};',
    'const Aa={terminalAvailable:true,terminalAvailable_and_singularSelection:true};',
    'function mft(){}',
    'function Bqe(){return[]}',
    vscode127PatchedChangeColor,
    vscode127PatchedChangeColorActiveTab,
    vscode127PatchedTabsEmptyDoubleClick,
    vscode127PatchedTabsEmptyClick,
    `${vscode127PatchedTabsNativeEmptyClick}return}))`,
    terminalTabsListHeightFixture(vscode127LegacyPatchedTerminalTabsListHeight),
  ].join('\n');
  fs.writeFileSync(workbenchPath, source);

  const result = runPatchScript({ workbenchPath, tmpDir });

  assert.equal(result.status, 0, result.stderr);
  const nextSource = fs.readFileSync(workbenchPath, 'utf8');
  assert.equal(nextSource.includes(vscode127LegacyPatchedTerminalTabsListHeight), false);
  assert.equal(nextSource.includes(vscode127PatchedTerminalTabsListHeight), true);
});

test('patch script upgrades the previous 48px terminal tab row height', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-terminal-patch-test-'));
  const workbenchPath = path.join(tmpDir, 'workbench.desktop.main.js');
  const legacy48 =
    'super("TerminalTabsList",e,{getHeight:()=>48,getTemplateId:()=>"terminal.tabs"},[l.createInstance(dft,e,l.createInstance(jc,mO),()=>this.getSelectedElements(),{getHasText:()=>this.hasText,getHasActionBar:()=>this.hasActionBar})],{horizontalScrolling:!1,supportDynamicHeights:!1,selectionNavigation:!0,identityProvider:{getId:b=>b?.instanceId},accessibilityProvider:l.createInstance(uft),smoothScrolling:n.getValue("workbench.list.smoothScrolling"),multipleSelectionSupport:!0,paddingBottom:48,dnd:l.createInstance(pft),openOnSingleClick:!0},t,o,n,l)';
  const source = [
    ...terminalGroupsFixture(),
    'function Kr(){}',
    'const wr={changeColor:""};',
    'const Aa={terminalAvailable:true,terminalAvailable_and_singularSelection:true};',
    'function mft(){}',
    'function Bqe(){return[]}',
    vscode127PatchedChangeColor,
    vscode127PatchedChangeColorActiveTab,
    vscode127PatchedTabsEmptyDoubleClick,
    vscode127PatchedTabsEmptyClick,
    `${vscode127PatchedTabsNativeEmptyClick}return}))`,
    terminalTabsListHeightFixture(legacy48),
  ].join('\n');
  fs.writeFileSync(workbenchPath, source);

  const result = runPatchScript({ workbenchPath, tmpDir });

  assert.equal(result.status, 0, result.stderr);
  const nextSource = fs.readFileSync(workbenchPath, 'utf8');
  assert.equal(nextSource.includes(legacy48), false);
  assert.equal(nextSource.includes(vscode127PatchedTerminalTabsListHeight), true);
});

test('patch script upgrades the previous 64px terminal tab row height', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-terminal-patch-test-'));
  const workbenchPath = path.join(tmpDir, 'workbench.desktop.main.js');
  const legacy64 =
    'super("TerminalTabsList",e,{getHeight:()=>64,getTemplateId:()=>"terminal.tabs"},[l.createInstance(dft,e,l.createInstance(jc,mO),()=>this.getSelectedElements(),{getHasText:()=>this.hasText,getHasActionBar:()=>this.hasActionBar})],{horizontalScrolling:!1,supportDynamicHeights:!1,selectionNavigation:!0,identityProvider:{getId:b=>b?.instanceId},accessibilityProvider:l.createInstance(uft),smoothScrolling:n.getValue("workbench.list.smoothScrolling"),multipleSelectionSupport:!0,paddingBottom:64,dnd:l.createInstance(pft),openOnSingleClick:!0},t,o,n,l)';
  const source = [
    ...terminalGroupsFixture(),
    'function Kr(){}',
    'const wr={changeColor:""};',
    'const Aa={terminalAvailable:true,terminalAvailable_and_singularSelection:true};',
    'function mft(){}',
    'function Bqe(){return[]}',
    vscode127PatchedChangeColor,
    vscode127PatchedChangeColorActiveTab,
    vscode127PatchedTabsEmptyDoubleClick,
    vscode127PatchedTabsEmptyClick,
    `${vscode127PatchedTabsNativeEmptyClick}return}))`,
    terminalTabsListHeightFixture(legacy64),
  ].join('\n');
  fs.writeFileSync(workbenchPath, source);

  const result = runPatchScript({ workbenchPath, tmpDir });

  assert.equal(result.status, 0, result.stderr);
  const nextSource = fs.readFileSync(workbenchPath, 'utf8');
  assert.equal(nextSource.includes(legacy64), false);
  assert.equal(nextSource.includes(vscode127PatchedTerminalTabsListHeight), true);
});

test('patch script upgrades the previous programmatic color patch', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-terminal-patch-test-'));
  const workbenchPath = path.join(tmpDir, 'workbench.desktop.main.js');
  const source = [
    ...terminalGroupsFixture(),
    'function Kr(){}',
    'const Ir={changeColor:""};',
    'const Ra={terminalAvailable_and_singularSelection:true};',
    'function Omt(){}',
    'function EGe(){return[]}',
    originalChangeColor,
    legacyPatchedChangeColorActiveTab,
    ...patchedTabsEmptyAreaMarkers(),
  ].join('\n');
  fs.writeFileSync(workbenchPath, source);

  const result = runPatchScript({ workbenchPath, tmpDir });

  assert.equal(result.status, 0, result.stderr);
  const nextSource = fs.readFileSync(workbenchPath, 'utf8');
  assert.equal(nextSource.includes(legacyPatchedChangeColorActiveTab), false);
  assert.equal(nextSource.includes(patchedChangeColor), true);
  assert.equal(nextSource.includes(patchedChangeColorActiveTab), true);
});

test('patch script upgrades selected-tab fallback color patch to active-terminal-only', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-terminal-patch-test-'));
  const workbenchPath = path.join(tmpDir, 'workbench.desktop.main.js');
  const source = [
    ...terminalGroupsFixture(),
    'function Kr(){}',
    'const Ir={changeColor:""};',
    'const Ra={terminalAvailable_and_singularSelection:true};',
    'function Omt(){}',
    'function EGe(){return[]}',
    originalChangeColor,
    selectedFallbackPatchedChangeColorActiveTab,
    ...patchedTabsEmptyAreaMarkers(),
  ].join('\n');
  fs.writeFileSync(workbenchPath, source);

  const result = runPatchScript({ workbenchPath, tmpDir });

  assert.equal(result.status, 0, result.stderr);
  const nextSource = fs.readFileSync(workbenchPath, 'utf8');
  assert.equal(nextSource.includes(selectedFallbackPatchedChangeColorActiveTab), false);
  assert.equal(nextSource.includes(patchedChangeColor), true);
  assert.equal(nextSource.includes(patchedChangeColorActiveTab), true);
});

test('patch script records manual colors from the generic color command', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-terminal-patch-test-'));
  const workbenchPath = path.join(tmpDir, 'workbench.desktop.main.js');
  const source = [
    ...terminalGroupsFixture(),
    'function Kr(){}',
    'const Ir={changeColor:""};',
    'const Ra={terminalAvailable:true,terminalAvailable_and_singularSelection:true};',
    'function Omt(){}',
    'function EGe(){return[]}',
    originalChangeColor,
    patchedChangeColorActiveTab,
    ...patchedTabsEmptyAreaMarkers(),
  ].join('\n');
  fs.writeFileSync(workbenchPath, source);

  const result = runPatchScript({ workbenchPath, tmpDir });

  assert.equal(result.status, 0, result.stderr);
  const nextSource = fs.readFileSync(workbenchPath, 'utf8');
  assert.equal(nextSource.includes(originalChangeColor), false);
  assert.equal(nextSource.includes(patchedChangeColor), true);
});

test('patch script disables Claude Code editor title open buttons', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-terminal-patch-test-'));
  const workbenchPath = path.join(tmpDir, 'workbench.desktop.main.js');
  const claudePackagePath = path.join(tmpDir, 'claude-package.json');
  const source = [
    ...terminalGroupsFixture(),
    'function Kr(){}',
    'const Ir={changeColor:""};',
    'const Ra={terminalAvailable:true,terminalAvailable_and_singularSelection:true};',
    'function Omt(){}',
    'function EGe(){return[]}',
    patchedChangeColor,
    patchedChangeColorActiveTab,
    ...patchedTabsEmptyAreaMarkers(),
  ].join('\n');
  fs.writeFileSync(workbenchPath, source);
  fs.writeFileSync(
    claudePackagePath,
    JSON.stringify(
      {
        contributes: {
          menus: {
            'editor/title': [
              {
                command: 'claude-vscode.acceptProposedDiff',
                when: 'claude-vscode.viewingProposedDiff',
                group: 'navigation',
              },
              {
                command: 'claude-vscode.editor.openLast',
                when: '!config.claudeCode.useTerminal',
                group: 'navigation',
              },
              {
                command: 'claude-vscode.terminal.open',
                when: 'config.claudeCode.useTerminal',
                group: 'navigation',
              },
            ],
          },
        },
      },
      null,
      2,
    ),
  );

  const result = runPatchScript({
    workbenchPath,
    tmpDir,
    env: {
      VSCODE_CLAUDE_EXTENSION_PACKAGE: claudePackagePath,
    },
  });

  assert.equal(result.status, 0, result.stderr);
  const claudePackage = JSON.parse(fs.readFileSync(claudePackagePath, 'utf8'));
  const titleMenu = claudePackage.contributes.menus['editor/title'];
  assert.deepEqual(titleMenu, [
    {
      command: 'claude-vscode.acceptProposedDiff',
      when: 'claude-vscode.viewingProposedDiff',
      group: 'navigation',
    },
    {
      command: 'claude-vscode.editor.openLast',
      when: 'false',
      group: 'navigation',
    },
    {
      command: 'claude-vscode.terminal.open',
      when: 'false',
      group: 'navigation',
    },
  ]);
});
