const { buildRenameSubmission } = require('./renameSequence');

function defaultSleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function createRenameThreadCommand(vscode, options = {}) {
  const clearDraftDelayMs = options.clearDraftDelayMs ?? 25;
  const delayMs = options.delayMs ?? 100;
  const confirmDelayMs = options.confirmDelayMs ?? 25;
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
  };
}

module.exports = {
  createRenameThreadCommand,
};
