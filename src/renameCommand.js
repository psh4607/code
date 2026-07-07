const { buildRenameSubmission } = require('./renameSequence');

const RENAME_TERMINAL_COMMAND = 'workbench.action.terminal.renameWithArg';
const SESSION_ID_RE =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i;
const SESSION_ID_GLOBAL_RE = new RegExp(SESSION_ID_RE.source, 'gi');

function defaultSleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function buildTerminalTabTitle(currentTitle, threadName) {
  const title = typeof currentTitle === 'string' ? currentTitle : '';
  const name = String(threadName ?? '').trim();
  if (!name) {
    return title;
  }

  if (SESSION_ID_RE.test(title)) {
    return title.replace(SESSION_ID_GLOBAL_RE, name);
  }

  if (title.includes(' | ')) {
    const parts = title.split(' | ');
    parts[parts.length - 1] = name;
    return parts.join(' | ');
  }

  return name;
}

function createRenameThreadCommand(vscode, options = {}) {
  const clearDraftDelayMs = options.clearDraftDelayMs ?? 25;
  const delayMs = options.delayMs ?? 100;
  const confirmDelayMs = options.confirmDelayMs ?? 25;
  const recordTerminalTitleRename = options.recordTerminalTitleRename;
  const sleep = options.sleep ?? defaultSleep;

  return async function renameCodexThread() {
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

    terminal.sendText('\x15', false);
    await sleep(clearDraftDelayMs);
    terminal.sendText(submission.command, true);
    await sleep(delayMs);
    terminal.sendText(submission.name, false);
    await sleep(confirmDelayMs);
    terminal.sendText('', true);

    const previousTitle = terminal.name;
    const nextTitle = buildTerminalTabTitle(previousTitle, submission.name);
    if (vscode.commands?.executeCommand) {
      await vscode.commands.executeCommand(RENAME_TERMINAL_COMMAND, {
        name: nextTitle,
      });
    }
    if (typeof recordTerminalTitleRename === 'function') {
      await recordTerminalTitleRename(terminal, nextTitle, { previousTitle });
    }
  };
}

module.exports = {
  buildTerminalTabTitle,
  createRenameThreadCommand,
};
