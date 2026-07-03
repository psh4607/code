# Codex VS Code Terminal Tools

Local VS Code extension for small Codex terminal workflows.

## One-Command Host Management

This project is the source of truth for the local VS Code/Codex terminal setup on this Mac.

Check whether everything is still applied:

```sh
npm run doctor
```

Reapply the full managed setup:

```sh
npm run apply
```

`npm run apply` manages:

- VS Code user settings needed by these terminal workflows.
- VS Code user keybindings for `Cmd+T`, `Cmd+W`, `Cmd+R`, and `Cmd+Shift+T`.
- The `.zshrc` cwd-title hook for VS Code terminal tab titles.
- The Codex `terminal_title` setting so Codex terminal tabs expose `thread-id`.
- The local VS Code extension symlink under `~/.vscode/extensions`.
- The global `patch-vscode-terminal-order` wrapper.
- The global `patch-vscode-ime-guard` wrapper.
- The VS Code workbench bundle/CSS patches, Claude Code title-menu patch, and managed VS Code app icon.

The managed terminal settings keep VS Code's persistent terminal sessions enabled and set
`terminal.integrated.persistentSessionReviveProcess` to `onExitAndWindowClose`, so normal VS Code
shutdowns can revive integrated terminal processes and scrollback on the next launch.

## New Terminal From Active Cwd

Press `Cmd+T` to create and focus a new integrated terminal using the active terminal's current working directory.

This uses VS Code's split-then-unsplit terminal flow so the new terminal is created adjacent to the active terminal instead of being appended to the end of the terminal list. The cwd inheritance depends on `terminal.integrated.splitCwd` being set to `inherited`.

VS Code normally unsplits a terminal into a new group at the end of the terminal list. This machine patches the local VS Code workbench bundle so unsplit inserts the new terminal group right after the active group:

```sh
npm run patch:vscode-terminal-order
```

From any directory, the same patch can be run as:

```sh
patch-vscode-terminal-order
```

Run it again after manually updating VS Code. The global wrapper now runs all local workbench patches, including the IME composition guard described below. User setting `update.mode: none` is used to prevent VS Code from replacing the patched bundle automatically.

## Persistent Terminal Revival

VS Code's built-in persistent terminal session support is the first restore path. This project keeps
`terminal.integrated.enablePersistentSessions` enabled and asks VS Code to revive terminal processes
on app exit and window close. During extension shutdown, the helper only disposes its timers and
listeners; it does not kill open terminal processes or tracked detached terminal PIDs.

`Cmd+W` still detaches the active terminal with a one-hour TTL while VS Code is running. Expired
detached sessions are swept while the extension is active, including on the next activation after a
restart.

## Codex Session Auto Resume

The extension keeps a small VS Code global-state snapshot for terminals whose tab title or shell
execution command exposes a Codex session UUID. While VS Code is running it periodically checks those
terminal process trees and remembers whether a matching Codex CLI process was actually active.

On the next VS Code startup, after VS Code has had a chance to restore persistent terminals, the
extension inspects each restored terminal in tab order. If the last snapshot said that terminal was
running Codex, the restored process tree no longer contains a Codex CLI process, and the terminal is
now only an idle shell, it sends:

```sh
codex resume <session-id>
```

It does not send the command when VS Code successfully revived the original Codex process, when the
terminal has any other child process running, or when the last observed state was an idle shell. This
is still a resume of the Codex thread, not a resurrection of the old PTY process; terminal scrollback
and live process continuity remain VS Code persistent-session behavior.

Settings:

```json
"codexTerminal.autoResumeCodexSessions": true,
"codexTerminal.codexResumeStartupDelayMs": 1000
```

For reliable matching, `npm run apply` keeps Codex `terminal_title` configured with `thread-id`.
Without a visible session UUID, the extension intentionally refuses to match by cwd-only titles such
as `~/projects/dalpha/inf`, because several terminals can share the same cwd.

## VS Code App Icon

This project keeps Warp's Glass Sky app icon source at `assets/warp-glass-sky.png`, stores the generated macOS icon at `assets/warp-glass-sky.icns`, and installs it over VS Code's app icon:

```sh
npm run patch:vscode-icon
```

The full patch command also applies it:

```sh
patch-vscode-terminal-order
```

Run it again after a VS Code update. The patch backs up the current `Code.icns` before overwriting it.
It also applies the same image as a Finder custom app icon on the `.app` bundle, which helps Dock and Finder pick up the icon when macOS ignores the changed `CFBundleIconFile` resource.
For the running Dock tile, the full patch command also patches VS Code's Electron main bundle so startup calls `app.dock.setIcon(...)` with the managed PNG:

```sh
npm run patch:vscode-dock-icon
```

Fully quit and reopen VS Code after this patch. The runtime Dock icon cannot update inside an already-running VS Code process.

## Empty Editor Watermark

VS Code draws the large translucent logo on empty editor groups from the workbench CSS `letterpress` rule. This machine hides just that logo while leaving the editor background and normal empty-window UI intact:

```sh
npm run patch:vscode-watermark
```

The full patch command also applies it:

```sh
patch-vscode-terminal-order
```

Run it again after a VS Code update. The patch backs up the current workbench CSS before appending the managed hide rule.

## Korean IME Composition Guard

VS Code can dispatch terminal/editor keybindings before a Korean IME composition has committed its final syllable. In the integrated terminal this can move the last Hangul syllable when `Shift+Enter` or `Cmd+Arrow` is pressed while the syllable is still composing.

This machine patches `KeybindingService._dispatch` so `Shift+Enter` and `Cmd+Arrow*` are deferred while an IME composition is active. For terminal `Shift+Enter`, the managed setup removes the previous custom `workbench.action.terminal.sendSequence` keybinding. The IME guard blocks xterm's native line-break path, waits for the IME activity to settle, then sends one `ESC + CR` sequence directly through the terminal instance. Terminal `Shift+Enter` is deferred briefly even when the browser event does not expose a composition signal, so the final Hangul syllable can commit before the terminal sequence runs.

The helper also capture-blocks the terminal textarea's native line-break path for a window that outlasts the queued terminal sequence. It suppresses `beforeinput` line breaks, paragraph inserts, CR/LF payloads, and the follow-up Enter `keypress` while preserving the original keydown default that lets macOS Korean IME commit the composing syllable. If VS Code still reaches the `sendSequence` path for a stale or manually configured terminal `ESC + LF`/`ESC + CR` sequence, the helper either consumes or queues that managed sequence so duplicate line breaks do not reach the PTY.

For terminal `Shift+Enter`, the helper preserves the native keydown default so macOS Korean IME can commit the composing syllable normally. It only suppresses the native line break and then emits one `ESC + CR` after a short delay.

The delay is longer when `Shift+Enter` happens immediately after recent IME text activity. The helper tracks `compositionupdate`, `compositionend`, and `input` events and waits for a short quiet window before dispatching VS Code keybindings. It also patches `workbench.action.terminal.sendSequence` defensively for stale/manual terminal sequence bindings. This covers the fast path where the final Hangul syllable has visually appeared but has not fully settled in the terminal yet.

Recorder evidence from this machine showed that one terminal `Shift+Enter` can dispatch the managed `ESC + CR` sequence twice within a few milliseconds. A later run with the managed keybinding removed showed no CR/LF at all, proving the native path was being suppressed without a replacement sender. Another run showed the direct sender can be invoked multiple times for the same key event. The helper therefore now owns terminal `Shift+Enter`: it sends one delayed `ESC + CR` directly and drops both duplicate direct sends and duplicate `ESC + CR` or `ESC + LF` terminal sequences that arrive inside an 80ms window.

```sh
npm run patch:vscode-ime-guard
```

The global recovery command also applies it:

```sh
patch-vscode-terminal-order
```

For just the IME guard patch:

```sh
patch-vscode-ime-guard
```

## Terminal Input Recorder

Before changing the IME patch again, record the raw bytes that VS Code sends to the terminal process:

```sh
npm run record:terminal-input
```

Run that command inside a VS Code integrated terminal. When the recorder is waiting, type `나의사랑한글날`, press `Shift+Enter` once, then press `Ctrl+C`. The recorder prints each stdin chunk and writes a JSONL log under `/tmp`.

Use the log to choose the next patch:

- `1b 0d` once means VS Code sent only one terminal `ESC + CR` sequence.
- `0d 1b 0d`, `0a 1b 0d`, or multiple CR/LF bytes means native terminal input and managed `sendSequence` both reached the process.
- Hangul UTF-8 bytes after CR/LF means the final IME commit arrived after the line break.

## Smart Terminal Paste

The extension binds `Cmd+V` in the integrated terminal to `codexTerminal.smartPaste`.
On macOS it checks clipboard type metadata with `osascript -e 'clipboard info'`.
If the clipboard contains a copied video file such as `.mov`, `.mp4`, `.mkv`, or `.webm`, it reads the clipboard file URL and inserts the shell-quoted POSIX path into the active terminal without pressing Enter.
Video file detection runs before image detection because Finder can expose preview image flavors for copied media files.
If the clipboard contains an image flavor such as PNG, TIFF, JPEG, GIF, or HEIC, it sends `Ctrl+V` (`\x16`) to the active terminal so Codex can handle image paste.
Otherwise it delegates to VS Code's normal `workbench.action.terminal.paste`, so text paste stays unchanged.

## Cwd-Based Terminal Icon Color

The extension watches shell integration cwd changes for the active terminal and updates the terminal tab icon color.

Color resolution order:

1. A manually selected terminal tab color is stored as an exact `cwd -> color` mapping and reused for that cwd.
2. Optional `codexTerminal.cwdColorRules` path-prefix rules can override hash colors.
3. If no mapping exists, the cwd is hashed into a stable ANSI color, so the same path gets the same color every time.

Optional path-prefix overrides:

```json
"codexTerminal.cwdColorRules": [
  { "path": "/Users/seongho/projects/dalpha/inf", "color": "terminal.ansiGreen" }
]
```

Longest matching path prefix wins, and path segment boundaries are respected.

VS Code's public extension API only accepts a terminal icon color at terminal creation time, so this machine also patches `workbench.action.terminal.changeColorActiveTab` to accept a color argument from this extension. It patches both `workbench.action.terminal.changeColor` and `workbench.action.terminal.changeColorActiveTab` to report manual selections back to the extension. Re-run the same patch command after VS Code updates.

## Rename Current Codex Thread

When the integrated terminal has focus, press `Cmd+R`.

The extension opens a VS Code input box, then sends these lines to the active terminal:

```text
/rename
<your thread name>
```

This is intended for a Codex CLI TUI session that is already running in the active VS Code terminal.
