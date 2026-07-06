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
const {
  OPEN_CURRENT_PULL_REQUEST_COMMAND,
  createTitlebarInfoManager,
} = require('./src/titlebarInfo');
const {
  CLEAR_AGENT_NOTIFICATIONS_COMMAND,
  MARK_AGENT_NOTIFICATIONS_READ_COMMAND,
  OPEN_LATEST_AGENT_NOTIFICATION_COMMAND,
  SHOW_AGENT_NOTIFICATIONS_COMMAND,
  createAgentNotificationManager,
} = require('./src/agentNotificationManager');

let detachedTerminalTtlManager;
let codexSessionResumeManager;
let terminalCwdColorManager;
let titlebarInfoManager;
let agentNotificationManager;

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
  titlebarInfoManager = createTitlebarInfoManager(vscode, {
    context,
  });
  titlebarInfoManager.start();
  const agentNotificationConfig = vscode.workspace.getConfiguration('codexTerminal');
  agentNotificationManager = createAgentNotificationManager(vscode, {
    context,
    pollIntervalMs: agentNotificationConfig.get(
      'agentNotifications.pollIntervalMs',
      1000,
    ),
  });
  if (agentNotificationConfig.get('agentNotifications.enabled', true)) {
    agentNotificationManager.start();
  }

  context.subscriptions.push(
    detachedTerminalTtlManager,
    codexSessionResumeManager,
    terminalCwdColorManager,
    titlebarInfoManager,
    agentNotificationManager,
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
    vscode.commands.registerCommand(
      OPEN_CURRENT_PULL_REQUEST_COMMAND,
      titlebarInfoManager.openCurrentPullRequest,
    ),
    vscode.commands.registerCommand(
      SHOW_AGENT_NOTIFICATIONS_COMMAND,
      agentNotificationManager.showAgentNotifications,
    ),
    vscode.commands.registerCommand(
      OPEN_LATEST_AGENT_NOTIFICATION_COMMAND,
      agentNotificationManager.openLatestAgentNotification,
    ),
    vscode.commands.registerCommand(
      MARK_AGENT_NOTIFICATIONS_READ_COMMAND,
      agentNotificationManager.markAgentNotificationsRead,
    ),
    vscode.commands.registerCommand(
      CLEAR_AGENT_NOTIFICATIONS_COMMAND,
      agentNotificationManager.clearAgentNotifications,
    ),
  );
}

function deactivate() {
  const pending = agentNotificationManager?.dispose();
  titlebarInfoManager?.dispose();
  terminalCwdColorManager?.dispose();
  codexSessionResumeManager?.dispose();
  detachedTerminalTtlManager?.stopForExtensionShutdown();
  return pending;
}

module.exports = {
  activate,
  deactivate,
};
