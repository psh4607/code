# Seongho Code Fork

This repository is a thin Code OSS fork for replacing host-local VS Code bundle
rewrites with source-level patches.

## Baseline

- Upstream: `microsoft/vscode`
- Starting tag: `1.127.0`
- Starting commit: `a22d00300655c17490ce63dffc28bcdcedcd82c4`
- Required Node version: `24.15.0`
- Local branch: `seongho/vscode-1.127.0-spike`

## Product Identity

The fork is intentionally separated from the existing local `/Applications/Code.app`
managed by `codex-vscode-terminal-tools`.

- App name: `Seongho Code`
- CLI and protocol name: `seongho-code`
- macOS bundle id: `com.seongho.code`
- Local user data folder: `.seongho-code`
- Remote server data folder: `.seongho-code-server`

## Local Build Commands

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

## Patch Migration Order

Move patches from `codex-vscode-terminal-tools` only when they are still needed
after checking whether an extension API or product setting can own the behavior.

| Existing bundle patch | Source-level target | Status |
| --- | --- | --- |
| `patch-vscode-terminal-tabs-layout.js` | `src/vs/workbench/contrib/terminal/browser/terminalTabsList.ts` and `src/vs/workbench/contrib/terminal/browser/media/terminal.css` | Ported |
| `patch-vscode-terminal-tabs-title-breaks.js` | Terminal tabs renderer title formatting | Next candidate |
| `patch-vscode-terminal-order.js` | Terminal group service, terminal commands, and tab color commands | Candidate |
| `patch-vscode-ime-guard.js` | Terminal keyboard event dispatch and composition handling | Candidate |
| `patch-vscode-sticky-notifications.js` | Notification model/view policy | Candidate |
| `patch-vscode-opaque-overlays.js` | Workbench CSS source | Candidate |
| `patch-vscode-titlebar-center.js` | Workbench titlebar CSS source | Candidate |
| `patch-vscode-watermark.js` | Workbench empty editor CSS source | Candidate |
| `patch-vscode-icon.js` and `patch-vscode-dock-icon.js` | Product resources and macOS packaging | Candidate |
| `patch-vscode-terminal-attach-by-pid.js` | Terminal attach command plumbing | Candidate |

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
