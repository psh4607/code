function createNewTerminalFromActiveCwdCommand(vscode) {
  return async function newTerminalFromActiveCwd() {
    const activeTerminal = vscode.window.activeTerminal;

    if (!activeTerminal) {
      vscode.window.createTerminal().show(false);
      return;
    }

    activeTerminal.show(false);
    await vscode.commands.executeCommand('workbench.action.terminal.split');
    await vscode.commands.executeCommand('workbench.action.terminal.unsplit');
    await vscode.commands.executeCommand('workbench.action.terminal.focus');
  };
}

module.exports = {
  createNewTerminalFromActiveCwdCommand,
};
