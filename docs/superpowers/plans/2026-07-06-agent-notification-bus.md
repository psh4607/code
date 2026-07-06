# Agent Notification Bus Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a provider-neutral agent notification bus for VS Code with Codex as the first provider.

**Architecture:** Codex hooks append normalized lifecycle events to a durable JSONL log. The VS Code extension polls that log, stores provider-neutral notification records, updates status-bar unread state, and routes open/read/clear commands back to matching terminals.

**Tech Stack:** Node.js CommonJS, VS Code extension API, Codex lifecycle hooks, `node:test`.

---

## Task Summary

- [x] Add provider-neutral event schema and Codex lifecycle mapping.
- [x] Add Codex hook writer that appends JSONL and always returns `{}`.
- [x] Add provider-neutral store for dedupe, unread, read, clear, and suppression behavior.
- [x] Add VS Code manager for polling, status bar, information messages, quick pick, and terminal opening.
- [x] Wire extension activation, package contributions, keybinding, and managed host hook normalization.
- [x] Run final verification.

## Files

- Created `src/agentNotificationEvents.js`
- Created `src/agentNotificationStore.js`
- Created `src/agentNotificationManager.js`
- Created `scripts/codex-notification-hook.js`
- Modified `src/hostConfig.js`
- Modified `extension.js`
- Modified `package.json`
- Added tests for each behavior area.

## Verification Plan

Run:

```sh
npm test
git diff --check
git diff --stat
```

`npm run doctor` should be run after applying host config to the live Mac. This implementation intentionally does not run `npm run apply` automatically.

Latest verification:

- `npm test`: 210/210 pass
- `git diff --check`: pass
- `npm run doctor`: expected host drift in this isolated worktree until `npm run apply` is run from the source checkout
