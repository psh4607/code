# Codex Session Hook Registry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove `thread-id` from visible Codex title surfaces while preserving VS Code restart auto-resume through a Codex SessionStart hook registry.

**Architecture:** A managed Codex hook writes session metadata to a small JSON registry under `~/.codex/codex-vscode-terminal-tools/`. Host config installs that hook alongside existing hooks and stops forcing `thread-id` into visible `terminal_title` or `status_line` output. The VS Code extension reads the registry during snapshots/restores and uses terminal PID and cwd to map restored terminals back to full Codex session ids.

**Tech Stack:** Node.js CommonJS, VS Code extension API, Codex `hooks.json`, `node --test`.

---

### Task 1: Managed Host Config

**Files:**
- Modify: `src/hostConfig.js`
- Modify: `test/hostConfig.test.js`

- [ ] **Step 1: Write failing tests**

Add tests that expect `normalizeCodexConfigToml` to remove `thread-id` from visible title/status surfaces, and expect a hook normalizer to append a managed `SessionStart` hook without removing existing hooks.

Run: `node --test test/hostConfig.test.js`

Expected: FAIL because the current code still inserts `thread-id` into `terminal_title` and has no hook normalizer.

- [ ] **Step 2: Implement host config changes**

Update `src/hostConfig.js` so `DEFAULT_CODEX_TERMINAL_TITLE` is `["activity", "project-name", "thread-title", "fast-mode"]`, `normalizeCodexConfigToml` removes `thread-id` from `terminal_title` and `status_line`, and `applyHostConfig`/`checkHostConfig` manage `~/.codex/hooks.json` with a command like:

```json
{
  "type": "command",
  "command": "node <projectRoot>/scripts/codex-session-registry-hook.js #codex-vscode-terminal-tools:session-registry:v1"
}
```

- [ ] **Step 3: Verify host config tests pass**

Run: `node --test test/hostConfig.test.js`

Expected: PASS.

### Task 2: Hook Registry Writer

**Files:**
- Create: `scripts/codex-session-registry-hook.js`
- Create: `test/codexSessionRegistryHook.test.js`

- [ ] **Step 1: Write failing hook tests**

Add tests that run the hook script with JSON stdin containing `hook_event_name: "SessionStart"`, `session_id`, `cwd`, and a controlled registry path env var. Assert the registry contains a normalized record and the hook prints `{}`.

Run: `node --test test/codexSessionRegistryHook.test.js`

Expected: FAIL because the script does not exist.

- [ ] **Step 2: Implement hook script**

Create a best-effort hook that reads stdin JSON, ignores non-SessionStart payloads without failing, writes an atomic JSON registry with newest records first, and always prints `{}`.

- [ ] **Step 3: Verify hook tests pass**

Run: `node --test test/codexSessionRegistryHook.test.js`

Expected: PASS.

### Task 3: Resume Registry Ingestion

**Files:**
- Modify: `src/codexSessionResume.js`
- Modify: `test/codexSessionResume.test.js`

- [ ] **Step 1: Write failing resume tests**

Add tests where a terminal title has no UUID, the hook registry contains the full session id for the terminal PID/cwd, and `restoreCodexSessions` sends `codex resume <session-id>`.

Run: `node --test test/codexSessionResume.test.js`

Expected: FAIL because current resume logic only gets new full ids from title or command execution.

- [ ] **Step 2: Implement registry ingestion**

Add registry loading to `createCodexSessionResumeManager`, merge matching registry records in `snapshotTerminals` and `restoreCodexSessions`, prefer PID matches, then same cwd/tab-index latest match, and keep the existing process safety checks.

- [ ] **Step 3: Verify resume tests pass**

Run: `node --test test/codexSessionResume.test.js`

Expected: PASS.

### Task 4: Full Verification

**Files:**
- Verify all changed files.

- [ ] **Step 1: Run full tests**

Run: `npm test`

Expected: PASS.

- [ ] **Step 2: Check generated host state and apply**

Run a targeted Node assertion against `normalizeCodexConfigToml` and the hook normalizer to confirm desired output, then run `npm run apply` to update the managed host config.

Expected: visible title/status items exclude `thread-id`; managed `SessionStart` hook is present.
