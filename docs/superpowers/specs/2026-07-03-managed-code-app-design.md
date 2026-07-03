# Managed Code App Design

## Goal

Turn this host-local project from "patch the installed Visual Studio Code app in place" into
"build and maintain a managed custom app bundle named `Code.app`". The managed app should contain
the existing terminal-order, IME guard, icon, Dock icon, watermark, and Claude title-menu patches
while continuing to share the user's existing VS Code settings, extensions, and user data.

## Target Model

The official app at `/Applications/Visual Studio Code.app` remains the upstream source installed
and updated by Homebrew. This project owns `/Applications/Code.app` as the runtime app the user
normally launches.

`npm run apply` should:

1. ensure `/Applications/Code.app` exists and is refreshed from the upstream app when needed;
2. set the managed app display identity to `Code` with the local bundle id `com.seongho.Code`;
3. normalize the existing shared host settings, keybindings, shell hooks, Codex terminal title,
   extension symlink, and patch wrappers;
4. apply all bundle, CSS, icon, Dock icon, watermark, IME, and terminal-order patches to
   `/Applications/Code.app`;
5. ad-hoc sign the final patched app and run the read-only drift checks against the managed app.

## Shared User Data

The managed app should keep VS Code's existing user data and extension locations. Do not rewrite
`product.json` values such as `applicationName`, `dataFolderName`, or extension storage names in the
first implementation. Keeping those values intact preserves:

- `/Users/seongho/Library/Application Support/Code/User/settings.json`;
- `/Users/seongho/Library/Application Support/Code/User/keybindings.json`;
- `~/.vscode/extensions`;
- the current `code` CLI behavior and extension ecosystem assumptions.

The macOS bundle id is `com.seongho.Code`, with helper app bundle ids set to
`com.seongho.Code.helper`. Testing showed that changing only the root bundle id on the copied signed
Electron app makes macOS launchd reject the app before startup. The working model is to patch the
root/helper ids and then ad-hoc sign the final patched app after all bundle mutations. Finder custom
app icon metadata is not applied by default because its resource fork/FinderInfo detritus prevents
that signing step.

## App Refresh Policy

Refreshing `Code.app` should be deterministic and conservative. The first implementation can copy
the upstream app into place whenever the upstream app version or bundle contents differ from the
managed app's recorded source version. After each refresh, the patch sequence reapplies managed
changes.

The managed app should carry a small marker file under its bundle, for example
`Contents/Resources/app/codex-managed-code-app.json`, recording the source app path, source version,
source bundle id, managed bundle id, and refresh timestamp. `doctor` can use this marker to explain
whether `Code.app` is missing, stale, or patched.

## Boundaries

Keep `/Applications/Visual Studio Code.app` unmodified by this project except for existing external
update controls such as Homebrew cask pinning and VS Code's shared `update.mode` setting. Patch
scripts should default to `/Applications/Code.app` and still allow explicit environment overrides
for tests or recovery.

Do not create a separate VS Code fork, build VS Code from source, or split user data in the first
version. Do not change the `code` command-line launcher unless a later test shows it launches the
wrong app for the user's workflow.

## Error Handling

If the upstream app is missing, `npm run apply` should fail with a direct message naming
`/Applications/Visual Studio Code.app`. If `Code.app` exists but cannot be replaced because it is
running or locked, fail without partially patching it. If a bundle patch cannot find its expected
marker in the managed app, stop and report the current target path so the VS Code internals can be
inspected before changing patch strings.

## Testing

Unit tests should cover path resolution, managed app marker generation, bundle identity patching,
and doctor status checks for missing, stale, and current `Code.app` states. Existing patch-script
tests should keep using environment overrides so they remain independent of the real `/Applications`
apps.

Host verification after implementation should run `npm test`. `npm run doctor` should be run once
before `npm run apply` to capture current drift, and `npm run apply` should only be run when the user
intends to create or update the real `/Applications/Code.app` on this Mac.
