# Codex Session Auto Resume Design

## Goal

When VS Code restores integrated terminals after restart, keep the terminal list and metadata under
VS Code's persistent-session behavior, then add one custom recovery step for Codex terminals whose
PTY process was not revived: send `codex resume <session-id>` into the restored idle shell.

## Non-Goals

- Do not recreate terminals manually.
- Do not duplicate VS Code's persistent terminal storage.
- Do not claim PTY/process continuity when VS Code revived only a shell.
- Do not read terminal scrollback; VS Code extensions do not expose it.

## Detection

The extension records a terminal as resume-capable only when it can discover a Codex session UUID
from one of these sources:

- the terminal tab title/name;
- a shell integration command line such as `codex resume <session-id>`.

The managed host config keeps Codex `terminal_title` configured with `thread-id` so this UUID is
available in normal Codex terminal tabs. The extension deliberately does not infer a session from a
cwd-only title such as `~/projects/dalpha/inf`; many terminals can share the same cwd and that can
move a session record onto the wrong idle shell.

For each record it stores:

- session id;
- title;
- cwd;
- terminal index;
- terminal process id;
- whether a Codex CLI process was last observed under that terminal process tree.

## Restore Policy

On extension startup:

1. Wait briefly for VS Code's built-in persistent terminal restore to finish.
2. Iterate restored terminals in current tab order.
3. Match each terminal to the stored session record by session id, then title/cwd/index fallback.
4. Send `codex resume <session-id>` only when all of these are true:
   - the record was last observed with an active Codex CLI process;
   - this activation has not already resumed that session;
   - the current terminal process tree does not contain Codex;
   - the current terminal has no child process and its root is a known interactive shell.

## Safety

If process inspection fails or the terminal process id is not available, skip auto resume. If another
child process is running, skip auto resume. This avoids injecting `codex resume` into a busy terminal
or into a terminal where VS Code already revived Codex successfully.

## Limits

If a terminal title never exposes a session id and the user did not launch it via `codex resume
<session-id>`, the extension cannot infer the mapping. To make the feature reliable for custom
titles, keep the session UUID in the title format or resume the session once with an explicit id.
