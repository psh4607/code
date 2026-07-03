const vscode = require('vscode');
const {
  createNewTerminalFromActiveCwdCommand,
} = require('./src/newTerminalFromActiveCwdCommand');
const {
  createDetachedTerminalTtlManager,
} = require('./src/detachedTerminalTtl');
const {
  createCodexSessionResumeManager,
} = require('./src/codexSessionResume');
const { createRenameThreadCommand } = require('./src/renameCommand');
const {
  createTerminalCwdColorManager,
} = require('./src/terminalCwdColor');
const { createSmartPasteCommand } = require('./src/smartPasteCommand');

let detachedTerminalTtlManager;
let codexSessionResumeManager;
let terminalCwdColorManager;

function activate(context) {
  detachedTerminalTtlManager = createDetachedTerminalTtlManager(vscode, {
    context,
  });
  detachedTerminalTtlManager.start();
  codexSessionResumeManager = createCodexSessionResumeManager(vscode, {
    context,
  });
  codexSessionResumeManager.start();
  terminalCwdColorManager = createTerminalCwdColorManager(vscode, {
    context,
  });
  terminalCwdColorManager.start();

  context.subscriptions.push(
    detachedTerminalTtlManager,
    codexSessionResumeManager,
    terminalCwdColorManager,
    vscode.commands.registerCommand(
      'codexTerminal.newFromActiveCwd',
      createNewTerminalFromActiveCwdCommand(vscode),
    ),
    vscode.commands.registerCommand(
      'codexTerminal.renameThread',
      createRenameThreadCommand(vscode),
    ),
    vscode.commands.registerCommand(
      'codexTerminal.smartPaste',
      createSmartPasteCommand(vscode),
    ),
    vscode.commands.registerCommand(
      'codexTerminal.detachWithTtl',
      detachedTerminalTtlManager.detachActiveTerminal,
    ),
    vscode.commands.registerCommand(
      'codexTerminal.attachDetachedSession',
      detachedTerminalTtlManager.attachDetachedTerminal,
    ),
    vscode.commands.registerCommand(
      'codexTerminal.rememberCwdColor',
      terminalCwdColorManager.rememberCwdColor,
    ),
  );
}

function deactivate() {
  terminalCwdColorManager?.dispose();
  codexSessionResumeManager?.dispose();
  detachedTerminalTtlManager?.stopForExtensionShutdown();
}

module.exports = {
  activate,
  deactivate,
};
