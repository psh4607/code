# Seongho Code Fork

This repository is the source of truth for Seongho Code. The local VS Code
bundle rewrites have been moved into Code OSS source and are built as a fresh
application.

## Baseline

- Upstream: `microsoft/vscode`
- Starting tag: `1.127.0`
- Starting commit: `a22d00300655c17490ce63dffc28bcdcedcd82c4`
- Required Node version: `24.15.0`
- Local branch: `seongho/vscode-1.127.0-spike`

## Product Identity

The fork installs as `/Applications/Seongho Code.app`. It does not modify the
official Visual Studio Code bundle or the legacy `/Applications/Code.app`.

- App name: `Seongho Code`
- CLI and protocol name: `seongho-code`
- macOS bundle id: `com.seongho.code`
- Local user data folder: `.seongho-code`
- Remote server data folder: `.seongho-code-server`

## Local Workflow

Build, sign, install, and verify the arm64 or x64 app for the current Mac:

```sh
source ~/.nvm/nvm.sh
nvm use 24.15.0
npm run seongho-code:apply
```

Check the installed app and CLI without changing host state:

```sh
npm run seongho-code:doctor
```

The workflow prefers the `Seongho Local Code Signing` identity and falls back
to ad-hoc signing when that identity is unavailable. Override the defaults with
`SEONGHO_CODE_SIGN_IDENTITY`, `SEONGHO_CODE_INSTALL_PATH`, or
`SEONGHO_CODE_CLI_PATH`.

The packaged app is written to `../VSCode-darwin-<arch>/Seongho Code.app` and
the CLI is installed as `~/.local/bin/seongho-code`.

## Development Commands

```sh
source ~/.nvm/nvm.sh
nvm use 24.15.0
npm install
npm run compile
npm run electron
```

For a dev launch:

```sh
source ~/.nvm/nvm.sh
nvm use 24.15.0
./scripts/code.sh --user-data-dir /tmp/seongho-code-user-data --extensions-dir /tmp/seongho-code-extensions
```

## Migrated Bundle Patches

Move patches from `codex-vscode-terminal-tools` only when they are still needed
after checking whether an extension API or product setting can own the behavior.

| Existing bundle patch | Source-level target | Status |
| --- | --- | --- |
| `patch-vscode-terminal-tabs-layout.js` | `src/vs/workbench/contrib/terminal/browser/terminalTabsList.ts` and `src/vs/workbench/contrib/terminal/browser/media/terminal.css` | Ported |
| `patch-vscode-terminal-tabs-title-breaks.js` | Terminal tabs renderer title formatting | Ported |
| `patch-vscode-terminal-order.js` | Terminal group service, terminal commands, and tab color commands | Ported |
| `patch-vscode-ime-guard.js` | Terminal keyboard event dispatch and composition handling | Ported |
| `patch-vscode-sticky-notifications.js` | Notification model/view policy | Ported |
| `patch-vscode-opaque-overlays.js` | Workbench CSS source | Ported |
| `patch-vscode-titlebar-center.js` | Workbench titlebar CSS source | Ported |
| `patch-vscode-watermark.js` | Workbench empty editor CSS source | Ported |
| `patch-vscode-icon.js` and `patch-vscode-dock-icon.js` | Product resources and macOS packaging | Ported |
| `patch-vscode-terminal-attach-by-pid.js` | Terminal attach command plumbing | Ported |

The source fork also owns app signing and installation through
`scripts/seongho-code/darwin.ts`. The host-tools repository remains responsible
only for its extension runtime and user-level VS Code/Codex configuration; it
is no longer required to rewrite this app bundle.

## Rebase Rule

Keep local changes as small source commits on top of upstream tags.

1. Fetch the next upstream tag.
2. Create a new branch from that tag.
3. Cherry-pick local product identity first.
4. Cherry-pick source-level behavior patches one by one.
5. Run `npm install` only when package or lock files changed.
6. Run `npm run compile` after each conflict-prone behavior patch.

Bundle outputs under `.build/` and `out/` are generated artifacts. Do not use
them as rollback sources.
