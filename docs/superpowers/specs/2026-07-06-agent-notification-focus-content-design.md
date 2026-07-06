# Agent Notification Focus and Content Design

## Goal

Make VS Code agent notifications behave more like a terminal-native agent surface:
clicking an unread notification should jump to the exact Codex session terminal, and
the notification text should identify the state, project, and action without opening
the terminal first.

## Reference Behaviors

Warp groups agent notifications into completion, request, and error states, and
clicking an in-app notification jumps to the agent session. cmux exposes pane-level
attention through rings, sidebar text, and a notification panel. This extension maps
those ideas onto VS Code primitives: status bar unread count, VS Code toast, quick
pick inbox, and terminal focus.

## Design

- Terminal focus first tries the event `terminalPid`.
- If that pid is missing or stale, terminal focus falls back to the Codex session
  registry using the notification `sessionId`.
- A successful open calls `terminal.show(false)` so VS Code makes the matching
  terminal active instead of merely revealing the terminal panel.
- Notifications use a shared summary format: `<kind> - <project> - <title>`.
- Details use the action body when present, then fall back to cwd and session id.
- The quick pick inbox keeps the original title as the label, with kind/cwd/session
  context in the detail field for fast scanning.

## Testing

Unit tests cover direct pid focus, missing-pid session-registry fallback, stale-pid
registry fallback, rich toast text, status-bar tooltip text, and quick-pick detail
formatting.
