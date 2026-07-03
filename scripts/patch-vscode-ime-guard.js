#!/usr/bin/env node

const childProcess = require('child_process');
const fs = require('fs');

const workbenchPath =
  process.env.VSCODE_WORKBENCH_MAIN ||
  '/Applications/Code.app/Contents/Resources/app/out/vs/workbench/workbench.desktop.main.js';

const patchHeader = '/* Patched by codex-vscode-terminal-tools. Reapply with patch-vscode-terminal-order. */\n';
const imeGuardMarker =
  '/* Codex VS Code IME guard patch. Reapply with patch-vscode-ime-guard. */';

const legacyImeGuardSource = `${imeGuardMarker}
globalThis.__codexVscodeImeGuard||(globalThis.__codexVscodeImeGuard=(()=>{let e=!1,t=null,o=0;function n(a){let i=a?.ownerDocument?.defaultView??globalThis;return i.document??document}function r(a){return a?.key==="Enter"&&a.shiftKey&&!a.ctrlKey&&!a.altKey&&!a.metaKey||a?.metaKey&&!a.ctrlKey&&!a.altKey&&["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"].includes(a.key)}function s(a){return e||a?.isComposing||a?.key==="Process"||a?.keyCode===229}function c(a,i,l){let u=a?.browserEvent;if(!u||!r(u)||!s(u))return!1;let p=Date.now();if(t&&p-o<200)return u.preventDefault?.(),u.stopImmediatePropagation?.(),!0;o=p;u.preventDefault?.(),u.stopImmediatePropagation?.();let m=n(u.target),g=m.activeElement,f=!1,v=()=>{if(f)return;f=!0,t=null;setTimeout(()=>{try{typeof l=="function"&&l()}catch(b){console.error("[codex-vscode-ime-guard] deferred keybinding failed",b)}},0)};t=v;try{m.addEventListener("compositionend",v,{capture:!0,once:!0})}catch{}setTimeout(v,90);try{g?.blur?.(),setTimeout(()=>{try{g?.focus?.({preventScroll:!0})}catch{try{g?.focus?.()}catch{}}},0)}catch{}return!0}function l(a){try{a.addEventListener("compositionstart",()=>{e=!0},!0),a.addEventListener("compositionend",()=>{e=!1},!0)}catch{}}try{l(globalThis),globalThis.addEventListener?.("pagehide",()=>{e=!1,t=null},!0)}catch{}return{defer:c}})());
`;

const v2ImeGuardSource = `${imeGuardMarker}
globalThis.__codexVscodeImeGuard=(()=>{let e=!1,t=null,o=0;function n(a){let i=a?.ownerDocument?.defaultView??globalThis;return i.document??document}function r(a){return a?.key==="Enter"&&a.shiftKey&&!a.ctrlKey&&!a.altKey&&!a.metaKey?"enter":a?.metaKey&&!a.ctrlKey&&!a.altKey&&["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"].includes(a.key)?"move":""}function s(a){return e||a?.isComposing||a?.key==="Process"||a?.keyCode===229}function c(a,i,l){let u=a?.browserEvent,p=r(u);if(!u||!p||!s(u))return;if(p==="enter")return!1;let m=Date.now();if(t&&m-o<200)return u.preventDefault?.(),u.stopImmediatePropagation?.(),!0;o=m;u.preventDefault?.(),u.stopImmediatePropagation?.();let g=n(u.target),f=g.activeElement,v=!1,b=()=>{if(v)return;v=!0,t=null;setTimeout(()=>{try{typeof l=="function"&&l()}catch(S){console.error("[codex-vscode-ime-guard] deferred keybinding failed",S)}},0)};t=b;try{g.addEventListener("compositionend",b,{capture:!0,once:!0})}catch{}setTimeout(b,90);try{f?.blur?.(),setTimeout(()=>{try{f?.focus?.({preventScroll:!0})}catch{try{f?.focus?.()}catch{}}},0)}catch{}return!0}function l(a){try{a.addEventListener("compositionstart",()=>{e=!0},!0),a.addEventListener("compositionend",()=>{e=!1},!0)}catch{}}try{l(globalThis),globalThis.addEventListener?.("pagehide",()=>{e=!1,t=null},!0)}catch{}return{defer:c}})();
`;

const v3ImeGuardSource = `${imeGuardMarker}
globalThis.__codexVscodeImeGuard=(()=>{let e=!1,t=null,o=0;function n(a){let i=a?.ownerDocument?.defaultView??globalThis;return i.document??document}function r(a){return a?.key==="Enter"&&a.shiftKey&&!a.ctrlKey&&!a.altKey&&!a.metaKey?"enter":a?.metaKey&&!a.ctrlKey&&!a.altKey&&["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"].includes(a.key)?"move":""}function s(a){return e||a?.isComposing||a?.key==="Process"||a?.keyCode===229}function c(a,i,l){let u=a?.browserEvent,p=r(u);if(!u||!p||!s(u))return;let m=Date.now();if(t&&m-o<200)return u.preventDefault?.(),u.stopImmediatePropagation?.(),!0;o=m;u.preventDefault?.(),u.stopImmediatePropagation?.();let g=n(u.target),f=g.activeElement,v=!1,b=()=>{if(v)return;v=!0,t=null;setTimeout(()=>{try{typeof l=="function"&&l()}catch(S){console.error("[codex-vscode-ime-guard] deferred keybinding failed",S)}},0)};t=b;try{g.addEventListener("compositionend",b,{capture:!0,once:!0})}catch{}if(p==="enter")return setTimeout(()=>{t===b&&(t=null)},500),!0;setTimeout(b,90);try{f?.blur?.(),setTimeout(()=>{try{f?.focus?.({preventScroll:!0})}catch{try{f?.focus?.()}catch{}}},0)}catch{}return!0}function l(a){try{a.addEventListener("compositionstart",()=>{e=!0},!0),a.addEventListener("compositionend",()=>{e=!1},!0)}catch{}}try{l(globalThis),globalThis.addEventListener?.("pagehide",()=>{e=!1,t=null},!0)}catch{}return{defer:c}})();
`;

const v4ImeGuardSource = `${imeGuardMarker}
globalThis.__codexVscodeImeGuard=(()=>{let e=!1,t=null,o=0;function n(a){let i=a?.ownerDocument?.defaultView??globalThis;return i.document??document}function r(a){return a?.key==="Enter"&&a.shiftKey&&!a.ctrlKey&&!a.altKey&&!a.metaKey?"enter":a?.metaKey&&!a.ctrlKey&&!a.altKey&&["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"].includes(a.key)?"move":""}function s(a){return e||a?.isComposing||a?.key==="Process"||a?.keyCode===229}function c(a,i,l){let u=a?.browserEvent,p=r(u);if(!u||!p||!s(u))return;let m=Date.now();if(t&&m-o<200)return u.preventDefault?.(),u.stopImmediatePropagation?.(),!0;o=m;u.preventDefault?.(),u.stopImmediatePropagation?.();let g=n(u.target),f=g.activeElement,v=!1,b=()=>{if(v)return;v=!0,t=null;setTimeout(()=>{try{typeof l=="function"&&l()}catch(S){console.error("[codex-vscode-ime-guard] deferred keybinding failed",S)}},0)};t=b;try{g.addEventListener("compositionend",b,{capture:!0,once:!0})}catch{}if(p==="enter")return setTimeout(()=>{t===b&&(t=null)},500),!0;setTimeout(b,90);try{f?.blur?.(),setTimeout(()=>{try{f?.focus?.({preventScroll:!0})}catch{try{f?.focus?.()}catch{}}},0)}catch{}return!0}function h(a){let i=r(a);i==="enter"&&s(a)&&!a.defaultPrevented&&a.preventDefault?.()}function l(a){try{a.addEventListener("compositionstart",()=>{e=!0},!0),a.addEventListener("compositionend",()=>{e=!1},!0),a.addEventListener("keydown",h,!0)}catch{}}try{l(globalThis),globalThis.addEventListener?.("pagehide",()=>{e=!1,t=null},!0)}catch{}return{defer:c}})();
`;

const v5ImeGuardSource = `${imeGuardMarker}
globalThis.__codexVscodeImeGuard=(()=>{let e=!1,t=null,o=0;function n(a){let i=a?.ownerDocument?.defaultView??globalThis;return i.document??document}function r(a){return a?.key==="Enter"&&a.shiftKey&&!a.ctrlKey&&!a.altKey&&!a.metaKey?"enter":a?.metaKey&&!a.ctrlKey&&!a.altKey&&["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"].includes(a.key)?"move":""}function s(a){return e||a?.isComposing||a?.key==="Process"||a?.keyCode===229}function c(a,i,l){let u=a?.browserEvent,p=r(u);if(!u||!p||!s(u))return;let m=Date.now();if(t&&m-o<200)return u.preventDefault?.(),u.stopImmediatePropagation?.(),!0;o=m;u.preventDefault?.(),u.stopImmediatePropagation?.();let g=n(u.target),f=g.activeElement,v=!1,b=()=>{if(v)return;v=!0,t=null;setTimeout(()=>{try{typeof l=="function"&&l()}catch(S){console.error("[codex-vscode-ime-guard] deferred keybinding failed",S)}},0)};t=b;try{g.addEventListener("compositionend",b,{capture:!0,once:!0})}catch{}if(p==="enter")return setTimeout(()=>{t===b&&(t=null)},500),!0;setTimeout(b,90);try{f?.blur?.(),setTimeout(()=>{try{f?.focus?.({preventScroll:!0})}catch{try{f?.focus?.()}catch{}}},0)}catch{}return!0}function h(a){let i=r(a);return i==="enter"&&s(a)}function l(a){h(a)&&!a.defaultPrevented&&a.preventDefault?.()}function u(a){return h(a)?(a.preventDefault?.(),!0):!1}function p(a){try{a.addEventListener("compositionstart",()=>{e=!0},!0),a.addEventListener("compositionend",()=>{e=!1},!0),a.addEventListener("keydown",l,!0)}catch{}}try{p(globalThis),globalThis.addEventListener?.("pagehide",()=>{e=!1,t=null},!0)}catch{}return{defer:c,suppressTerminalKey:u}})();
`;

const v6ImeGuardSource = `${imeGuardMarker}
globalThis.__codexVscodeImeGuard=(()=>{let e=!1,t=null,o=0,m=0;function n(a){let i=a?.ownerDocument?.defaultView??globalThis;return i.document??document}function r(a){return a?.key==="Enter"&&a.shiftKey&&!a.ctrlKey&&!a.altKey&&!a.metaKey?"enter":a?.metaKey&&!a.ctrlKey&&!a.altKey&&["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"].includes(a.key)?"move":""}function s(a){return e||a?.isComposing||a?.key==="Process"||a?.keyCode===229}function c(a){return s(a)||Date.now()-m<180}function l(a,i,u){let p=a?.browserEvent,g=r(p);if(!p||!g||!c(p))return;let f=Date.now();if(t&&f-o<200)return p.preventDefault?.(),p.stopImmediatePropagation?.(),!0;o=f,p.preventDefault?.(),p.stopImmediatePropagation?.();let v=n(p.target),b=v.activeElement,S=!1,y=()=>{if(S)return;S=!0,t=null;setTimeout(()=>{try{typeof u=="function"&&u()}catch(T){console.error("[codex-vscode-ime-guard] deferred keybinding failed",T)}},0)};t=y;try{v.addEventListener("compositionend",y,{capture:!0,once:!0})}catch{}if(g==="enter")return s(p)?setTimeout(()=>{t===y&&(t=null)},500):setTimeout(y,80),!0;setTimeout(y,90);try{b?.blur?.(),setTimeout(()=>{try{b?.focus?.({preventScroll:!0})}catch{try{b?.focus?.()}catch{}}},0)}catch{}return!0}function u(a){let i=r(a);return i==="enter"&&c(a)}function p(a){u(a)&&!a.defaultPrevented&&a.preventDefault?.()}function g(a){return u(a)?(a.preventDefault?.(),!0):!1}function f(a){try{a.addEventListener("compositionstart",()=>{e=!0},!0),a.addEventListener("compositionend",()=>{e=!1,m=Date.now()},!0),a.addEventListener("keydown",p,!0)}catch{}}try{f(globalThis),globalThis.addEventListener?.("pagehide",()=>{e=!1,t=null,m=0},!0)}catch{}return{defer:l,suppressTerminalKey:g}})();
`;

const v7ImeGuardSource = `${imeGuardMarker}
globalThis.__codexVscodeImeGuard=(()=>{let e=!1,t=null,o=0,m=0;function n(a){let i=a?.ownerDocument?.defaultView??globalThis;return i.document??document}function r(a){return a?.key==="Enter"&&a.shiftKey&&!a.ctrlKey&&!a.altKey&&!a.metaKey?"enter":a?.metaKey&&!a.ctrlKey&&!a.altKey&&["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"].includes(a.key)?"move":""}function s(a){return e||a?.isComposing||a?.key==="Process"||a?.keyCode===229}function c(a){return s(a)||Date.now()-m<180}function d(a){let i=a?.target;return!!(i?.classList?.contains?.("xterm-helper-textarea")||i?.closest?.(".xterm"))}function l(a,i,u){let p=a?.browserEvent,g=r(p),f=g==="enter"&&d(p);if(!p||!g||!c(p)&&!f)return;let v=Date.now();if(t&&v-o<200)return p.preventDefault?.(),p.stopImmediatePropagation?.(),!0;o=v,p.preventDefault?.(),p.stopImmediatePropagation?.();let b=n(p.target),S=b.activeElement,y=!1,T=()=>{if(y)return;y=!0,t=null;setTimeout(()=>{try{typeof u=="function"&&u()}catch(E){console.error("[codex-vscode-ime-guard] deferred keybinding failed",E)}},0)};t=T;try{b.addEventListener("compositionend",T,{capture:!0,once:!0})}catch{}if(g==="enter")return s(p)?setTimeout(()=>{t===T&&(t=null)},500):setTimeout(T,80),!0;setTimeout(T,90);try{S?.blur?.(),setTimeout(()=>{try{S?.focus?.({preventScroll:!0})}catch{try{S?.focus?.()}catch{}}},0)}catch{}return!0}function u(a){let i=r(a);return i==="enter"&&(c(a)||d(a))}function p(a){u(a)&&!a.defaultPrevented&&a.preventDefault?.()}function g(a){return u(a)?(a.preventDefault?.(),!0):!1}function f(a){try{a.addEventListener("compositionstart",()=>{e=!0},!0),a.addEventListener("compositionend",()=>{e=!1,m=Date.now()},!0),a.addEventListener("keydown",p,!0)}catch{}}try{f(globalThis),globalThis.addEventListener?.("pagehide",()=>{e=!1,t=null,m=0},!0)}catch{}return{defer:l,suppressTerminalKey:g}})();
`;

const v8ImeGuardSource = `${imeGuardMarker}
globalThis.__codexVscodeImeGuard=(()=>{let e=!1,t=null,o=0,m=0,h=0;function n(a){let i=a?.ownerDocument?.defaultView??globalThis;return i.document??document}function r(a){return a?.key==="Enter"&&a.shiftKey&&!a.ctrlKey&&!a.altKey&&!a.metaKey?"enter":a?.metaKey&&!a.ctrlKey&&!a.altKey&&["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"].includes(a.key)?"move":""}function s(a){return e||a?.isComposing||a?.key==="Process"||a?.keyCode===229}function c(a){return s(a)||Date.now()-m<180}function d(a){let i=a?.target;return!!(i?.classList?.contains?.("xterm-helper-textarea")||i?.closest?.(".xterm"))}function l(a,i,u){let p=a?.browserEvent,g=r(p),f=g==="enter"&&d(p);if(!p||!g||!c(p)&&!f)return;if(g==="enter")h=Date.now()+300;let v=Date.now();if(t&&v-o<200)return p.preventDefault?.(),p.stopImmediatePropagation?.(),!0;o=v,p.preventDefault?.(),p.stopImmediatePropagation?.();let b=n(p.target),S=b.activeElement,y=!1,T=()=>{if(y)return;y=!0,t=null;setTimeout(()=>{try{typeof u=="function"&&u()}catch(E){console.error("[codex-vscode-ime-guard] deferred keybinding failed",E)}},0)};t=T;try{b.addEventListener("compositionend",T,{capture:!0,once:!0})}catch{}if(g==="enter")return s(p)?setTimeout(()=>{t===T&&(t=null)},500):setTimeout(T,80),!0;setTimeout(T,90);try{S?.blur?.(),setTimeout(()=>{try{S?.focus?.({preventScroll:!0})}catch{try{S?.focus?.()}catch{}}},0)}catch{}return!0}function u(a){let i=r(a);return i==="enter"&&(c(a)||d(a))}function p(a){u(a)&&!a.defaultPrevented&&(h=Date.now()+300,a.preventDefault?.())}function g(a){return u(a)?(h=Date.now()+300,a.preventDefault?.(),!0):!1}function E(a){Date.now()<h&&(a?.inputType==="insertLineBreak"||a?.data==="\\n")&&(a.preventDefault?.(),a.stopImmediatePropagation?.())}function f(a){try{a.addEventListener("compositionstart",()=>{e=!0},!0),a.addEventListener("compositionend",()=>{e=!1,m=Date.now()},!0),a.addEventListener("keydown",p,!0),a.addEventListener("beforeinput",E,!0)}catch{}}try{f(globalThis),globalThis.addEventListener?.("pagehide",()=>{e=!1,t=null,m=0,h=0},!0)}catch{}return{defer:l,suppressTerminalKey:g}})();
`;

const v9ImeGuardSource = `${imeGuardMarker}
globalThis.__codexVscodeImeGuard=(()=>{let e=!1,t=null,o=0,m=0,h=0;function n(a){let i=a?.ownerDocument?.defaultView??globalThis;return i.document??document}function r(a){return a?.key==="Enter"&&a.shiftKey&&!a.ctrlKey&&!a.altKey&&!a.metaKey?"enter":a?.metaKey&&!a.ctrlKey&&!a.altKey&&["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"].includes(a.key)?"move":""}function s(a){return e||a?.isComposing||a?.key==="Process"||a?.keyCode===229}function c(a){return s(a)||Date.now()-m<180}function d(a){let i=a?.target;return!!(i?.classList?.contains?.("xterm-helper-textarea")||i?.closest?.(".xterm"))}function E(a){try{a?.blur?.(),setTimeout(()=>{try{a?.focus?.({preventScroll:!0})}catch(i){try{a?.focus?.()}catch{}}},30)}catch{}}function l(a,i,u){let p=a?.browserEvent,g=r(p),f=g==="enter"&&d(p);if(!p||!g||!c(p)&&!f)return;if(g==="enter")h=Date.now()+300;let v=Date.now();if(t&&v-o<200)return p.preventDefault?.(),p.stopImmediatePropagation?.(),!0;o=v,p.preventDefault?.(),p.stopImmediatePropagation?.();let b=n(p.target),S=b.activeElement,y=!1,T=()=>{if(y)return;y=!0,t=null;setTimeout(()=>{try{typeof u=="function"&&u()}catch(A){console.error("[codex-vscode-ime-guard] deferred keybinding failed",A)}},0)};t=T;try{b.addEventListener("compositionend",T,{capture:!0,once:!0})}catch{}if(g==="enter")return E(S),setTimeout(T,120),!0;setTimeout(T,90),E(S);return!0}function u(a){let i=r(a);return i==="enter"&&(c(a)||d(a))}function p(a){u(a)&&!a.defaultPrevented&&(h=Date.now()+300,E(n(a.target).activeElement),a.preventDefault?.())}function g(a){return u(a)?(h=Date.now()+300,E(n(a.target).activeElement),a.preventDefault?.(),!0):!1}function A(a){Date.now()<h&&(a?.inputType==="insertLineBreak"||a?.data==="\\n")&&(a.preventDefault?.(),a.stopImmediatePropagation?.())}function f(a){try{a.addEventListener("compositionstart",()=>{e=!0},!0),a.addEventListener("compositionend",()=>{e=!1,m=Date.now()},!0),a.addEventListener("keydown",p,!0),a.addEventListener("beforeinput",A,!0)}catch{}}try{f(globalThis),globalThis.addEventListener?.("pagehide",()=>{e=!1,t=null,m=0,h=0},!0)}catch{}return{defer:l,suppressTerminalKey:g}})();
`;

const v10ImeGuardSource = `${imeGuardMarker}
globalThis.__codexVscodeImeGuard=(()=>{let e=!1,t=null,o=0,m=0,h=0;function n(a){let i=a?.ownerDocument?.defaultView??globalThis;return i.document??document}function r(a){return a?.key==="Enter"&&a.shiftKey&&!a.ctrlKey&&!a.altKey&&!a.metaKey?"enter":a?.metaKey&&!a.ctrlKey&&!a.altKey&&["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"].includes(a.key)?"move":""}function s(a){return e||a?.isComposing||a?.key==="Process"||a?.keyCode===229}function c(a){return s(a)||Date.now()-m<180}function d(a){let i=a?.target;return!!(i?.classList?.contains?.("xterm-helper-textarea")||i?.closest?.(".xterm"))}function l(a,i,u){let p=a?.browserEvent,g=r(p),f=g==="enter"&&d(p);if(!p||!g||g==="enter"&&!f||g!=="enter"&&!c(p))return;if(g==="enter")h=Date.now()+300;let v=Date.now();if(t&&v-o<200)return f||(p.preventDefault?.(),p.stopImmediatePropagation?.()),!0;o=v,f||(p.preventDefault?.(),p.stopImmediatePropagation?.());let b=n(p.target),S=b.activeElement,y=!1,T=()=>{if(y)return;y=!0,t=null;setTimeout(()=>{try{typeof u=="function"&&u()}catch(E){console.error("[codex-vscode-ime-guard] deferred keybinding failed",E)}},0)};t=T;try{b.addEventListener("compositionend",T,{capture:!0,once:!0})}catch{}if(g==="enter")return setTimeout(T,120),!0;setTimeout(T,90);try{S?.blur?.(),setTimeout(()=>{try{S?.focus?.({preventScroll:!0})}catch(E){try{S?.focus?.()}catch{}}},0)}catch{}return!0}function u(a){let i=r(a);return i==="enter"&&d(a)}function p(a){u(a)&&!a.defaultPrevented&&(h=Date.now()+300)}function g(a){return u(a)?(h=Date.now()+300,!0):!1}function E(a){Date.now()<h&&(a?.inputType==="insertLineBreak"||a?.data==="\\n")&&(a.preventDefault?.(),a.stopImmediatePropagation?.())}function f(a){try{a.addEventListener("compositionstart",()=>{e=!0},!0),a.addEventListener("compositionend",()=>{e=!1,m=Date.now()},!0),a.addEventListener("keydown",p,!0),a.addEventListener("beforeinput",E,!0)}catch{}}try{f(globalThis),globalThis.addEventListener?.("pagehide",()=>{e=!1,t=null,m=0,h=0},!0)}catch{}return{defer:l,suppressTerminalKey:g}})();
`;

const v11ImeGuardSource = `${imeGuardMarker}
globalThis.__codexVscodeImeGuard=(()=>{let e=!1,t=null,o=0,m=0,h=0;function n(a){let i=a?.ownerDocument?.defaultView??globalThis;return i.document??document}function r(a){return a?.key==="Enter"&&a.shiftKey&&!a.ctrlKey&&!a.altKey&&!a.metaKey?"enter":a?.metaKey&&!a.ctrlKey&&!a.altKey&&["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"].includes(a.key)?"move":""}function s(a){return e||a?.isComposing||a?.key==="Process"||a?.keyCode===229}function c(a){return s(a)||Date.now()-m<180}function d(a){let i=a?.target;return!!(i?.classList?.contains?.("xterm-helper-textarea")||i?.closest?.(".xterm"))}function y(){m=Date.now()}function l(a,i,u){let p=a?.browserEvent,g=r(p),f=g==="enter"&&d(p);if(!p||!g||g==="enter"&&!f||g!=="enter"&&!c(p))return;if(g==="enter")h=Date.now()+300;let v=Date.now();if(t&&v-o<200)return f||(p.preventDefault?.(),p.stopImmediatePropagation?.()),!0;o=v,f||(p.preventDefault?.(),p.stopImmediatePropagation?.());let b=n(p.target),S=b.activeElement,T=!1,A=()=>{if(T)return;T=!0,t=null;setTimeout(()=>{try{typeof u=="function"&&u()}catch(E){console.error("[codex-vscode-ime-guard] deferred keybinding failed",E)}},0)};t=A;try{b.addEventListener("compositionend",A,{capture:!0,once:!0})}catch{}if(g==="enter")return setTimeout(A,Math.max(120,360-(Date.now()-m))),!0;setTimeout(A,90);try{S?.blur?.(),setTimeout(()=>{try{S?.focus?.({preventScroll:!0})}catch(E){try{S?.focus?.()}catch{}}},0)}catch{}return!0}function u(a){let i=r(a);return i==="enter"&&d(a)}function p(a){u(a)&&!a.defaultPrevented&&(h=Date.now()+300)}function g(a){return u(a)?(h=Date.now()+300,!0):!1}function E(a){Date.now()<h&&(a?.inputType==="insertLineBreak"||a?.data==="\\n")&&(a.preventDefault?.(),a.stopImmediatePropagation?.())}function f(a){try{a.addEventListener("compositionstart",()=>{e=!0,y()},!0),a.addEventListener("compositionupdate",y,!0),a.addEventListener("compositionend",()=>{e=!1,y()},!0),a.addEventListener("input",y,!0),a.addEventListener("keydown",p,!0),a.addEventListener("beforeinput",E,!0)}catch{}}try{f(globalThis),globalThis.addEventListener?.("pagehide",()=>{e=!1,t=null,m=0,h=0},!0)}catch{}return{defer:l,suppressTerminalKey:g}})();
`;

const v12ImeGuardSource = `${imeGuardMarker}
globalThis.__codexVscodeImeGuard=(()=>{let e=!1,t=null,o=0,m=0,h=0;function n(a){let i=a?.ownerDocument?.defaultView??globalThis;return i.document??document}function r(a){return a?.key==="Enter"&&a.shiftKey&&!a.ctrlKey&&!a.altKey&&!a.metaKey?"enter":a?.metaKey&&!a.ctrlKey&&!a.altKey&&["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"].includes(a.key)?"move":""}function s(a){return e||a?.isComposing||a?.key==="Process"||a?.keyCode===229}function c(a){return s(a)||Date.now()-m<180}function d(a){let i=a?.target;return!!(i?.classList?.contains?.("xterm-helper-textarea")||i?.closest?.(".xterm"))}function y(){m=Date.now()}function l(a,i,u){let p=a?.browserEvent,g=r(p),f=g==="enter"&&d(p);if(!p||!g||g==="enter"&&!f||g!=="enter"&&!c(p))return;if(g==="enter")h=Date.now()+300;let v=Date.now();if(t&&v-o<200)return f||(p.preventDefault?.(),p.stopImmediatePropagation?.()),!0;o=v,f||(p.preventDefault?.(),p.stopImmediatePropagation?.());let b=n(p.target),S=b.activeElement,T=!1,A=()=>{if(T)return;T=!0,t=null;setTimeout(()=>{try{typeof u=="function"&&u()}catch(E){console.error("[codex-vscode-ime-guard] deferred keybinding failed",E)}},0)};t=A;try{b.addEventListener("compositionend",A,{capture:!0,once:!0})}catch{}if(g==="enter")return setTimeout(A,Math.max(120,360-(Date.now()-m))),!0;setTimeout(A,90);try{S?.blur?.(),setTimeout(()=>{try{S?.focus?.({preventScroll:!0})}catch(E){try{S?.focus?.()}catch{}}},0)}catch{}return!0}function u(a){let i=r(a);return i==="enter"&&d(a)}function p(a){u(a)&&!a.defaultPrevented&&(h=Date.now()+300)}function g(a){return u(a)?(h=Date.now()+300,!0):!1}function E(a){Date.now()<h&&(a?.inputType==="insertLineBreak"||a?.data==="\\n")&&(a.preventDefault?.(),a.stopImmediatePropagation?.())}function b(a,i){if(a!=="\\x1B\\n"||typeof i!="function")return;h=Date.now()+300;let u=!1,p=Date.now()+1200,g=()=>{if(u)return;let f=Date.now(),v=Math.max(0,360-(f-m));if(!e&&v===0||f>=p){u=!0;try{i()}catch(S){console.error("[codex-vscode-ime-guard] queued terminal sequence failed",S)}return}setTimeout(g,Math.min(v||60,120))};return g(),!0}function f(a){try{a.addEventListener("compositionstart",()=>{e=!0,y()},!0),a.addEventListener("compositionupdate",y,!0),a.addEventListener("compositionend",()=>{e=!1,y()},!0),a.addEventListener("input",y,!0),a.addEventListener("keydown",p,!0),a.addEventListener("beforeinput",E,!0)}catch{}}try{f(globalThis),globalThis.addEventListener?.("pagehide",()=>{e=!1,t=null,m=0,h=0},!0)}catch{}return{defer:l,suppressTerminalKey:g,queueTerminalSequence:b}})();
`;

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

const imeGuardSource = v18ImeGuardSource.replace(
  'function g(a,i){if(!u(a))return!1;let S=Date.now();h=S+1400,C="\\x1B\\r",P=S;if(typeof i=="function"){let u=!1,p=S+1200,q=()=>{if(u)return;let f=Date.now(),v=Math.max(0,360-(f-m));if(!e&&v===0||f>=p){u=!0;try{let b=i();b?.catch?.(y=>console.error("[codex-vscode-ime-guard] terminal Shift+Enter sequence failed",y))}catch(y){console.error("[codex-vscode-ime-guard] terminal Shift+Enter sequence failed",y)}return}setTimeout(q,Math.min(v||60,120))};q()}return!0}',
  'function g(a,i){if(!u(a))return!1;let S=Date.now();if(C==="\\x1B\\r"&&S-P<80)return h=S+1400,!0;h=S+1400,C="\\x1B\\r",P=S;if(typeof i=="function"){let u=!1,p=S+1200,q=()=>{if(u)return;let f=Date.now(),v=Math.max(0,360-(f-m));if(!e&&v===0||f>=p){u=!0;try{let b=i();b?.catch?.(y=>console.error("[codex-vscode-ime-guard] terminal Shift+Enter sequence failed",y))}catch(y){console.error("[codex-vscode-ime-guard] terminal Shift+Enter sequence failed",y)}return}setTimeout(q,Math.min(v||60,120))};q()}return!0}',
);

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

function ensureImeGuard(source) {
  if (source.includes(imeGuardSource)) {
    return source;
  }

  if (source.includes(legacyImeGuardSource)) {
    return source.replace(legacyImeGuardSource, imeGuardSource);
  }

  if (source.includes(v2ImeGuardSource)) {
    return source.replace(v2ImeGuardSource, imeGuardSource);
  }

  if (source.includes(v3ImeGuardSource)) {
    return source.replace(v3ImeGuardSource, imeGuardSource);
  }

  if (source.includes(v4ImeGuardSource)) {
    return source.replace(v4ImeGuardSource, imeGuardSource);
  }

  if (source.includes(v5ImeGuardSource)) {
    return source.replace(v5ImeGuardSource, imeGuardSource);
  }

  if (source.includes(v6ImeGuardSource)) {
    return source.replace(v6ImeGuardSource, imeGuardSource);
  }

  if (source.includes(v7ImeGuardSource)) {
    return source.replace(v7ImeGuardSource, imeGuardSource);
  }

  if (source.includes(v8ImeGuardSource)) {
    return source.replace(v8ImeGuardSource, imeGuardSource);
  }

  if (source.includes(v9ImeGuardSource)) {
    return source.replace(v9ImeGuardSource, imeGuardSource);
  }

  if (source.includes(v10ImeGuardSource)) {
    return source.replace(v10ImeGuardSource, imeGuardSource);
  }

  if (source.includes(v11ImeGuardSource)) {
    return source.replace(v11ImeGuardSource, imeGuardSource);
  }

  if (source.includes(v12ImeGuardSource)) {
    return source.replace(v12ImeGuardSource, imeGuardSource);
  }

  if (source.includes(v13ImeGuardSource)) {
    return source.replace(v13ImeGuardSource, imeGuardSource);
  }

  if (source.includes(v14ImeGuardSource)) {
    return source.replace(v14ImeGuardSource, imeGuardSource);
  }

  if (source.includes(v15ImeGuardSource)) {
    return source.replace(v15ImeGuardSource, imeGuardSource);
  }

  if (source.includes(v16ImeGuardSource)) {
    return source.replace(v16ImeGuardSource, imeGuardSource);
  }

  if (source.includes(v17ImeGuardSource)) {
    return source.replace(v17ImeGuardSource, imeGuardSource);
  }

  if (source.includes(v18ImeGuardSource)) {
    return source.replace(v18ImeGuardSource, imeGuardSource);
  }

  if (source.includes(imeGuardMarker)) {
    console.error('Could not apply VS Code IME guard patch safely.');
    console.error('Found an unknown existing IME guard marker.');
    console.error('Re-check the injected __codexVscodeImeGuard source before patching.');
    process.exit(1);
  }

  if (source.startsWith(patchHeader)) {
    return source.replace(patchHeader, `${patchHeader}${imeGuardSource}\n`);
  }

  return `${imeGuardSource}\n${source}`;
}

if (!fs.existsSync(workbenchPath)) {
  console.error(`VS Code workbench bundle not found: ${workbenchPath}`);
  process.exit(1);
}

const source = fs.readFileSync(workbenchPath, 'utf8');
const originalDispatchCount = countOccurrences(source, originalDispatch);
const legacyPatchedDispatchCount = countOccurrences(source, legacyPatchedDispatch);
const patchedDispatchCount = countOccurrences(source, patchedDispatch);
const originalTerminalKeyHandlerCount = countOccurrences(source, originalTerminalKeyHandler);
const legacyPatchedTerminalKeyHandlerCount = countOccurrences(
  source,
  legacyPatchedTerminalKeyHandler,
);
const patchedTerminalKeyHandlerCount = countOccurrences(source, patchedTerminalKeyHandler);
const patchedSendSequenceCallCount = countOccurrences(source, patchedSendSequenceCall);
const sourceWithoutPatchedSendSequence = source.split(patchedSendSequenceCall).join('');
const originalSendSequenceCallCount = countOccurrences(
  sourceWithoutPatchedSendSequence,
  originalSendSequenceCall,
);
const hasCurrentImeGuard = source.includes(imeGuardSource);
const hasLegacyImeGuard = source.includes(legacyImeGuardSource);

if (patchedDispatchCount > 1 || legacyPatchedDispatchCount > 1 || originalDispatchCount > 1) {
  console.error('Could not apply VS Code IME guard patch safely.');
  console.error(`Original dispatch marker count: ${originalDispatchCount}`);
  console.error(`Legacy patched dispatch marker count: ${legacyPatchedDispatchCount}`);
  console.error(`Patched dispatch marker count: ${patchedDispatchCount}`);
  console.error('VS Code internals may have changed. Re-check KeybindingService._dispatch.');
  process.exit(1);
}

if (patchedDispatchCount === 0 && legacyPatchedDispatchCount === 0 && originalDispatchCount === 0) {
  console.error('Could not apply VS Code IME guard patch safely.');
  console.error('No known KeybindingService._dispatch marker found.');
  console.error('VS Code internals may have changed. Re-check KeybindingService._dispatch.');
  process.exit(1);
}

if (
  patchedTerminalKeyHandlerCount > 1 ||
  legacyPatchedTerminalKeyHandlerCount > 1 ||
  originalTerminalKeyHandlerCount > 1
) {
  console.error('Could not apply VS Code IME guard patch safely.');
  console.error(`Original terminal key handler marker count: ${originalTerminalKeyHandlerCount}`);
  console.error(
    `Legacy patched terminal key handler marker count: ${legacyPatchedTerminalKeyHandlerCount}`,
  );
  console.error(`Patched terminal key handler marker count: ${patchedTerminalKeyHandlerCount}`);
  console.error('VS Code internals may have changed. Re-check terminal attachCustomKeyEventHandler.');
  process.exit(1);
}

if (
  patchedTerminalKeyHandlerCount === 0 &&
  legacyPatchedTerminalKeyHandlerCount === 0 &&
  originalTerminalKeyHandlerCount === 0
) {
  console.error('Could not apply VS Code IME guard patch safely.');
  console.error('No known terminal attachCustomKeyEventHandler marker found.');
  console.error('VS Code internals may have changed. Re-check terminal attachCustomKeyEventHandler.');
  process.exit(1);
}

if (patchedSendSequenceCallCount > 1 || originalSendSequenceCallCount > 1) {
  console.error('Could not apply VS Code IME guard patch safely.');
  console.error(`Original terminal sendSequence marker count: ${originalSendSequenceCallCount}`);
  console.error(`Patched terminal sendSequence marker count: ${patchedSendSequenceCallCount}`);
  console.error('VS Code internals may have changed. Re-check workbench.action.terminal.sendSequence.');
  process.exit(1);
}

if (patchedSendSequenceCallCount === 0 && originalSendSequenceCallCount === 0) {
  console.error('Could not apply VS Code IME guard patch safely.');
  console.error('No known terminal sendSequence marker found.');
  console.error('VS Code internals may have changed. Re-check workbench.action.terminal.sendSequence.');
  process.exit(1);
}

const needsDispatchPatch = patchedDispatchCount === 0;
const needsHelperPatch = !hasCurrentImeGuard;
const needsTerminalKeyHandlerPatch = patchedTerminalKeyHandlerCount === 0;
const needsSendSequencePatch = patchedSendSequenceCallCount === 0;

if (!needsDispatchPatch && !needsHelperPatch && !needsTerminalKeyHandlerPatch && !needsSendSequencePatch) {
  checkSyntax(workbenchPath);
  console.log(`Already patched: ${workbenchPath}`);
  console.log('Fully quit and reopen VS Code for the patched workbench bundle to load.');
  process.exit(0);
}

const stat = fs.statSync(workbenchPath);
const backupPath = `${workbenchPath}.codex-backup-${timestamp()}-ime-guard`;
const tempPath = `${workbenchPath}.codex-tmp-${process.pid}.js`;
let nextSource = ensureImeGuard(source);

if (needsDispatchPatch) {
  nextSource = nextSource.replace(
    legacyPatchedDispatchCount === 1 ? legacyPatchedDispatch : originalDispatch,
    patchedDispatch,
  );
}

if (needsTerminalKeyHandlerPatch) {
  nextSource = nextSource.replace(
    legacyPatchedTerminalKeyHandlerCount === 1
      ? legacyPatchedTerminalKeyHandler
      : originalTerminalKeyHandler,
    patchedTerminalKeyHandler,
  );
}

if (needsSendSequencePatch) {
  nextSource = nextSource.replace(originalSendSequenceCall, patchedSendSequenceCall);
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
console.log('Fully quit and reopen VS Code for the patched workbench bundle to load.');
