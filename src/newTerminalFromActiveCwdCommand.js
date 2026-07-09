function cleanCwd(value) {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function resolveTerminalCwd(terminal) {
  const shellIntegrationCwd = cleanCwd(terminal?.shellIntegration?.cwd?.fsPath);
  if (shellIntegrationCwd) {
    return shellIntegrationCwd;
  }

  const creationCwd = terminal?.creationOptions?.cwd;
  return cleanCwd(creationCwd) ?? cleanCwd(creationCwd?.fsPath);
}

function createDirectTerminalFromActiveCwd(vscode, activeTerminal) {
  const cwd = resolveTerminalCwd(activeTerminal);
  const terminal = vscode.window.createTerminal(cwd ? { cwd } : undefined);
  terminal.show(false);
  return terminal;
}

function createNewTerminalFromActiveCwdCommand(vscode) {
  return async function newTerminalFromActiveCwd() {
    const activeTerminal = vscode.window.activeTerminal;

    if (!activeTerminal) {
      vscode.window.createTerminal().show(false);
      return;
    }

    createDirectTerminalFromActiveCwd(vscode, activeTerminal);
  };
}

module.exports = {
  createNewTerminalFromActiveCwdCommand,
  createDirectTerminalFromActiveCwd,
  resolveTerminalCwd,
};
