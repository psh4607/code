# Terminal Detach TTL Implementation Plan

> Superseded note, 2026-07-03: VS Code terminal process revival is now preferred on normal
> shutdown. The current policy keeps persistent sessions enabled, uses
> `terminal.integrated.persistentSessionReviveProcess: "onExitAndWindowClose"`, and does not kill
> open or tracked detached terminal processes during extension shutdown.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make VS Code terminal `cmd+w` detach sessions temporarily, auto-kill detached sessions after one hour, and kill VS Code terminals when VS Code exits.

**Architecture:** Add a focused detached-terminal TTL manager to the local VS Code extension. The manager records terminal root PIDs at detach time, removes them when reattached, sweeps expired records, and kills recorded processes during extension shutdown. User keybindings call extension wrapper commands instead of raw VS Code attach/detach commands.

**Tech Stack:** VS Code extension API, Node.js `node:test`, macOS process signals, user `settings.json` and `keybindings.json`.

---

### Task 1: Detached Terminal TTL Manager

**Files:**
- Create: `src/detachedTerminalTtl.js`
- Test: `test/detachedTerminalTtl.test.js`

- [x] **Step 1: Write failing tests**

Tests should verify detach records the active terminal PID, attach removes the reattached PID, sweeps kill only expired records, and shutdown kills all tracked records.

- [x] **Step 2: Run tests and verify red**

Run: `npm test -- test/detachedTerminalTtl.test.js`

- [x] **Step 3: Implement manager**

Create a small manager with injectable storage, clock, timer, sleep, and kill functions. Default production kill should terminate the recorded PID and its descendants. On extension shutdown, dispose open VS Code terminals and then kill all tracked detached PIDs.

- [x] **Step 4: Run tests and verify green**

Run: `npm test -- test/detachedTerminalTtl.test.js`

### Task 2: Extension Commands and User Settings

**Files:**
- Modify: `extension.js`
- Modify: `package.json`
- Modify: `/Users/seongho/Library/Application Support/Code/User/keybindings.json`
- Modify: `/Users/seongho/Library/Application Support/Code/User/settings.json`

- [x] **Step 1: Register commands**

Add `codexTerminal.detachWithTtl` and `codexTerminal.attachDetachedSession` to activation events and command registration.

- [x] **Step 2: Wire keybindings**

Map terminal `cmd+w` to `codexTerminal.detachWithTtl` and `cmd+shift+t` to `codexTerminal.attachDetachedSession`.

- [x] **Step 3: Keep manual detach available**

Keep `terminal.integrated.enablePersistentSessions` as `true` so manual detach/attach can keep working. The later terminal revival work changed the managed policy to revive terminal processes after normal shutdown instead of killing open and tracked terminals when VS Code closes.

### Task 3: Verification

**Files:**
- Verify all touched JS and JSONC files.

- [x] **Step 1: Run extension tests**

Run: `npm test`

- [x] **Step 2: Run JS syntax checks**

Run: `node --check extension.js && node --check src/detachedTerminalTtl.js`

- [x] **Step 3: Validate user JSONC**

Parse `settings.json` and `keybindings.json` after stripping JSONC comments/trailing commas.
