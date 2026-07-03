# Codex Session Auto Resume Plan

## Scope

Add a host-local VS Code extension layer that resumes known Codex sessions after VS Code terminal
restore when the original Codex process was not revived.

## Steps

1. Add unit tests for session id extraction, shell execution capture, process tree parsing, safe
   resume, duplicate prevention, and disabled configuration.
2. Implement `src/codexSessionResume.js`.
3. Wire the manager into `extension.js` activation/deactivation.
4. Add user-facing settings in `package.json`.
5. Document the behavior and limitations in `README.md`.
6. Verify with targeted tests, full test suite, syntax checks, and `npm run doctor`.

## Acceptance Criteria

- A restored idle shell with a stored active Codex session receives exactly one
  `codex resume <session-id>` command.
- A terminal that already has a Codex CLI process receives no command.
- A terminal last observed as idle receives no command.
- The feature is enabled by default and can be disabled with
  `codexTerminal.autoResumeCodexSessions`.
