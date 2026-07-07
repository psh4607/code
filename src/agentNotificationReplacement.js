const NOTIFICATION_REPLACEMENT_MARKER_PREFIX =
  '\x1Fcodex-vscode-terminal-tools:replace-notification:';
const NOTIFICATION_REPLACEMENT_MARKER_SUFFIX = '\x1F';

function normalizeString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function normalizePid(value) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 1 ? parsed : undefined;
}

function agentNotificationReplacementKey(record) {
  const sessionId = normalizeString(record?.sessionId);
  if (sessionId) {
    return `session:${sessionId}`;
  }

  const terminalPid = normalizePid(record?.terminalPid);
  if (terminalPid) {
    return `pid:${terminalPid}`;
  }

  return undefined;
}

function encodeReplaceableNotificationMessage(message, record) {
  const replacementKey = agentNotificationReplacementKey(record);
  if (!replacementKey) {
    return message;
  }

  return [
    NOTIFICATION_REPLACEMENT_MARKER_PREFIX,
    encodeURIComponent(replacementKey),
    NOTIFICATION_REPLACEMENT_MARKER_SUFFIX,
    message,
  ].join('');
}

module.exports = {
  NOTIFICATION_REPLACEMENT_MARKER_PREFIX,
  NOTIFICATION_REPLACEMENT_MARKER_SUFFIX,
  agentNotificationReplacementKey,
  encodeReplaceableNotificationMessage,
};
