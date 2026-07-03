# Terminal Persistent Revival Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let VS Code revive integrated terminal processes and scrollback after restart instead of the local helper killing them on shutdown.

**Architecture:** Keep using VS Code's built-in persistent terminal backend. Change managed host settings to request process revival on exit and window close, and change the extension shutdown path so detached TTL cleanup only runs during active extension lifetime.

**Tech Stack:** VS Code extension API, Node.js `node:test`, local VS Code user settings managed by `src/hostConfig.js`.

---

### Task 1: Managed Persistent Session Setting

**Files:**
- Modify: `test/hostConfig.test.js`
- Modify: `src/hostConfig.js`
- Modify: `README.md`

- [x] **Step 1: Write the failing test**

Update `normalizeSettings applies managed VS Code settings without dropping existing values` so it expects:

```js
assert.equal(
  value['terminal.integrated.persistentSessionReviveProcess'],
  'onExitAndWindowClose',
);
```

- [x] **Step 2: Run test to verify it fails**

Run: `node --test test/hostConfig.test.js`

Expected: FAIL because the current implementation returns `never`.

- [x] **Step 3: Write minimal implementation**

Change `MANAGED_SETTINGS['terminal.integrated.persistentSessionReviveProcess']` to `onExitAndWindowClose`.

- [x] **Step 4: Run test to verify it passes**

Run: `node --test test/hostConfig.test.js`

Expected: PASS.

### Task 2: Extension Shutdown Policy

**Files:**
- Modify: `test/detachedTerminalTtl.test.js`
- Modify: `src/detachedTerminalTtl.js`
- Modify: `extension.js`

- [x] **Step 1: Write the failing test**

Add a test that calls a new shutdown method and verifies it does not dispose open terminals and does not kill tracked detached PIDs.

- [x] **Step 2: Run test to verify it fails**

Run: `node --test test/detachedTerminalTtl.test.js`

Expected: FAIL until the new shutdown method exists.

- [x] **Step 3: Write minimal implementation**

Add `stopForExtensionShutdown()` to the detached terminal TTL manager. It should call `dispose()` only. Update `extension.deactivate()` to call `stopForExtensionShutdown()` instead of `killAllTerminalState()`.

- [x] **Step 4: Run test to verify it passes**

Run: `node --test test/detachedTerminalTtl.test.js`

Expected: PASS.

### Task 3: Apply Host Config and Verify

**Files:**
- Modify through script: `/Users/seongho/Library/Application Support/Code/User/settings.json`

- [x] **Step 1: Run focused tests**

Run: `node --test test/hostConfig.test.js test/detachedTerminalTtl.test.js`

Expected: PASS.

- [x] **Step 2: Run full tests**

Run: `npm test`

Expected: PASS.

- [x] **Step 3: Apply the managed host setting**

Run: `npm run apply`

Expected: user settings contain `terminal.integrated.persistentSessionReviveProcess: "onExitAndWindowClose"`.

- [x] **Step 4: Verify syntax**

Run: `node --check extension.js && node --check src/detachedTerminalTtl.js && node --check src/hostConfig.js`

Expected: all commands exit 0.
