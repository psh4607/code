# Codex VS Code Terminal Tools

This is a host-local VS Code helper extension for Seongho's Mac.

## Operating Model

This repo is the source of truth for the local VS Code/Codex terminal setup on
this Mac. Treat it as an idempotent host-management project, not as a normal
portable VS Code extension.

The intended maintenance path is:

1. Encode desired host state in this repo.
2. Reapply it with `npm run apply`.
3. Check drift with `npm run doctor`.
4. Re-run the same flow after VS Code updates or host config drift.

The official `/Applications/Visual Studio Code.app` bundle is the upstream source for refreshing the
managed runtime bundle at `/Applications/Code.app`, copied from the upstream app with display name
`Code`. Local bundle patches are intentionally applied to both `/Applications/Code.app` and
`/Applications/Visual Studio Code.app` so either launcher shows the same terminal behavior. Keep VS
Code user data shared with the existing `Code` profile; do not split
`/Users/seongho/Library/Application Support/Code/User` or `~/.vscode/extensions` unless explicitly
asked.
Keep the managed app on the separate local bundle id `com.seongho.Code`, patch the helper bundle ids
to `com.seongho.Code.helper`, and ad-hoc sign both VS Code app bundles after every bundle patch.
Changing only the root bundle id without re-signing causes macOS launchd to reject the app before
startup.

Do not create a second umbrella repo for these local patches. Extend this
project and keep host writes repeatable.

## Managed Surfaces

`npm run apply` owns these host surfaces:

- The managed `/Applications/Code.app` bundle copied from `/Applications/Visual Studio Code.app`.
- The managed `Code.app` bundle identity and final ad-hoc signature.
- The upstream `/Applications/Visual Studio Code.app` workbench/CSS/icon/Dock patches and final
  ad-hoc signature.
- VS Code user settings in `/Users/seongho/Library/Application Support/Code/User/settings.json`.
- VS Code user keybindings in `/Users/seongho/Library/Application Support/Code/User/keybindings.json`.
- The `.zshrc` cwd-title hook used by VS Code terminal tab titles.
- The Codex `terminal_title` config so Codex tabs expose `thread-id`.
- The local extension symlink under `~/.vscode/extensions`.
- The global `patch-vscode-terminal-order` wrapper.
- The global `patch-vscode-ime-guard` wrapper.
- The `Code.app` and upstream VS Code workbench bundle/CSS patches, Claude Code title-menu patch,
  managed VS Code app icon, and runtime Dock icon patch.

The important source files are:

- `src/hostConfig.js`: desired host state, normalization, and drift checks.
- `scripts/apply-host-config.js`: ensure managed `Code.app`, normalize host files, run `npm run patch`, then verify.
- `scripts/patch-vscode-all-targets.js`: apply every local bundle/CSS/icon patch to both app
  bundles, then sign each target.
- `scripts/sign-vscode-app.js`: remove signing-incompatible Finder custom icon metadata and ad-hoc
  sign the requested VS Code app bundle.
- `scripts/doctor.js`: read-only host drift check.
- `scripts/patch-vscode-*.js`: app bundle, CSS, icon, Dock icon, and IME patches.
- `src/*`: extension behavior for terminal creation, paste, rename, detached sessions,
  cwd-based terminal tab colors, and Codex session resume.
- `test/*.test.js`: unit coverage for host config, patch scripts, and extension helpers.

## Normal Commands

Check whether the managed setup is still applied:

```sh
npm run doctor
```

Reapply the full managed setup:

```sh
npm run apply
```

Run all local tests:

```sh
npm test
```

Run the patch sequence only:

```sh
npm run patch
```

The global recovery command is:

```sh
patch-vscode-terminal-order
```

It runs the full local patch sequence through the wrapper installed by
`npm run apply`.

For only the IME guard patch:

```sh
patch-vscode-ime-guard
```

## VS Code Update Recovery

VS Code app updates can replace the upstream bundle used to refresh `Code.app`. When terminal
creation starts appending to the bottom again, terminal tab colors stop
following cwd/manual mappings, the empty-editor watermark returns, the Dock/app
icon resets, the Claude Code title buttons return, or Korean IME composition
handling regresses, run:

```sh
npm run apply
```

If only bundle patches are needed and host settings are already correct, run:

```sh
npm run patch
```

After patching either app bundle or Electron main bundle, fully quit and reopen the app you are
using. `Developer: Reload Window` is not enough because those bundles are loaded by the app process.

## Guardrails

- Do not build a separate VS Code source fork for this behavior. The managed `Code.app` copy plus reapply script is the intended maintenance path.
- Keep `/Applications/Visual Studio Code.app` as the refresh source for `Code.app`, but apply local
  bundle patches to both `/Applications/Code.app` and `/Applications/Visual Studio Code.app`.
- Do not re-enable Finder custom app icons by default. The `Icon\r` resource fork and FinderInfo
  metadata prevent ad-hoc signing and can make macOS report the patched app as damaged.
- Keep `update.mode` set to `none` in `/Users/seongho/Library/Application Support/Code/User/settings.json` unless the user explicitly asks to restore automatic updates.
- Keep VS Code excluded from Homebrew upgrades with `brew pin --cask visual-studio-code` unless the user explicitly asks to restore automatic upgrades. `update.mode: none` and the Homebrew pin cover different update paths.
- Do not hand-edit host files as a one-off fix when the state should be durable. Put the desired state in `src/hostConfig.js` or a patch script, then use `npm run apply`.
- Do not silently relax managed settings or keybindings to make `doctor` pass. Explain the tradeoff first if a user request conflicts with the managed behavior.
- Do not match Codex terminal sessions by cwd alone. Session resume depends on a visible `thread-id` in the Codex terminal title because several terminals can share the same cwd.
- Do not treat VS Code persistent sessions and `codex resume <session-id>` as the same mechanism. Persistent sessions are VS Code's PTY/process restore path; Codex auto-resume only sends a resume command into a restored idle shell when the old Codex process was not revived.
- If direct VS Code API support exists, prefer it. Patch the minified VS Code bundle only for host-local behaviors the public extension API cannot provide.
- If a patch script says VS Code internals changed, stop and inspect the current target in
  `/Applications/Code.app/Contents/Resources/app/out/vs/workbench/workbench.desktop.main.js`,
  `/Applications/Visual Studio Code.app/Contents/Resources/app/out/vs/workbench/workbench.desktop.main.js`,
  `/Applications/Code.app/Contents/Resources/app/out/main.js`, or
  `/Applications/Visual Studio Code.app/Contents/Resources/app/out/main.js` before editing.
- Do not guess from old marker strings when VS Code internals changed. First locate the current implementation, then update the script and tests together.
- Verify with `npm test` after changing this extension.

## Patch Ownership

`scripts/patch-vscode-terminal-order.js` owns workbench changes for:

- `workbench.action.terminal.unsplit` group ordering.
- `workbench.action.terminal.changeColor` and `changeColorActiveTab` manual color reporting.
- `changeColorActiveTab` accepting a color argument from this extension.
- Terminal empty-area focus behavior.
- Terminal tab row height for the multi-line layout.
- Claude Code editor-title menu suppression.

`scripts/patch-vscode-ime-guard.js` owns the Korean IME composition guard:

- Defer `Shift+Enter` and `Cmd+Arrow*` dispatch while composition is active or very recent.
- Preserve native macOS Korean IME commit behavior in the terminal.
- Suppress duplicate native/managed terminal line breaks.
- Send exactly one delayed terminal `ESC + CR` for managed terminal `Shift+Enter`.

`scripts/patch-vscode-icon.js`, `scripts/patch-vscode-dock-icon.js`, and
`scripts/patch-vscode-watermark.js` own icon and CSS customization.
`scripts/patch-vscode-terminal-tabs-layout.js` owns terminal tab spacing and wrapping CSS.
`scripts/patch-vscode-terminal-tabs-title-breaks.js` owns terminal title line breaks at `|` separators.
Keep these as host-local patches; do not move them into extension runtime code unless VS Code exposes
a stable API for the behavior.

## Failure Triage

Start with `npm run doctor`. Its output identifies which managed surface drifted.

For terminal ordering or cwd color regressions:

- Inspect `scripts/patch-vscode-terminal-order.js`.
- Check the current `unsplitInstance`, `changeColor`, and `changeColorActiveTab`
  implementations in the VS Code workbench bundle.
- Update fixture-like minified strings and `test/patchVscodeTerminalOrder.test.js`
  together.

For Korean IME regressions:

- Reproduce inside a VS Code integrated terminal.
- Before changing the patch, run:

```sh
npm run record:terminal-input
```

- Use the raw byte log to distinguish native CR/LF leakage, duplicate managed
  sends, and late Hangul commit ordering.
- Update `scripts/patch-vscode-ime-guard.js` and
  `test/patchVscodeImeGuard.test.js` together.

For persistent terminal or Codex auto-resume regressions:

- Check `terminal.integrated.enablePersistentSessions` and
  `terminal.integrated.persistentSessionReviveProcess` in `src/hostConfig.js`.
- Check `src/detachedTerminalTtl.js` for shutdown behavior; it should not kill
  open terminals during normal extension deactivation.
- Check `src/codexSessionResume.js` for process-tree and idle-shell detection.
- Keep cwd-only matching disabled.

For app icon, Dock icon, watermark, or Claude title-menu regressions:

- Use `npm run doctor` to identify the missing marker or asset mismatch.
- Re-run `npm run apply` after VS Code or extension updates so `Code.app` is refreshed before
  patching and both app bundles are patched again.
- If macOS reports either app as damaged, check `codesign --verify --deep --strict <app path>`
  and make sure `npm run patch` signs both patch targets.
- If marker checks fail after an update, inspect the current target bundle or
  extension manifest before editing the patch script.

## Change Workflow

For read-only investigation, inspect files directly and do not run mutating
commands.

For code or patch-script changes:

1. Check the existing pattern in the relevant `src/`, `scripts/`, and `test/`
   files.
2. Add or update focused tests first when changing behavior or patch matching.
3. Keep edits scoped to the managed surface being changed.
4. Run `npm test`.
5. Run `npm run doctor` if the change affects host state, patch markers, or
   managed assets.
6. Run `npm run apply` only when intentionally mutating this Mac's host setup.

For documentation-only edits, at least re-read the rendered section or run a
targeted command such as `sed -n` to verify the final file content.

## Worktree Notes

This directory may be a plain host-local folder rather than a git checkout. If
it is not a git repository, skip worktree setup and edit in place.

If it is a git repository in the future, follow the outer worktree preference:
use an isolated worktree for non-trivial code-changing tasks, but stay in place
for read-only work and tiny explicit edits.
