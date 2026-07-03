# Terminal Persistent Revival Design

## Goal

VS Code를 정상 종료한 뒤 다시 열었을 때 기존 integrated terminal의 실행 중 프로세스와 scrollback을 가능한 한 이어받는다.

## Pre-Change Behavior

The host config already enabled `terminal.integrated.enablePersistentSessions`, but it forced `terminal.integrated.persistentSessionReviveProcess` to `never`. The extension also called `killAllTerminalState()` during `deactivate()`, which disposed open terminals and killed tracked detached terminal PIDs. Those two choices intentionally prevented process revival.

## Design

Use VS Code's built-in persistent terminal process and buffer revival first. The managed setting should be `terminal.integrated.persistentSessionReviveProcess: "onExitAndWindowClose"` so regular app exits and window closes can persist terminal processes. The extension should stop killing open and detached terminal processes during shutdown; TTL cleanup should continue while the extension is running and on the next activation.

Do not add a workbench patch in the first implementation. The VS Code workbench already has `persistTerminalState()` and `reviveTerminalProcesses(...)` paths, and patching the minified bundle should be reserved for a verified gap after the built-in flow is enabled.

## Scope

The expected restoration target is normal integrated terminals backed by VS Code process support. Custom pty terminals, feature terminals, transient terminals, crash/force-quit scenarios, and terminals explicitly killed by the user may not revive.

## Testing

Unit tests should cover the managed setting change and extension shutdown policy. Existing host config tests should fail until `persistentSessionReviveProcess` changes from `never` to `onExitAndWindowClose`. Detached terminal tests should fail until shutdown cleanup stops disposing open terminals and killing tracked detached PIDs.
