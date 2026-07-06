# Agent Notification Bus Design

## Goal

Build a full-feature notification layer for agent terminals in VS Code. The internal model is provider-neutral so it can later support Claude, OpenCode, or long-running shell tasks, while the first provider implementation is Codex.

## Reference Pattern

cmux provides the product model: every notification belongs to a workspace or pane, keeps unread state, suppresses noisy external delivery when the pane is already focused, and gives the user a fast jump-to-unread path.

Warp provides the transport model: lifecycle hooks emit structured events, and the terminal app interprets those events as agent-session notifications.

This repo combines those ideas without depending on unsupported VS Code terminal OSC notification handling. Codex hooks write structured events into a durable local JSONL log. The VS Code extension reads that stream, matches events back to terminals and sessions, and owns presentation state.

## Scope

In scope:

- A provider-neutral event schema.
- A Codex hook that converts Codex lifecycle payloads into notification events.
- Durable event ingestion from `~/.codex/codex-vscode-terminal-tools/notifications/events.jsonl`.
- VS Code extension state for unread notifications, session matching, dedupe, and read/clear actions.
- Status bar presentation with unread count and latest summary.
- VS Code notifications for meaningful agent events.
- Commands to show recent notifications, jump to the latest unread terminal, mark notifications read, and clear notifications.
- Host config normalization so the Codex hook is installed idempotently alongside the existing session-registry hook.

Out of scope for the first implementation:

- Native macOS `UNUserNotificationCenter` integration outside VS Code.
- A custom Webview notification center.
- A local socket fast path.
- Non-Codex providers.

## Architecture

The system has four layers.

1. `scripts/codex-notification-hook.js`
   Runs as a Codex command hook for lifecycle events. It reads hook JSON from stdin, normalizes it into an agent notification event, appends it to JSONL, and prints `{}` so the hook never blocks Codex startup or turn completion.

2. `src/agentNotificationEvents.js`
   Defines schema normalization, Codex hook event mapping, JSONL parsing, presentable event classification, and validation.

3. `src/agentNotificationStore.js`
   Owns provider-neutral notification records, unread state, dedupe, prompt-submitted read resolution, and focused-terminal suppression policy.

4. `src/agentNotificationManager.js`
   Owns the VS Code integration. It polls the JSONL stream, updates the store, creates a status bar item, sends `window.showInformationMessage` prompts for user-actionable events, and exposes command handlers.

## Event Schema

Events are newline-delimited JSON with `schemaVersion`, `id`, `provider`, `event`, `severity`, `sessionId`, `cwd`, `terminalPid`, `title`, `subtitle`, `body`, `createdAt`, `dedupeKey`, and `source`.

Allowed events:

- `session_started`
- `prompt_submitted`
- `permission_requested`
- `tool_started`
- `tool_finished`
- `turn_finished`
- `needs_input`
- `error`

Allowed severities:

- `info`
- `success`
- `waiting`
- `warning`
- `error`

## Codex Provider Mapping

- `SessionStart` -> `session_started`, severity `info`, recorded by the hook but not presented as unread.
- `UserPromptSubmit` -> `prompt_submitted`, severity `info`, marks waiting records for the same session as read.
- `PermissionRequest` -> `permission_requested`, severity `waiting`, shown and marked unread.
- `PreToolUse` -> `tool_started`, severity `info`, not shown by default.
- `PostToolUse` -> `tool_finished` or `error`, depending on payload failure signals.
- `Stop` -> `turn_finished`, severity `success`, shown and marked unread unless deduped or suppressed.

## State and Presentation

The store keeps newest records first, dedupes by `dedupeKey`, and only creates records for presentable events. `prompt_submitted` does not create a record; it resolves prior waiting records for the same session.

If the matching terminal is active and VS Code is focused, external presentation is suppressed and the record is stored as read. This mirrors cmux's focused-pane suppression.

The manager exposes:

- `codexTerminal.showAgentNotifications`
- `codexTerminal.openLatestAgentNotification`
- `codexTerminal.markAgentNotificationsRead`
- `codexTerminal.clearAgentNotifications`

`cmd+shift+u` jumps to the latest unread notification, matching the cmux jump-to-unread concept.

## Host Config

`normalizeCodexHooksJson` installs a managed notification hook for:

- `SessionStart`
- `UserPromptSubmit`
- `PermissionRequest`
- `PreToolUse`
- `PostToolUse`
- `Stop`

Managed marker:

- `#codex-vscode-terminal-tools:agent-notifications:v1`

The existing `SessionStart` session-registry hook remains installed and idempotent.

## Testing

Unit tests cover event mapping, hook writing, JSONL parsing, store dedupe/read behavior, manager polling/status/presentation/opening, package contributions, and host config normalization.

Verification is `npm test`. `npm run doctor` is useful after applying host config to this Mac, but implementation does not run `npm run apply` automatically.

