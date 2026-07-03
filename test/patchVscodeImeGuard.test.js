const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const scriptPath = path.join(__dirname, '..', 'scripts', 'patch-vscode-ime-guard.js');

const originalDispatch =
  '_dispatch(e,t){return this._doDispatch(this.resolveKeyboardEvent(e),t,!1)}';

const legacyPatchedDispatch =
  '_dispatch(e,t){let o=this.resolveKeyboardEvent(e);if(globalThis.__codexVscodeImeGuard?.defer?.(e,t,()=>this._doDispatch(o,t,!1)))return!0;return this._doDispatch(o,t,!1)}';

const patchedDispatch =
  '_dispatch(e,t){let o=this.resolveKeyboardEvent(e),n=globalThis.__codexVscodeImeGuard?.defer?.(e,t,()=>this._doDispatch(o,t,!1));return n!==void 0?n:this._doDispatch(o,t,!1)}';

const originalTerminalKeyHandler =
  't.raw.attachCustomKeyEventHandler(n=>{if(this._isExiting)return!1;let r=new di(n),s=this._keybindingService.softDispatch(r,r.target),c=s.kind===1&&this._terminalConfigurationService.config.allowChords&&n.key!=="Escape";return this._keybindingService.inChordMode||c||!this._terminalConfigurationService.config.sendKeybindingsToShell&&s.kind===2&&s.commandId&&(n.metaKey||this._terminalConfigurationService.shouldCommandSkipShell(s.commandId))?(n.preventDefault(),!1):this._terminalConfigurationService.config.allowMnemonics&&!et&&n.altKey||eR.getTabFocusMode()&&n.key==="Tab"?!1:n.key==="Tab"&&n.shiftKey?(n.preventDefault(),!0):!(ni&&n.altKey&&n.key==="F4"&&!n.ctrlKey||!Mf.clipboard.readText&&n.key==="v"&&n.ctrlKey)}';

const legacyPatchedTerminalKeyHandler =
  't.raw.attachCustomKeyEventHandler(n=>{if(globalThis.__codexVscodeImeGuard?.suppressTerminalKey?.(n))return!1;if(this._isExiting)return!1;let r=new di(n),s=this._keybindingService.softDispatch(r,r.target),c=s.kind===1&&this._terminalConfigurationService.config.allowChords&&n.key!=="Escape";return this._keybindingService.inChordMode||c||!this._terminalConfigurationService.config.sendKeybindingsToShell&&s.kind===2&&s.commandId&&(n.metaKey||this._terminalConfigurationService.shouldCommandSkipShell(s.commandId))?(n.preventDefault(),!1):this._terminalConfigurationService.config.allowMnemonics&&!et&&n.altKey||eR.getTabFocusMode()&&n.key==="Tab"?!1:n.key==="Tab"&&n.shiftKey?(n.preventDefault(),!0):!(ni&&n.altKey&&n.key==="F4"&&!n.ctrlKey||!Mf.clipboard.readText&&n.key==="v"&&n.ctrlKey)}';

const patchedTerminalKeyHandler =
  't.raw.attachCustomKeyEventHandler(n=>{if(globalThis.__codexVscodeImeGuard?.suppressTerminalKey?.(n,()=>this.sendText("\\x1B\\r",!1)))return!1;if(this._isExiting)return!1;let r=new di(n),s=this._keybindingService.softDispatch(r,r.target),c=s.kind===1&&this._terminalConfigurationService.config.allowChords&&n.key!=="Escape";return this._keybindingService.inChordMode||c||!this._terminalConfigurationService.config.sendKeybindingsToShell&&s.kind===2&&s.commandId&&(n.metaKey||this._terminalConfigurationService.shouldCommandSkipShell(s.commandId))?(n.preventDefault(),!1):this._terminalConfigurationService.config.allowMnemonics&&!et&&n.altKey||eR.getTabFocusMode()&&n.key==="Tab"?!1:n.key==="Tab"&&n.shiftKey?(n.preventDefault(),!0):!(ni&&n.altKey&&n.key==="F4"&&!n.ctrlKey||!Mf.clipboard.readText&&n.key==="v"&&n.ctrlKey)}';

const originalSendSequenceCall = 's.sendText(m,!1)';

const patchedSendSequenceCall =
  'globalThis.__codexVscodeImeGuard?.queueTerminalSequence?.(m,()=>s.sendText(m,!1))??s.sendText(m,!1)';

const legacyImeGuardSource =
  '/* Codex VS Code IME guard patch. Reapply with patch-vscode-ime-guard. */\n' +
  'globalThis.__codexVscodeImeGuard||(globalThis.__codexVscodeImeGuard=(()=>{let e=!1,t=null,o=0;function n(a){let i=a?.ownerDocument?.defaultView??globalThis;return i.document??document}function r(a){return a?.key==="Enter"&&a.shiftKey&&!a.ctrlKey&&!a.altKey&&!a.metaKey||a?.metaKey&&!a.ctrlKey&&!a.altKey&&["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"].includes(a.key)}function s(a){return e||a?.isComposing||a?.key==="Process"||a?.keyCode===229}function c(a,i,l){let u=a?.browserEvent;if(!u||!r(u)||!s(u))return!1;let p=Date.now();if(t&&p-o<200)return u.preventDefault?.(),u.stopImmediatePropagation?.(),!0;o=p;u.preventDefault?.(),u.stopImmediatePropagation?.();let m=n(u.target),g=m.activeElement,f=!1,v=()=>{if(f)return;f=!0,t=null;setTimeout(()=>{try{typeof l=="function"&&l()}catch(b){console.error("[codex-vscode-ime-guard] deferred keybinding failed",b)}},0)};t=v;try{m.addEventListener("compositionend",v,{capture:!0,once:!0})}catch{}setTimeout(v,90);try{g?.blur?.(),setTimeout(()=>{try{g?.focus?.({preventScroll:!0})}catch{try{g?.focus?.()}catch{}}},0)}catch{}return!0}function l(a){try{a.addEventListener("compositionstart",()=>{e=!0},!0),a.addEventListener("compositionend",()=>{e=!1},!0)}catch{}}try{l(globalThis),globalThis.addEventListener?.("pagehide",()=>{e=!1,t=null},!0)}catch{}return{defer:c}})());\n';

const v2ImeGuardSource =
  '/* Codex VS Code IME guard patch. Reapply with patch-vscode-ime-guard. */\n' +
  'globalThis.__codexVscodeImeGuard=(()=>{let e=!1,t=null,o=0;function n(a){let i=a?.ownerDocument?.defaultView??globalThis;return i.document??document}function r(a){return a?.key==="Enter"&&a.shiftKey&&!a.ctrlKey&&!a.altKey&&!a.metaKey?"enter":a?.metaKey&&!a.ctrlKey&&!a.altKey&&["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"].includes(a.key)?"move":""}function s(a){return e||a?.isComposing||a?.key==="Process"||a?.keyCode===229}function c(a,i,l){let u=a?.browserEvent,p=r(u);if(!u||!p||!s(u))return;if(p==="enter")return!1;let m=Date.now();if(t&&m-o<200)return u.preventDefault?.(),u.stopImmediatePropagation?.(),!0;o=m;u.preventDefault?.(),u.stopImmediatePropagation?.();let g=n(u.target),f=g.activeElement,v=!1,b=()=>{if(v)return;v=!0,t=null;setTimeout(()=>{try{typeof l=="function"&&l()}catch(S){console.error("[codex-vscode-ime-guard] deferred keybinding failed",S)}},0)};t=b;try{g.addEventListener("compositionend",b,{capture:!0,once:!0})}catch{}setTimeout(b,90);try{f?.blur?.(),setTimeout(()=>{try{f?.focus?.({preventScroll:!0})}catch{try{f?.focus?.()}catch{}}},0)}catch{}return!0}function l(a){try{a.addEventListener("compositionstart",()=>{e=!0},!0),a.addEventListener("compositionend",()=>{e=!1},!0)}catch{}}try{l(globalThis),globalThis.addEventListener?.("pagehide",()=>{e=!1,t=null},!0)}catch{}return{defer:c}})();\n';

const v3ImeGuardSource =
  '/* Codex VS Code IME guard patch. Reapply with patch-vscode-ime-guard. */\n' +
  'globalThis.__codexVscodeImeGuard=(()=>{let e=!1,t=null,o=0;function n(a){let i=a?.ownerDocument?.defaultView??globalThis;return i.document??document}function r(a){return a?.key==="Enter"&&a.shiftKey&&!a.ctrlKey&&!a.altKey&&!a.metaKey?"enter":a?.metaKey&&!a.ctrlKey&&!a.altKey&&["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"].includes(a.key)?"move":""}function s(a){return e||a?.isComposing||a?.key==="Process"||a?.keyCode===229}function c(a,i,l){let u=a?.browserEvent,p=r(u);if(!u||!p||!s(u))return;let m=Date.now();if(t&&m-o<200)return u.preventDefault?.(),u.stopImmediatePropagation?.(),!0;o=m;u.preventDefault?.(),u.stopImmediatePropagation?.();let g=n(u.target),f=g.activeElement,v=!1,b=()=>{if(v)return;v=!0,t=null;setTimeout(()=>{try{typeof l=="function"&&l()}catch(S){console.error("[codex-vscode-ime-guard] deferred keybinding failed",S)}},0)};t=b;try{g.addEventListener("compositionend",b,{capture:!0,once:!0})}catch{}if(p==="enter")return setTimeout(()=>{t===b&&(t=null)},500),!0;setTimeout(b,90);try{f?.blur?.(),setTimeout(()=>{try{f?.focus?.({preventScroll:!0})}catch{try{f?.focus?.()}catch{}}},0)}catch{}return!0}function l(a){try{a.addEventListener("compositionstart",()=>{e=!0},!0),a.addEventListener("compositionend",()=>{e=!1},!0)}catch{}}try{l(globalThis),globalThis.addEventListener?.("pagehide",()=>{e=!1,t=null},!0)}catch{}return{defer:c}})();\n';

const v4ImeGuardSource =
  '/* Codex VS Code IME guard patch. Reapply with patch-vscode-ime-guard. */\n' +
  'globalThis.__codexVscodeImeGuard=(()=>{let e=!1,t=null,o=0;function n(a){let i=a?.ownerDocument?.defaultView??globalThis;return i.document??document}function r(a){return a?.key==="Enter"&&a.shiftKey&&!a.ctrlKey&&!a.altKey&&!a.metaKey?"enter":a?.metaKey&&!a.ctrlKey&&!a.altKey&&["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"].includes(a.key)?"move":""}function s(a){return e||a?.isComposing||a?.key==="Process"||a?.keyCode===229}function c(a,i,l){let u=a?.browserEvent,p=r(u);if(!u||!p||!s(u))return;let m=Date.now();if(t&&m-o<200)return u.preventDefault?.(),u.stopImmediatePropagation?.(),!0;o=m;u.preventDefault?.(),u.stopImmediatePropagation?.();let g=n(u.target),f=g.activeElement,v=!1,b=()=>{if(v)return;v=!0,t=null;setTimeout(()=>{try{typeof l=="function"&&l()}catch(S){console.error("[codex-vscode-ime-guard] deferred keybinding failed",S)}},0)};t=b;try{g.addEventListener("compositionend",b,{capture:!0,once:!0})}catch{}if(p==="enter")return setTimeout(()=>{t===b&&(t=null)},500),!0;setTimeout(b,90);try{f?.blur?.(),setTimeout(()=>{try{f?.focus?.({preventScroll:!0})}catch{try{f?.focus?.()}catch{}}},0)}catch{}return!0}function h(a){let i=r(a);i==="enter"&&s(a)&&!a.defaultPrevented&&a.preventDefault?.()}function l(a){try{a.addEventListener("compositionstart",()=>{e=!0},!0),a.addEventListener("compositionend",()=>{e=!1},!0),a.addEventListener("keydown",h,!0)}catch{}}try{l(globalThis),globalThis.addEventListener?.("pagehide",()=>{e=!1,t=null},!0)}catch{}return{defer:c}})();\n';

const v5ImeGuardSource =
  '/* Codex VS Code IME guard patch. Reapply with patch-vscode-ime-guard. */\n' +
  'globalThis.__codexVscodeImeGuard=(()=>{let e=!1,t=null,o=0;function n(a){let i=a?.ownerDocument?.defaultView??globalThis;return i.document??document}function r(a){return a?.key==="Enter"&&a.shiftKey&&!a.ctrlKey&&!a.altKey&&!a.metaKey?"enter":a?.metaKey&&!a.ctrlKey&&!a.altKey&&["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"].includes(a.key)?"move":""}function s(a){return e||a?.isComposing||a?.key==="Process"||a?.keyCode===229}function c(a,i,l){let u=a?.browserEvent,p=r(u);if(!u||!p||!s(u))return;let m=Date.now();if(t&&m-o<200)return u.preventDefault?.(),u.stopImmediatePropagation?.(),!0;o=m;u.preventDefault?.(),u.stopImmediatePropagation?.();let g=n(u.target),f=g.activeElement,v=!1,b=()=>{if(v)return;v=!0,t=null;setTimeout(()=>{try{typeof l=="function"&&l()}catch(S){console.error("[codex-vscode-ime-guard] deferred keybinding failed",S)}},0)};t=b;try{g.addEventListener("compositionend",b,{capture:!0,once:!0})}catch{}if(p==="enter")return setTimeout(()=>{t===b&&(t=null)},500),!0;setTimeout(b,90);try{f?.blur?.(),setTimeout(()=>{try{f?.focus?.({preventScroll:!0})}catch{try{f?.focus?.()}catch{}}},0)}catch{}return!0}function h(a){let i=r(a);return i==="enter"&&s(a)}function l(a){h(a)&&!a.defaultPrevented&&a.preventDefault?.()}function u(a){return h(a)?(a.preventDefault?.(),!0):!1}function p(a){try{a.addEventListener("compositionstart",()=>{e=!0},!0),a.addEventListener("compositionend",()=>{e=!1},!0),a.addEventListener("keydown",l,!0)}catch{}}try{p(globalThis),globalThis.addEventListener?.("pagehide",()=>{e=!1,t=null},!0)}catch{}return{defer:c,suppressTerminalKey:u}})();\n';

const v6ImeGuardSource =
  '/* Codex VS Code IME guard patch. Reapply with patch-vscode-ime-guard. */\n' +
  'globalThis.__codexVscodeImeGuard=(()=>{let e=!1,t=null,o=0,m=0;function n(a){let i=a?.ownerDocument?.defaultView??globalThis;return i.document??document}function r(a){return a?.key==="Enter"&&a.shiftKey&&!a.ctrlKey&&!a.altKey&&!a.metaKey?"enter":a?.metaKey&&!a.ctrlKey&&!a.altKey&&["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"].includes(a.key)?"move":""}function s(a){return e||a?.isComposing||a?.key==="Process"||a?.keyCode===229}function c(a){return s(a)||Date.now()-m<180}function l(a,i,u){let p=a?.browserEvent,g=r(p);if(!p||!g||!c(p))return;let f=Date.now();if(t&&f-o<200)return p.preventDefault?.(),p.stopImmediatePropagation?.(),!0;o=f,p.preventDefault?.(),p.stopImmediatePropagation?.();let v=n(p.target),b=v.activeElement,S=!1,y=()=>{if(S)return;S=!0,t=null;setTimeout(()=>{try{typeof u=="function"&&u()}catch(T){console.error("[codex-vscode-ime-guard] deferred keybinding failed",T)}},0)};t=y;try{v.addEventListener("compositionend",y,{capture:!0,once:!0})}catch{}if(g==="enter")return s(p)?setTimeout(()=>{t===y&&(t=null)},500):setTimeout(y,80),!0;setTimeout(y,90);try{b?.blur?.(),setTimeout(()=>{try{b?.focus?.({preventScroll:!0})}catch{try{b?.focus?.()}catch{}}},0)}catch{}return!0}function u(a){let i=r(a);return i==="enter"&&c(a)}function p(a){u(a)&&!a.defaultPrevented&&a.preventDefault?.()}function g(a){return u(a)?(a.preventDefault?.(),!0):!1}function f(a){try{a.addEventListener("compositionstart",()=>{e=!0},!0),a.addEventListener("compositionend",()=>{e=!1,m=Date.now()},!0),a.addEventListener("keydown",p,!0)}catch{}}try{f(globalThis),globalThis.addEventListener?.("pagehide",()=>{e=!1,t=null,m=0},!0)}catch{}return{defer:l,suppressTerminalKey:g}})();\n';

const v7ImeGuardSource =
  '/* Codex VS Code IME guard patch. Reapply with patch-vscode-ime-guard. */\n' +
  'globalThis.__codexVscodeImeGuard=(()=>{let e=!1,t=null,o=0,m=0;function n(a){let i=a?.ownerDocument?.defaultView??globalThis;return i.document??document}function r(a){return a?.key==="Enter"&&a.shiftKey&&!a.ctrlKey&&!a.altKey&&!a.metaKey?"enter":a?.metaKey&&!a.ctrlKey&&!a.altKey&&["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"].includes(a.key)?"move":""}function s(a){return e||a?.isComposing||a?.key==="Process"||a?.keyCode===229}function c(a){return s(a)||Date.now()-m<180}function d(a){let i=a?.target;return!!(i?.classList?.contains?.("xterm-helper-textarea")||i?.closest?.(".xterm"))}function l(a,i,u){let p=a?.browserEvent,g=r(p),f=g==="enter"&&d(p);if(!p||!g||!c(p)&&!f)return;let v=Date.now();if(t&&v-o<200)return p.preventDefault?.(),p.stopImmediatePropagation?.(),!0;o=v,p.preventDefault?.(),p.stopImmediatePropagation?.();let b=n(p.target),S=b.activeElement,y=!1,T=()=>{if(y)return;y=!0,t=null;setTimeout(()=>{try{typeof u=="function"&&u()}catch(E){console.error("[codex-vscode-ime-guard] deferred keybinding failed",E)}},0)};t=T;try{b.addEventListener("compositionend",T,{capture:!0,once:!0})}catch{}if(g==="enter")return s(p)?setTimeout(()=>{t===T&&(t=null)},500):setTimeout(T,80),!0;setTimeout(T,90);try{S?.blur?.(),setTimeout(()=>{try{S?.focus?.({preventScroll:!0})}catch{try{S?.focus?.()}catch{}}},0)}catch{}return!0}function u(a){let i=r(a);return i==="enter"&&(c(a)||d(a))}function p(a){u(a)&&!a.defaultPrevented&&a.preventDefault?.()}function g(a){return u(a)?(a.preventDefault?.(),!0):!1}function f(a){try{a.addEventListener("compositionstart",()=>{e=!0},!0),a.addEventListener("compositionend",()=>{e=!1,m=Date.now()},!0),a.addEventListener("keydown",p,!0)}catch{}}try{f(globalThis),globalThis.addEventListener?.("pagehide",()=>{e=!1,t=null,m=0},!0)}catch{}return{defer:l,suppressTerminalKey:g}})();\n';

const v8ImeGuardSource =
  '/* Codex VS Code IME guard patch. Reapply with patch-vscode-ime-guard. */\n' +
  'globalThis.__codexVscodeImeGuard=(()=>{let e=!1,t=null,o=0,m=0,h=0;function n(a){let i=a?.ownerDocument?.defaultView??globalThis;return i.document??document}function r(a){return a?.key==="Enter"&&a.shiftKey&&!a.ctrlKey&&!a.altKey&&!a.metaKey?"enter":a?.metaKey&&!a.ctrlKey&&!a.altKey&&["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"].includes(a.key)?"move":""}function s(a){return e||a?.isComposing||a?.key==="Process"||a?.keyCode===229}function c(a){return s(a)||Date.now()-m<180}function d(a){let i=a?.target;return!!(i?.classList?.contains?.("xterm-helper-textarea")||i?.closest?.(".xterm"))}function l(a,i,u){let p=a?.browserEvent,g=r(p),f=g==="enter"&&d(p);if(!p||!g||!c(p)&&!f)return;if(g==="enter")h=Date.now()+300;let v=Date.now();if(t&&v-o<200)return p.preventDefault?.(),p.stopImmediatePropagation?.(),!0;o=v,p.preventDefault?.(),p.stopImmediatePropagation?.();let b=n(p.target),S=b.activeElement,y=!1,T=()=>{if(y)return;y=!0,t=null;setTimeout(()=>{try{typeof u=="function"&&u()}catch(E){console.error("[codex-vscode-ime-guard] deferred keybinding failed",E)}},0)};t=T;try{b.addEventListener("compositionend",T,{capture:!0,once:!0})}catch{}if(g==="enter")return s(p)?setTimeout(()=>{t===T&&(t=null)},500):setTimeout(T,80),!0;setTimeout(T,90);try{S?.blur?.(),setTimeout(()=>{try{S?.focus?.({preventScroll:!0})}catch{try{S?.focus?.()}catch{}}},0)}catch{}return!0}function u(a){let i=r(a);return i==="enter"&&(c(a)||d(a))}function p(a){u(a)&&!a.defaultPrevented&&(h=Date.now()+300,a.preventDefault?.())}function g(a){return u(a)?(h=Date.now()+300,a.preventDefault?.(),!0):!1}function E(a){Date.now()<h&&(a?.inputType==="insertLineBreak"||a?.data==="\\n")&&(a.preventDefault?.(),a.stopImmediatePropagation?.())}function f(a){try{a.addEventListener("compositionstart",()=>{e=!0},!0),a.addEventListener("compositionend",()=>{e=!1,m=Date.now()},!0),a.addEventListener("keydown",p,!0),a.addEventListener("beforeinput",E,!0)}catch{}}try{f(globalThis),globalThis.addEventListener?.("pagehide",()=>{e=!1,t=null,m=0,h=0},!0)}catch{}return{defer:l,suppressTerminalKey:g}})();\n';

const v9ImeGuardSource =
  '/* Codex VS Code IME guard patch. Reapply with patch-vscode-ime-guard. */\n' +
  'globalThis.__codexVscodeImeGuard=(()=>{let e=!1,t=null,o=0,m=0,h=0;function n(a){let i=a?.ownerDocument?.defaultView??globalThis;return i.document??document}function r(a){return a?.key==="Enter"&&a.shiftKey&&!a.ctrlKey&&!a.altKey&&!a.metaKey?"enter":a?.metaKey&&!a.ctrlKey&&!a.altKey&&["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"].includes(a.key)?"move":""}function s(a){return e||a?.isComposing||a?.key==="Process"||a?.keyCode===229}function c(a){return s(a)||Date.now()-m<180}function d(a){let i=a?.target;return!!(i?.classList?.contains?.("xterm-helper-textarea")||i?.closest?.(".xterm"))}function E(a){try{a?.blur?.(),setTimeout(()=>{try{a?.focus?.({preventScroll:!0})}catch(i){try{a?.focus?.()}catch{}}},30)}catch{}}function l(a,i,u){let p=a?.browserEvent,g=r(p),f=g==="enter"&&d(p);if(!p||!g||!c(p)&&!f)return;if(g==="enter")h=Date.now()+300;let v=Date.now();if(t&&v-o<200)return p.preventDefault?.(),p.stopImmediatePropagation?.(),!0;o=v,p.preventDefault?.(),p.stopImmediatePropagation?.();let b=n(p.target),S=b.activeElement,y=!1,T=()=>{if(y)return;y=!0,t=null;setTimeout(()=>{try{typeof u=="function"&&u()}catch(A){console.error("[codex-vscode-ime-guard] deferred keybinding failed",A)}},0)};t=T;try{b.addEventListener("compositionend",T,{capture:!0,once:!0})}catch{}if(g==="enter")return E(S),setTimeout(T,120),!0;setTimeout(T,90),E(S);return!0}function u(a){let i=r(a);return i==="enter"&&(c(a)||d(a))}function p(a){u(a)&&!a.defaultPrevented&&(h=Date.now()+300,E(n(a.target).activeElement),a.preventDefault?.())}function g(a){return u(a)?(h=Date.now()+300,E(n(a.target).activeElement),a.preventDefault?.(),!0):!1}function A(a){Date.now()<h&&(a?.inputType==="insertLineBreak"||a?.data==="\\n")&&(a.preventDefault?.(),a.stopImmediatePropagation?.())}function f(a){try{a.addEventListener("compositionstart",()=>{e=!0},!0),a.addEventListener("compositionend",()=>{e=!1,m=Date.now()},!0),a.addEventListener("keydown",p,!0),a.addEventListener("beforeinput",A,!0)}catch{}}try{f(globalThis),globalThis.addEventListener?.("pagehide",()=>{e=!1,t=null,m=0,h=0},!0)}catch{}return{defer:l,suppressTerminalKey:g}})();\n';

const v10ImeGuardSource =
  '/* Codex VS Code IME guard patch. Reapply with patch-vscode-ime-guard. */\n' +
  'globalThis.__codexVscodeImeGuard=(()=>{let e=!1,t=null,o=0,m=0,h=0;function n(a){let i=a?.ownerDocument?.defaultView??globalThis;return i.document??document}function r(a){return a?.key==="Enter"&&a.shiftKey&&!a.ctrlKey&&!a.altKey&&!a.metaKey?"enter":a?.metaKey&&!a.ctrlKey&&!a.altKey&&["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"].includes(a.key)?"move":""}function s(a){return e||a?.isComposing||a?.key==="Process"||a?.keyCode===229}function c(a){return s(a)||Date.now()-m<180}function d(a){let i=a?.target;return!!(i?.classList?.contains?.("xterm-helper-textarea")||i?.closest?.(".xterm"))}function l(a,i,u){let p=a?.browserEvent,g=r(p),f=g==="enter"&&d(p);if(!p||!g||g==="enter"&&!f||g!=="enter"&&!c(p))return;if(g==="enter")h=Date.now()+300;let v=Date.now();if(t&&v-o<200)return f||(p.preventDefault?.(),p.stopImmediatePropagation?.()),!0;o=v,f||(p.preventDefault?.(),p.stopImmediatePropagation?.());let b=n(p.target),S=b.activeElement,y=!1,T=()=>{if(y)return;y=!0,t=null;setTimeout(()=>{try{typeof u=="function"&&u()}catch(E){console.error("[codex-vscode-ime-guard] deferred keybinding failed",E)}},0)};t=T;try{b.addEventListener("compositionend",T,{capture:!0,once:!0})}catch{}if(g==="enter")return setTimeout(T,120),!0;setTimeout(T,90);try{S?.blur?.(),setTimeout(()=>{try{S?.focus?.({preventScroll:!0})}catch(E){try{S?.focus?.()}catch{}}},0)}catch{}return!0}function u(a){let i=r(a);return i==="enter"&&d(a)}function p(a){u(a)&&!a.defaultPrevented&&(h=Date.now()+300)}function g(a){return u(a)?(h=Date.now()+300,!0):!1}function E(a){Date.now()<h&&(a?.inputType==="insertLineBreak"||a?.data==="\\n")&&(a.preventDefault?.(),a.stopImmediatePropagation?.())}function f(a){try{a.addEventListener("compositionstart",()=>{e=!0},!0),a.addEventListener("compositionend",()=>{e=!1,m=Date.now()},!0),a.addEventListener("keydown",p,!0),a.addEventListener("beforeinput",E,!0)}catch{}}try{f(globalThis),globalThis.addEventListener?.("pagehide",()=>{e=!1,t=null,m=0,h=0},!0)}catch{}return{defer:l,suppressTerminalKey:g}})();\n';

const v11ImeGuardSource =
  '/* Codex VS Code IME guard patch. Reapply with patch-vscode-ime-guard. */\n' +
  'globalThis.__codexVscodeImeGuard=(()=>{let e=!1,t=null,o=0,m=0,h=0;function n(a){let i=a?.ownerDocument?.defaultView??globalThis;return i.document??document}function r(a){return a?.key==="Enter"&&a.shiftKey&&!a.ctrlKey&&!a.altKey&&!a.metaKey?"enter":a?.metaKey&&!a.ctrlKey&&!a.altKey&&["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"].includes(a.key)?"move":""}function s(a){return e||a?.isComposing||a?.key==="Process"||a?.keyCode===229}function c(a){return s(a)||Date.now()-m<180}function d(a){let i=a?.target;return!!(i?.classList?.contains?.("xterm-helper-textarea")||i?.closest?.(".xterm"))}function y(){m=Date.now()}function l(a,i,u){let p=a?.browserEvent,g=r(p),f=g==="enter"&&d(p);if(!p||!g||g==="enter"&&!f||g!=="enter"&&!c(p))return;if(g==="enter")h=Date.now()+300;let v=Date.now();if(t&&v-o<200)return f||(p.preventDefault?.(),p.stopImmediatePropagation?.()),!0;o=v,f||(p.preventDefault?.(),p.stopImmediatePropagation?.());let b=n(p.target),S=b.activeElement,T=!1,A=()=>{if(T)return;T=!0,t=null;setTimeout(()=>{try{typeof u=="function"&&u()}catch(E){console.error("[codex-vscode-ime-guard] deferred keybinding failed",E)}},0)};t=A;try{b.addEventListener("compositionend",A,{capture:!0,once:!0})}catch{}if(g==="enter")return setTimeout(A,Math.max(120,360-(Date.now()-m))),!0;setTimeout(A,90);try{S?.blur?.(),setTimeout(()=>{try{S?.focus?.({preventScroll:!0})}catch(E){try{S?.focus?.()}catch{}}},0)}catch{}return!0}function u(a){let i=r(a);return i==="enter"&&d(a)}function p(a){u(a)&&!a.defaultPrevented&&(h=Date.now()+300)}function g(a){return u(a)?(h=Date.now()+300,!0):!1}function E(a){Date.now()<h&&(a?.inputType==="insertLineBreak"||a?.data==="\\n")&&(a.preventDefault?.(),a.stopImmediatePropagation?.())}function f(a){try{a.addEventListener("compositionstart",()=>{e=!0,y()},!0),a.addEventListener("compositionupdate",y,!0),a.addEventListener("compositionend",()=>{e=!1,y()},!0),a.addEventListener("input",y,!0),a.addEventListener("keydown",p,!0),a.addEventListener("beforeinput",E,!0)}catch{}}try{f(globalThis),globalThis.addEventListener?.("pagehide",()=>{e=!1,t=null,m=0,h=0},!0)}catch{}return{defer:l,suppressTerminalKey:g}})();\n';

const v12ImeGuardSource =
  '/* Codex VS Code IME guard patch. Reapply with patch-vscode-ime-guard. */\n' +
  'globalThis.__codexVscodeImeGuard=(()=>{let e=!1,t=null,o=0,m=0,h=0;function n(a){let i=a?.ownerDocument?.defaultView??globalThis;return i.document??document}function r(a){return a?.key==="Enter"&&a.shiftKey&&!a.ctrlKey&&!a.altKey&&!a.metaKey?"enter":a?.metaKey&&!a.ctrlKey&&!a.altKey&&["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"].includes(a.key)?"move":""}function s(a){return e||a?.isComposing||a?.key==="Process"||a?.keyCode===229}function c(a){return s(a)||Date.now()-m<180}function d(a){let i=a?.target;return!!(i?.classList?.contains?.("xterm-helper-textarea")||i?.closest?.(".xterm"))}function y(){m=Date.now()}function l(a,i,u){let p=a?.browserEvent,g=r(p),f=g==="enter"&&d(p);if(!p||!g||g==="enter"&&!f||g!=="enter"&&!c(p))return;if(g==="enter")h=Date.now()+300;let v=Date.now();if(t&&v-o<200)return f||(p.preventDefault?.(),p.stopImmediatePropagation?.()),!0;o=v,f||(p.preventDefault?.(),p.stopImmediatePropagation?.());let b=n(p.target),S=b.activeElement,T=!1,A=()=>{if(T)return;T=!0,t=null;setTimeout(()=>{try{typeof u=="function"&&u()}catch(E){console.error("[codex-vscode-ime-guard] deferred keybinding failed",E)}},0)};t=A;try{b.addEventListener("compositionend",A,{capture:!0,once:!0})}catch{}if(g==="enter")return setTimeout(A,Math.max(120,360-(Date.now()-m))),!0;setTimeout(A,90);try{S?.blur?.(),setTimeout(()=>{try{S?.focus?.({preventScroll:!0})}catch(E){try{S?.focus?.()}catch{}}},0)}catch{}return!0}function u(a){let i=r(a);return i==="enter"&&d(a)}function p(a){u(a)&&!a.defaultPrevented&&(h=Date.now()+300)}function g(a){return u(a)?(h=Date.now()+300,!0):!1}function E(a){Date.now()<h&&(a?.inputType==="insertLineBreak"||a?.data==="\\n")&&(a.preventDefault?.(),a.stopImmediatePropagation?.())}function b(a,i){if(a!=="\\x1B\\n"||typeof i!="function")return;h=Date.now()+300;let u=!1,p=Date.now()+1200,g=()=>{if(u)return;let f=Date.now(),v=Math.max(0,360-(f-m));if(!e&&v===0||f>=p){u=!0;try{i()}catch(S){console.error("[codex-vscode-ime-guard] queued terminal sequence failed",S)}return}setTimeout(g,Math.min(v||60,120))};return g(),!0}function f(a){try{a.addEventListener("compositionstart",()=>{e=!0,y()},!0),a.addEventListener("compositionupdate",y,!0),a.addEventListener("compositionend",()=>{e=!1,y()},!0),a.addEventListener("input",y,!0),a.addEventListener("keydown",p,!0),a.addEventListener("beforeinput",E,!0)}catch{}}try{f(globalThis),globalThis.addEventListener?.("pagehide",()=>{e=!1,t=null,m=0,h=0},!0)}catch{}return{defer:l,suppressTerminalKey:g,queueTerminalSequence:b}})();\n';

const v13ImeGuardSource = v12ImeGuardSource.replaceAll('h=Date.now()+300', 'h=Date.now()+1400');

const v14ImeGuardSource = v13ImeGuardSource.replace(
  'function b(a,i){if(a!=="\\x1B\\n"||typeof i!="function")return;h=Date.now()+1400;let u=!1,p=Date.now()+1200,g=()=>{if(u)return;let f=Date.now(),v=Math.max(0,360-(f-m));if(!e&&v===0||f>=p){u=!0;try{i()}catch(S){console.error("[codex-vscode-ime-guard] queued terminal sequence failed",S)}return}setTimeout(g,Math.min(v||60,120))};return g(),!0}',
  'function b(a,i){if(a!=="\\x1B\\n")return;h=Date.now()+1400;return!0}',
);

const v15ImeGuardSource = v14ImeGuardSource.replace(
  'function b(a,i){if(a!=="\\x1B\\n")return;h=Date.now()+1400;return!0}',
  'function b(a,i){if(a==="\\x1B\\n")return h=Date.now()+1400,!0;if(a!=="\\x1B\\r"||typeof i!="function")return;h=Date.now()+1400;let u=!1,p=Date.now()+1200,g=()=>{if(u)return;let f=Date.now(),v=Math.max(0,360-(f-m));if(!e&&v===0||f>=p){u=!0;try{i()}catch(S){console.error("[codex-vscode-ime-guard] queued terminal CR sequence failed",S)}return}setTimeout(g,Math.min(v||60,120))};return g(),!0}',
);

const v16ImeGuardSource = v15ImeGuardSource
  .replace(
    'function E(a){Date.now()<h&&(a?.inputType==="insertLineBreak"||a?.data==="\\n")&&(a.preventDefault?.(),a.stopImmediatePropagation?.())}',
    'function E(a){Date.now()<h&&(a?.inputType==="insertLineBreak"||a?.inputType==="insertParagraph"||a?.data==="\\n"||a?.data==="\\r")&&(a.preventDefault?.(),a.stopImmediatePropagation?.())}function I(a){Date.now()<h&&a?.key==="Enter"&&(a.preventDefault?.(),a.stopImmediatePropagation?.())}',
  )
  .replace(
    'a.addEventListener("beforeinput",E,!0)',
    'a.addEventListener("beforeinput",E,!0),a.addEventListener("keypress",I,!0)',
  );

const v17ImeGuardSource = v16ImeGuardSource
  .replace('let e=!1,t=null,o=0,m=0,h=0;', 'let e=!1,t=null,o=0,m=0,h=0,C="",P=0;')
  .replace(
    'function b(a,i){if(a==="\\x1B\\n")return h=Date.now()+1400,!0;if(a!=="\\x1B\\r"||typeof i!="function")return;h=Date.now()+1400;let u=!1,p=Date.now()+1200,g=()=>{if(u)return;let f=Date.now(),v=Math.max(0,360-(f-m));if(!e&&v===0||f>=p){u=!0;try{i()}catch(S){console.error("[codex-vscode-ime-guard] queued terminal CR sequence failed",S)}return}setTimeout(g,Math.min(v||60,120))};return g(),!0}',
    'function b(a,i){let S=Date.now();if((a==="\\x1B\\n"||a==="\\x1B\\r")&&a===C&&S-P<80)return h=S+1400,!0;if(a==="\\x1B\\n")return C=a,P=S,h=S+1400,!0;if(a!=="\\x1B\\r"||typeof i!="function")return;C=a,P=S,h=S+1400;let u=!1,p=S+1200,g=()=>{if(u)return;let f=Date.now(),v=Math.max(0,360-(f-m));if(!e&&v===0||f>=p){u=!0;try{i()}catch(y){console.error("[codex-vscode-ime-guard] queued terminal CR sequence failed",y)}return}setTimeout(g,Math.min(v||60,120))};return g(),!0}',
  );

const v18ImeGuardSource = v17ImeGuardSource.replace(
  'function g(a){return u(a)?(h=Date.now()+1400,!0):!1}',
  'function g(a,i){if(!u(a))return!1;let S=Date.now();h=S+1400,C="\\x1B\\r",P=S;if(typeof i=="function"){let u=!1,p=S+1200,q=()=>{if(u)return;let f=Date.now(),v=Math.max(0,360-(f-m));if(!e&&v===0||f>=p){u=!0;try{let b=i();b?.catch?.(y=>console.error("[codex-vscode-ime-guard] terminal Shift+Enter sequence failed",y))}catch(y){console.error("[codex-vscode-ime-guard] terminal Shift+Enter sequence failed",y)}return}setTimeout(q,Math.min(v||60,120))};q()}return!0}',
);

function runPatchScript(workbenchPath) {
  return childProcess.spawnSync(process.execPath, [scriptPath], {
    env: {
      ...process.env,
      VSCODE_WORKBENCH_MAIN: workbenchPath,
    },
    encoding: 'utf8',
  });
}

function countOccurrences(source, needle) {
  let count = 0;
  let index = 0;

  while ((index = source.indexOf(needle, index)) !== -1) {
    count += 1;
    index += needle.length;
  }

  return count;
}

function writeWorkbench(source, { includeSendSequence = true } = {}) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-ime-guard-patch-test-'));
  const workbenchPath = path.join(tmpDir, 'workbench.desktop.main.js');
  const workbenchSource =
    includeSendSequence &&
    !source.includes(originalSendSequenceCall) &&
    !source.includes(patchedSendSequenceCall)
      ? `${source}\n${originalSendSequenceCall}`
      : source;
  fs.writeFileSync(workbenchPath, workbenchSource);
  return { tmpDir, workbenchPath };
}

test('patch script applies the IME guard and keybinding dispatch patch', () => {
  const { workbenchPath } = writeWorkbench(
    [
      'class KeybindingService {',
      'resolveKeyboardEvent(e){return e}',
      '_doDispatch(){return true}',
      originalDispatch,
      '}',
      `${originalTerminalKeyHandler})`,
    ].join('\n'),
  );

  const result = runPatchScript(workbenchPath);

  assert.equal(result.status, 0, result.stderr);
  const nextSource = fs.readFileSync(workbenchPath, 'utf8');
  assert.match(nextSource, /Codex VS Code IME guard patch/);
  assert.equal(nextSource.includes(originalDispatch), false);
  assert.equal(nextSource.includes(patchedDispatch), true);
  assert.equal(nextSource.includes('g==="enter"&&!f'), true);
  assert.equal(nextSource.includes('addEventListener("keydown",p,!0)'), true);
  assert.equal(nextSource.includes('function g(a,i){if(!u(a))return!1'), true);
  assert.equal(nextSource.includes('Date.now()-m<180'), true);
  assert.equal(nextSource.includes('setTimeout(T,80)'), false);
  assert.equal(nextSource.includes('Math.max(120,360-(Date.now()-m))'), true);
  assert.equal(nextSource.includes('addEventListener("compositionupdate",y,!0)'), true);
  assert.equal(nextSource.includes('addEventListener("input",y,!0)'), true);
  assert.equal(nextSource.includes('queueTerminalSequence'), true);
  assert.equal(nextSource.includes('a==="\\x1B\\n"'), true);
  assert.equal(nextSource.includes('a!=="\\x1B\\r"'), true);
  assert.equal(nextSource.includes('queued terminal CR sequence failed'), true);
  assert.equal(nextSource.includes('a===C&&S-P<80'), true);
  assert.equal(nextSource.includes('try{i()}'), true);
  assert.equal(
    nextSource.includes('suppressTerminalKey?.(n,()=>this.sendText("\\x1B\\r",!1))'),
    true,
  );
  assert.equal(nextSource.includes('terminal Shift+Enter sequence failed'), true);
  assert.equal(nextSource.includes('C==="\\x1B\\r"&&S-P<80'), true);
  assert.equal(countOccurrences(nextSource, patchedSendSequenceCall), 1);
  assert.equal(nextSource.includes('function E(a){try{a?.blur?.()'), false);
  assert.equal(nextSource.includes('xterm-helper-textarea'), true);
  assert.equal(nextSource.includes('closest?.(".xterm")'), true);
  assert.equal(nextSource.includes('addEventListener("beforeinput",'), true);
  assert.equal(nextSource.includes('insertLineBreak'), true);
  assert.equal(nextSource.includes('insertParagraph'), true);
  assert.equal(nextSource.includes('a?.data==="\\r"'), true);
  assert.equal(nextSource.includes('addEventListener("keypress",I,!0)'), true);
  assert.equal(nextSource.includes('function I(a){Date.now()<h&&a?.key==="Enter"'), true);
  assert.equal(nextSource.includes('Date.now()<h'), true);
  assert.equal(nextSource.includes('function p(a){u(a)&&!a.defaultPrevented&&(h=Date.now()+1400)}'), true);
  assert.equal(nextSource.includes('function u(a){let i=r(a);return i==="enter"&&d(a)}'), true);
  assert.equal(nextSource.includes('suppressTerminalKey'), true);
  assert.equal(nextSource.includes(originalTerminalKeyHandler), false);
  assert.equal(nextSource.includes(patchedTerminalKeyHandler), true);
  assert.equal(nextSource.includes('if(p==="enter")return!1'), false);
});

test('patch script is idempotent once the IME guard is applied', () => {
  const { tmpDir, workbenchPath } = writeWorkbench(
    [
      'class KeybindingService {',
      'resolveKeyboardEvent(e){return e}',
      '_doDispatch(){return true}',
      originalDispatch,
      '}',
      `${originalTerminalKeyHandler})`,
    ].join('\n'),
  );

  const first = runPatchScript(workbenchPath);
  const second = runPatchScript(workbenchPath);

  assert.equal(first.status, 0, first.stderr);
  assert.equal(second.status, 0, second.stderr);
  assert.match(second.stdout, /Already patched/);

  const backups = fs
    .readdirSync(tmpDir)
    .filter((name) => name.includes('.codex-backup-') && name.endsWith('-ime-guard'));
  assert.equal(backups.length, 1);
});

test('patch script can add the helper if dispatch was patched without it', () => {
  const { workbenchPath } = writeWorkbench(
    [
      'class KeybindingService {',
      'resolveKeyboardEvent(e){return e}',
      '_doDispatch(){return true}',
      patchedDispatch,
      '}',
      `${originalTerminalKeyHandler})`,
    ].join('\n'),
  );

  const result = runPatchScript(workbenchPath);

  assert.equal(result.status, 0, result.stderr);
  const nextSource = fs.readFileSync(workbenchPath, 'utf8');
  assert.match(nextSource, /Codex VS Code IME guard patch/);
  assert.equal(nextSource.includes(patchedDispatch), true);
  assert.equal(nextSource.includes(patchedTerminalKeyHandler), true);
});

test('patch script upgrades the legacy IME guard and dispatch patch', () => {
  const { workbenchPath } = writeWorkbench(
    [
      legacyImeGuardSource,
      'class KeybindingService {',
      'resolveKeyboardEvent(e){return e}',
      '_doDispatch(){return true}',
      legacyPatchedDispatch,
      '}',
      `${originalTerminalKeyHandler})`,
    ].join('\n'),
  );

  const result = runPatchScript(workbenchPath);

  assert.equal(result.status, 0, result.stderr);
  const nextSource = fs.readFileSync(workbenchPath, 'utf8');
  assert.equal(nextSource.includes(legacyPatchedDispatch), false);
  assert.equal(nextSource.includes('globalThis.__codexVscodeImeGuard||'), false);
  assert.equal(nextSource.includes(patchedDispatch), true);
  assert.equal(nextSource.includes('Math.max(120,360-(Date.now()-m))'), true);
  assert.equal(nextSource.includes(patchedTerminalKeyHandler), true);
});

test('patch script upgrades the v2 IME guard source', () => {
  const { workbenchPath } = writeWorkbench(
    [
      v2ImeGuardSource,
      'class KeybindingService {',
      'resolveKeyboardEvent(e){return e}',
      '_doDispatch(){return true}',
      patchedDispatch,
      '}',
      `${originalTerminalKeyHandler})`,
    ].join('\n'),
  );

  const result = runPatchScript(workbenchPath);

  assert.equal(result.status, 0, result.stderr);
  const nextSource = fs.readFileSync(workbenchPath, 'utf8');
  assert.equal(nextSource.includes('if(p==="enter")return!1'), false);
  assert.equal(nextSource.includes('Math.max(120,360-(Date.now()-m))'), true);
  assert.equal(nextSource.includes('addEventListener("keydown",p,!0)'), true);
  assert.equal(nextSource.includes(patchedDispatch), true);
  assert.equal(nextSource.includes(patchedTerminalKeyHandler), true);
});

test('patch script upgrades the v3 IME guard source to early-capture Shift+Enter', () => {
  const { workbenchPath } = writeWorkbench(
    [
      v3ImeGuardSource,
      'class KeybindingService {',
      'resolveKeyboardEvent(e){return e}',
      '_doDispatch(){return true}',
      patchedDispatch,
      '}',
      `${originalTerminalKeyHandler})`,
    ].join('\n'),
  );

  const result = runPatchScript(workbenchPath);

  assert.equal(result.status, 0, result.stderr);
  const nextSource = fs.readFileSync(workbenchPath, 'utf8');
  assert.equal(nextSource.includes(v3ImeGuardSource), false);
  assert.equal(nextSource.includes('Math.max(120,360-(Date.now()-m))'), true);
  assert.equal(nextSource.includes('addEventListener("keydown",p,!0)'), true);
  assert.equal(nextSource.includes(patchedDispatch), true);
  assert.equal(nextSource.includes(patchedTerminalKeyHandler), true);
});

test('patch script upgrades the v4 IME guard source and terminal key handler', () => {
  const { workbenchPath } = writeWorkbench(
    [
      v4ImeGuardSource,
      'class KeybindingService {',
      'resolveKeyboardEvent(e){return e}',
      '_doDispatch(){return true}',
      patchedDispatch,
      '}',
      `${originalTerminalKeyHandler})`,
    ].join('\n'),
  );

  const result = runPatchScript(workbenchPath);

  assert.equal(result.status, 0, result.stderr);
  const nextSource = fs.readFileSync(workbenchPath, 'utf8');
  assert.equal(nextSource.includes(v4ImeGuardSource), false);
  assert.equal(nextSource.includes('suppressTerminalKey'), true);
  assert.equal(nextSource.includes(originalTerminalKeyHandler), false);
  assert.equal(nextSource.includes(patchedTerminalKeyHandler), true);
});

test('patch script upgrades the v5 IME guard source to defer recent compositionend', () => {
  const { workbenchPath } = writeWorkbench(
    [
      v5ImeGuardSource,
      'class KeybindingService {',
      'resolveKeyboardEvent(e){return e}',
      '_doDispatch(){return true}',
      patchedDispatch,
      '}',
      `${patchedTerminalKeyHandler})`,
    ].join('\n'),
  );

  const result = runPatchScript(workbenchPath);

  assert.equal(result.status, 0, result.stderr);
  const nextSource = fs.readFileSync(workbenchPath, 'utf8');
  assert.equal(nextSource.includes(v5ImeGuardSource), false);
  assert.equal(nextSource.includes('Date.now()-m<180'), true);
  assert.equal(nextSource.includes('Math.max(120,360-(Date.now()-m))'), true);
  assert.equal(nextSource.includes(patchedTerminalKeyHandler), true);
});

test('patch script upgrades the v6 IME guard source to defer terminal Shift+Enter even without composition signals', () => {
  const { workbenchPath } = writeWorkbench(
    [
      v6ImeGuardSource,
      'class KeybindingService {',
      'resolveKeyboardEvent(e){return e}',
      '_doDispatch(){return true}',
      patchedDispatch,
      '}',
      `${patchedTerminalKeyHandler})`,
    ].join('\n'),
  );

  const result = runPatchScript(workbenchPath);

  assert.equal(result.status, 0, result.stderr);
  const nextSource = fs.readFileSync(workbenchPath, 'utf8');
  assert.equal(nextSource.includes(v6ImeGuardSource), false);
  assert.equal(nextSource.includes('xterm-helper-textarea'), true);
  assert.equal(nextSource.includes('closest?.(".xterm")'), true);
  assert.equal(nextSource.includes('insertLineBreak'), true);
  assert.equal(nextSource.includes(patchedTerminalKeyHandler), true);
});

test('patch script upgrades the v7 IME guard source to suppress native terminal line breaks', () => {
  const { workbenchPath } = writeWorkbench(
    [
      v7ImeGuardSource,
      'class KeybindingService {',
      'resolveKeyboardEvent(e){return e}',
      '_doDispatch(){return true}',
      patchedDispatch,
      '}',
      `${patchedTerminalKeyHandler})`,
    ].join('\n'),
  );

  const result = runPatchScript(workbenchPath);

  assert.equal(result.status, 0, result.stderr);
  const nextSource = fs.readFileSync(workbenchPath, 'utf8');
  assert.equal(nextSource.includes(v7ImeGuardSource), false);
  assert.equal(nextSource.includes('xterm-helper-textarea'), true);
  assert.equal(nextSource.includes('closest?.(".xterm")'), true);
  assert.equal(nextSource.includes('addEventListener("beforeinput",'), true);
  assert.equal(nextSource.includes('insertLineBreak'), true);
  assert.equal(nextSource.includes('Date.now()<h'), true);
  assert.equal(nextSource.includes(patchedTerminalKeyHandler), true);
});

test('patch script upgrades the v8 IME guard source to preserve native terminal IME commit', () => {
  const { workbenchPath } = writeWorkbench(
    [
      v8ImeGuardSource,
      'class KeybindingService {',
      'resolveKeyboardEvent(e){return e}',
      '_doDispatch(){return true}',
      patchedDispatch,
      '}',
      `${patchedTerminalKeyHandler})`,
    ].join('\n'),
  );

  const result = runPatchScript(workbenchPath);

  assert.equal(result.status, 0, result.stderr);
  const nextSource = fs.readFileSync(workbenchPath, 'utf8');
  assert.equal(nextSource.includes(v8ImeGuardSource), false);
  assert.equal(nextSource.includes('Math.max(120,360-(Date.now()-m))'), true);
  assert.equal(nextSource.includes('function E(a){try{a?.blur?.()'), false);
  assert.equal(nextSource.includes('function p(a){u(a)&&!a.defaultPrevented&&(h=Date.now()+1400)}'), true);
  assert.equal(nextSource.includes('function g(a,i){if(!u(a))return!1'), true);
  assert.equal(nextSource.includes('addEventListener("beforeinput",'), true);
  assert.equal(nextSource.includes('insertLineBreak'), true);
  assert.equal(nextSource.includes(patchedTerminalKeyHandler), true);
});

test('patch script upgrades the v9 IME guard source to stop dropping the composing terminal syllable', () => {
  const { workbenchPath } = writeWorkbench(
    [
      v9ImeGuardSource,
      'class KeybindingService {',
      'resolveKeyboardEvent(e){return e}',
      '_doDispatch(){return true}',
      patchedDispatch,
      '}',
      `${patchedTerminalKeyHandler})`,
    ].join('\n'),
  );

  const result = runPatchScript(workbenchPath);

  assert.equal(result.status, 0, result.stderr);
  const nextSource = fs.readFileSync(workbenchPath, 'utf8');
  assert.equal(nextSource.includes(v9ImeGuardSource), false);
  assert.equal(nextSource.includes('function E(a){try{a?.blur?.()'), false);
  assert.equal(nextSource.includes('g==="enter"&&!f'), true);
  assert.equal(nextSource.includes('function u(a){let i=r(a);return i==="enter"&&d(a)}'), true);
  assert.equal(nextSource.includes('function p(a){u(a)&&!a.defaultPrevented&&(h=Date.now()+1400)}'), true);
  assert.equal(nextSource.includes('function g(a,i){if(!u(a))return!1'), true);
  assert.equal(nextSource.includes('Math.max(120,360-(Date.now()-m))'), true);
  assert.equal(nextSource.includes('insertLineBreak'), true);
});

test('patch script upgrades the v10 IME guard source to wait for a quiet IME activity window', () => {
  const { workbenchPath } = writeWorkbench(
    [
      v10ImeGuardSource,
      'class KeybindingService {',
      'resolveKeyboardEvent(e){return e}',
      '_doDispatch(){return true}',
      patchedDispatch,
      '}',
      `${patchedTerminalKeyHandler})`,
    ].join('\n'),
  );

  const result = runPatchScript(workbenchPath);

  assert.equal(result.status, 0, result.stderr);
  const nextSource = fs.readFileSync(workbenchPath, 'utf8');
  assert.equal(nextSource.includes(v10ImeGuardSource), false);
  assert.equal(nextSource.includes('Math.max(120,360-(Date.now()-m))'), true);
  assert.equal(nextSource.includes('addEventListener("compositionupdate",y,!0)'), true);
  assert.equal(nextSource.includes('addEventListener("input",y,!0)'), true);
  assert.equal(nextSource.includes('function p(a){u(a)&&!a.defaultPrevented&&(h=Date.now()+1400)}'), true);
  assert.equal(nextSource.includes('function g(a,i){if(!u(a))return!1'), true);
  assert.equal(nextSource.includes('insertLineBreak'), true);
});

test('patch script upgrades the v11 IME guard source and queues terminal sendSequence', () => {
  const { workbenchPath } = writeWorkbench(
    [
      v11ImeGuardSource,
      'class KeybindingService {',
      'resolveKeyboardEvent(e){return e}',
      '_doDispatch(){return true}',
      patchedDispatch,
      '}',
      `${patchedTerminalKeyHandler})`,
    ].join('\n'),
  );

  const result = runPatchScript(workbenchPath);

  assert.equal(result.status, 0, result.stderr);
  const nextSource = fs.readFileSync(workbenchPath, 'utf8');
  assert.equal(nextSource.includes(v11ImeGuardSource), false);
  assert.equal(nextSource.includes('Math.max(120,360-(Date.now()-m))'), true);
  assert.equal(nextSource.includes('addEventListener("compositionupdate",y,!0)'), true);
  assert.equal(nextSource.includes('addEventListener("input",y,!0)'), true);
  assert.equal(nextSource.includes('queueTerminalSequence'), true);
  assert.equal(nextSource.includes('a==="\\x1B\\n"'), true);
  assert.equal(nextSource.includes('a!=="\\x1B\\r"'), true);
  assert.equal(nextSource.includes('queued terminal CR sequence failed'), true);
  assert.equal(countOccurrences(nextSource, patchedSendSequenceCall), 1);
});

test('patch script upgrades the v12 IME guard source to keep native line breaks suppressed through sendSequence', () => {
  const { workbenchPath } = writeWorkbench(
    [
      v12ImeGuardSource,
      'class KeybindingService {',
      'resolveKeyboardEvent(e){return e}',
      '_doDispatch(){return true}',
      patchedDispatch,
      '}',
      `${patchedTerminalKeyHandler})`,
      patchedSendSequenceCall,
    ].join('\n'),
  );

  const result = runPatchScript(workbenchPath);

  assert.equal(result.status, 0, result.stderr);
  const nextSource = fs.readFileSync(workbenchPath, 'utf8');
  assert.equal(nextSource.includes(v12ImeGuardSource), false);
  assert.equal(nextSource.includes('h=Date.now()+300'), false);
  assert.equal(nextSource.includes('h=Date.now()+1400'), true);
  assert.equal(nextSource.includes('queueTerminalSequence'), true);
  assert.equal(nextSource.includes('queued terminal sequence failed'), false);
  assert.equal(nextSource.includes('queued terminal CR sequence failed'), true);
  assert.equal(nextSource.includes('a==="\\x1B\\n"'), true);
  assert.equal(nextSource.includes('a!=="\\x1B\\r"'), true);
  assert.equal(countOccurrences(nextSource, patchedSendSequenceCall), 1);
});

test('patch script upgrades the v13 IME guard source to queue the CR terminal sequence', () => {
  const { workbenchPath } = writeWorkbench(
    [
      v13ImeGuardSource,
      'class KeybindingService {',
      'resolveKeyboardEvent(e){return e}',
      '_doDispatch(){return true}',
      patchedDispatch,
      '}',
      `${patchedTerminalKeyHandler})`,
      patchedSendSequenceCall,
    ].join('\n'),
  );

  const result = runPatchScript(workbenchPath);

  assert.equal(result.status, 0, result.stderr);
  const nextSource = fs.readFileSync(workbenchPath, 'utf8');
  assert.equal(nextSource.includes(v13ImeGuardSource), false);
  assert.equal(nextSource.includes('h=Date.now()+1400'), true);
  assert.equal(nextSource.includes('queued terminal sequence failed'), false);
  assert.equal(nextSource.includes('queued terminal CR sequence failed'), true);
  assert.equal(nextSource.includes('try{i()}'), true);
  assert.equal(nextSource.includes('a==="\\x1B\\n"'), true);
  assert.equal(nextSource.includes('a!=="\\x1B\\r"'), true);
  assert.equal(countOccurrences(nextSource, patchedSendSequenceCall), 1);
});

test('patch script upgrades the v14 IME guard source to queue the CR terminal sequence', () => {
  const { workbenchPath } = writeWorkbench(
    [
      v14ImeGuardSource,
      'class KeybindingService {',
      'resolveKeyboardEvent(e){return e}',
      '_doDispatch(){return true}',
      patchedDispatch,
      '}',
      `${patchedTerminalKeyHandler})`,
      patchedSendSequenceCall,
    ].join('\n'),
  );

  const result = runPatchScript(workbenchPath);

  assert.equal(result.status, 0, result.stderr);
  const nextSource = fs.readFileSync(workbenchPath, 'utf8');
  assert.equal(nextSource.includes(v14ImeGuardSource), false);
  assert.equal(nextSource.includes('h=Date.now()+1400'), true);
  assert.equal(nextSource.includes('queued terminal sequence failed'), false);
  assert.equal(nextSource.includes('queued terminal CR sequence failed'), true);
  assert.equal(nextSource.includes('try{i()}'), true);
  assert.equal(nextSource.includes('a==="\\x1B\\n"'), true);
  assert.equal(nextSource.includes('a!=="\\x1B\\r"'), true);
  assert.equal(countOccurrences(nextSource, patchedSendSequenceCall), 1);
});

test('patch script upgrades the v15 IME guard source to suppress native CR and keypress line breaks', () => {
  const { workbenchPath } = writeWorkbench(
    [
      v15ImeGuardSource,
      'class KeybindingService {',
      'resolveKeyboardEvent(e){return e}',
      '_doDispatch(){return true}',
      patchedDispatch,
      '}',
      `${patchedTerminalKeyHandler})`,
      patchedSendSequenceCall,
    ].join('\n'),
  );

  const result = runPatchScript(workbenchPath);

  assert.equal(result.status, 0, result.stderr);
  const nextSource = fs.readFileSync(workbenchPath, 'utf8');
  assert.equal(nextSource.includes(v15ImeGuardSource), false);
  assert.equal(nextSource.includes('insertParagraph'), true);
  assert.equal(nextSource.includes('a?.data==="\\r"'), true);
  assert.equal(nextSource.includes('addEventListener("keypress",I,!0)'), true);
  assert.equal(nextSource.includes('function I(a){Date.now()<h&&a?.key==="Enter"'), true);
  assert.equal(nextSource.includes('queued terminal CR sequence failed'), true);
  assert.equal(nextSource.includes('a===C&&S-P<80'), true);
  assert.equal(countOccurrences(nextSource, patchedSendSequenceCall), 1);
});

test('patch script upgrades the v16 IME guard source to drop duplicate terminal sequences', () => {
  const { workbenchPath } = writeWorkbench(
    [
      v16ImeGuardSource,
      'class KeybindingService {',
      'resolveKeyboardEvent(e){return e}',
      '_doDispatch(){return true}',
      patchedDispatch,
      '}',
      `${patchedTerminalKeyHandler})`,
      patchedSendSequenceCall,
    ].join('\n'),
  );

  const result = runPatchScript(workbenchPath);

  assert.equal(result.status, 0, result.stderr);
  const nextSource = fs.readFileSync(workbenchPath, 'utf8');
  assert.equal(nextSource.includes(v16ImeGuardSource), false);
  assert.equal(nextSource.includes('a===C&&S-P<80'), true);
  assert.equal(nextSource.includes('C=a,P=S'), true);
  assert.equal(nextSource.includes('queued terminal CR sequence failed'), true);
  assert.equal(countOccurrences(nextSource, patchedSendSequenceCall), 1);
});

test('patch script upgrades the v17 IME guard source to emit one terminal CR sequence directly', () => {
  const { workbenchPath } = writeWorkbench(
    [
      v17ImeGuardSource,
      'class KeybindingService {',
      'resolveKeyboardEvent(e){return e}',
      '_doDispatch(){return true}',
      patchedDispatch,
      '}',
      `${legacyPatchedTerminalKeyHandler})`,
      patchedSendSequenceCall,
    ].join('\n'),
  );

  const result = runPatchScript(workbenchPath);

  assert.equal(result.status, 0, result.stderr);
  const nextSource = fs.readFileSync(workbenchPath, 'utf8');
  assert.equal(nextSource.includes(v17ImeGuardSource), false);
  assert.equal(nextSource.includes(legacyPatchedTerminalKeyHandler), false);
  assert.equal(nextSource.includes(patchedTerminalKeyHandler), true);
  assert.equal(
    nextSource.includes('suppressTerminalKey?.(n,()=>this.sendText("\\x1B\\r",!1))'),
    true,
  );
  assert.equal(nextSource.includes('terminal Shift+Enter sequence failed'), true);
  assert.equal(nextSource.includes('C==="\\x1B\\r"&&S-P<80'), true);
  assert.equal(nextSource.includes('a===C&&S-P<80'), true);
  assert.equal(countOccurrences(nextSource, patchedSendSequenceCall), 1);
});

test('patch script upgrades the v18 IME guard source to dedupe direct terminal CR sends', () => {
  const { workbenchPath } = writeWorkbench(
    [
      v18ImeGuardSource,
      'class KeybindingService {',
      'resolveKeyboardEvent(e){return e}',
      '_doDispatch(){return true}',
      patchedDispatch,
      '}',
      `${patchedTerminalKeyHandler})`,
      patchedSendSequenceCall,
    ].join('\n'),
  );

  const result = runPatchScript(workbenchPath);

  assert.equal(result.status, 0, result.stderr);
  const nextSource = fs.readFileSync(workbenchPath, 'utf8');
  assert.equal(nextSource.includes(v18ImeGuardSource), false);
  assert.equal(nextSource.includes(patchedTerminalKeyHandler), true);
  assert.equal(nextSource.includes('C==="\\x1B\\r"&&S-P<80'), true);
  assert.equal(nextSource.includes('terminal Shift+Enter sequence failed'), true);
  assert.equal(countOccurrences(nextSource, patchedSendSequenceCall), 1);
});

test('patch script fails closed when dispatch markers are missing', () => {
  const { workbenchPath } = writeWorkbench('class KeybindingService {}');

  const result = runPatchScript(workbenchPath);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /No known KeybindingService\._dispatch marker found/);
});

test('patch script fails closed when terminal sendSequence markers are missing', () => {
  const { workbenchPath } = writeWorkbench(
    [
      'class KeybindingService {',
      'resolveKeyboardEvent(e){return e}',
      '_doDispatch(){return true}',
      patchedDispatch,
      '}',
      `${patchedTerminalKeyHandler})`,
    ].join('\n'),
    { includeSendSequence: false },
  );

  const result = runPatchScript(workbenchPath);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /No known terminal sendSequence marker found/);
});
