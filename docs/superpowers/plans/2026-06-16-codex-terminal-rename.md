# Codex Terminal Rename Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local VS Code extension that renames the current Codex TUI thread from a `Cmd+R` prompt while terminal focus is active.

**Architecture:** The extension contributes one command and one macOS keybinding. The command asks for a thread name through `vscode.window.showInputBox`, validates the value with a small pure helper, and sends `/rename` plus the name to `vscode.window.activeTerminal`.

**Tech Stack:** VS Code extension manifest, CommonJS JavaScript, Node.js built-in test runner.

---

### Task 1: Testable Rename Helper

**Files:**
- Create: `src/renameSequence.js`
- Create: `test/renameSequence.test.js`
- Create: `package.json`

- [ ] **Step 1: Write the failing test**

```js
const assert = require('node:assert/strict');
const test = require('node:test');
const { buildRenameSubmission } = require('../src/renameSequence');

test('buildRenameSubmission trims surrounding whitespace', () => {
  assert.deepEqual(buildRenameSubmission('  INF-938 metric cells  '), {
    command: '/rename',
    name: 'INF-938 metric cells',
  });
});

test('buildRenameSubmission rejects blank names', () => {
  assert.equal(buildRenameSubmission('   '), undefined);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`

Expected: FAIL because `src/renameSequence.js` does not exist.

- [ ] **Step 3: Write minimal implementation**

```js
function buildRenameSubmission(rawName) {
  const name = String(rawName ?? '').trim();
  if (!name) {
    return undefined;
  }
  return {
    command: '/rename',
    name,
  };
}

module.exports = {
  buildRenameSubmission,
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`

Expected: PASS.

### Task 2: VS Code Command and Keybinding

**Files:**
- Create: `extension.js`
- Modify: `package.json`
- Create: `README.md`

- [ ] **Step 1: Add extension command**

Create `extension.js` with:

```js
const vscode = require('vscode');
const { buildRenameSubmission } = require('./src/renameSequence');

async function renameCodexThread() {
  const terminal = vscode.window.activeTerminal;
  if (!terminal) {
    vscode.window.showWarningMessage('No active terminal is available.');
    return;
  }

  const rawName = await vscode.window.showInputBox({
    title: 'Rename Codex Thread',
    prompt: 'Enter a new name for the current Codex TUI thread',
    placeHolder: 'Thread name',
    ignoreFocusOut: true,
  });

  const submission = buildRenameSubmission(rawName);
  if (!submission) {
    return;
  }

  terminal.sendText(submission.command);
  terminal.sendText(submission.name);
}

function activate(context) {
  context.subscriptions.push(
    vscode.commands.registerCommand('codexTerminal.renameThread', renameCodexThread),
  );
}

function deactivate() {}

module.exports = {
  activate,
  deactivate,
  renameCodexThread,
};
```

- [ ] **Step 2: Add manifest command and keybinding**

`package.json` must define:

```json
{
  "name": "codex-vscode-terminal-tools",
  "displayName": "Codex VS Code Terminal Tools",
  "publisher": "seongho",
  "version": "0.0.1",
  "engines": {
    "vscode": "^1.124.0"
  },
  "main": "./extension.js",
  "activationEvents": [
    "onCommand:codexTerminal.renameThread"
  ],
  "contributes": {
    "commands": [
      {
        "command": "codexTerminal.renameThread",
        "title": "Codex: Rename Current Terminal Thread"
      }
    ],
    "keybindings": [
      {
        "command": "codexTerminal.renameThread",
        "key": "cmd+r",
        "mac": "cmd+r",
        "when": "terminalFocus"
      }
    ]
  },
  "scripts": {
    "test": "node --test test/*.test.js"
  }
}
```

- [ ] **Step 3: Validate manifest**

Run: `node -e "JSON.parse(require('fs').readFileSync('package.json','utf8')); console.log('package.json ok')"`

Expected: `package.json ok`.

### Task 3: Local Installation

**Files:**
- Create symlink: `~/.vscode/extensions/seongho.codex-vscode-terminal-tools-0.0.1`

- [ ] **Step 1: Create local extension symlink**

Run:

```bash
mkdir -p ~/.vscode/extensions
ln -sfn /Users/seongho/projects/seongho/projects/codex-vscode-terminal-tools ~/.vscode/extensions/seongho.codex-vscode-terminal-tools-0.0.1
```

- [ ] **Step 2: Verify VS Code sees the extension folder**

Run:

```bash
test -L ~/.vscode/extensions/seongho.codex-vscode-terminal-tools-0.0.1
test -f ~/.vscode/extensions/seongho.codex-vscode-terminal-tools-0.0.1/package.json
```

Expected: exit code 0.

- [ ] **Step 3: Final verification**

Run:

```bash
npm test
node -e "const pkg=require('./package.json'); console.log(pkg.contributes.keybindings[0].key, pkg.contributes.keybindings[0].when)"
```

Expected: tests pass and output includes `cmd+r terminalFocus`.
