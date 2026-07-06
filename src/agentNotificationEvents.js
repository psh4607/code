const path = require('node:path');

const AGENT_NOTIFICATION_SCHEMA_VERSION = 1;
const PROVIDER_CODEX = 'codex';

const PRESENTABLE_AGENT_NOTIFICATION_EVENTS = new Set([
  'permission_requested',
  'turn_finished',
  'needs_input',
  'error',
]);

const VALID_AGENT_NOTIFICATION_EVENTS = new Set([
  'session_started',
  'prompt_submitted',
  'permission_requested',
  'tool_started',
  'tool_finished',
  'turn_finished',
  'needs_input',
  'error',
]);

const VALID_AGENT_NOTIFICATION_SEVERITIES = new Set([
  'info',
  'success',
  'waiting',
  'warning',
  'error',
]);

function cleanString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function normalizeNumber(value) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function stablePart(value, fallback = 'unknown') {
  return String(value ?? fallback)
    .replace(/[^a-zA-Z0-9_.:-]+/g, '-')
    .replace(/^-+|-+$/g, '') || fallback;
}

function hookEventName(payload) {
  return cleanString(payload?.hook_event_name ?? payload?.hookEventName);
}

function sessionId(payload) {
  return cleanString(
    payload?.session_id ??
      payload?.sessionId ??
      payload?.thread_id ??
      payload?.threadId ??
      payload?.['thread-id'],
  );
}

function cwd(payload) {
  return cleanString(payload?.cwd);
}

function terminalPid(payload) {
  return normalizeNumber(payload?.terminalPid ?? payload?.terminal_pid ?? payload?.processId);
}

function toolName(payload) {
  return cleanString(payload?.tool_name ?? payload?.toolName);
}

function transcriptPath(payload) {
  return cleanString(payload?.transcript_path ?? payload?.transcriptPath);
}

function eventInstanceId(payload) {
  return cleanString(
    payload?.turn_id ??
      payload?.turnId ??
      payload?.tool_call_id ??
      payload?.toolCallId ??
      payload?.call_id ??
      payload?.callId ??
      payload?.invocation_id ??
      payload?.invocationId ??
      payload?.request_id ??
      payload?.requestId,
  );
}

function projectNameFromCwd(value) {
  return cleanString(value) ? path.basename(value) : undefined;
}

function summarizeToolInput(input) {
  if (!input || typeof input !== 'object') {
    return undefined;
  }
  if (typeof input.command === 'string' && input.command.trim()) {
    return input.command.trim();
  }
  if (typeof input.file_path === 'string' && input.file_path.trim()) {
    return input.file_path.trim();
  }
  try {
    const value = JSON.stringify(input);
    return value.length > 120 ? `${value.slice(0, 117)}...` : value;
  } catch {
    return undefined;
  }
}

function makeDedupeKey({ provider, sessionId: sid, event, instanceId }) {
  return [
    stablePart(provider),
    stablePart(sid),
    stablePart(event),
    stablePart(instanceId, 'event'),
  ].join(':');
}

function makeEventId({ provider, sessionId: sid, event, createdAt, dedupeKey }) {
  return [
    stablePart(provider),
    stablePart(sid),
    stablePart(event),
    stablePart(dedupeKey),
    stablePart(createdAt),
  ].join(':');
}

function codexEventDetails(payload) {
  const eventName = hookEventName(payload);
  const tool = toolName(payload);
  const inputSummary = summarizeToolInput(payload?.tool_input ?? payload?.toolInput);
  const project = projectNameFromCwd(cwd(payload));

  switch (eventName) {
    case 'SessionStart':
      return {
        event: 'session_started',
        severity: 'info',
        title: 'Codex session started',
        subtitle: project,
      };
    case 'UserPromptSubmit':
      return {
        event: 'prompt_submitted',
        severity: 'info',
        title: 'Codex prompt submitted',
        subtitle: project,
      };
    case 'PermissionRequest':
      return {
        event: 'permission_requested',
        severity: 'waiting',
        title: 'Codex needs permission',
        subtitle: project,
        body: [tool, inputSummary].filter(Boolean).join(': '),
      };
    case 'PreToolUse':
      return {
        event: 'tool_started',
        severity: 'info',
        title: tool ? `Codex started ${tool}` : 'Codex started a tool',
        subtitle: project,
        body: inputSummary,
      };
    case 'PostToolUse': {
      const isError = Boolean(payload?.error) || Number(payload?.exit_code ?? payload?.exitCode ?? 0) !== 0;
      return {
        event: isError ? 'error' : 'tool_finished',
        severity: isError ? 'error' : 'info',
        title: isError
          ? (tool ? `Codex ${tool} failed` : 'Codex tool failed')
          : (tool ? `Codex finished ${tool}` : 'Codex finished a tool'),
        subtitle: project,
        body: cleanString(payload?.error) ?? inputSummary,
      };
    }
    case 'Stop':
      return {
        event: 'turn_finished',
        severity: 'success',
        title: 'Codex finished',
        subtitle: project,
      };
    default:
      return undefined;
  }
}

function normalizeCodexHookPayload(payload, { now = Date.now } = {}) {
  if (!payload || typeof payload !== 'object') {
    return undefined;
  }

  const details = codexEventDetails(payload);
  if (!details) {
    return undefined;
  }

  const createdAt = normalizeNumber(payload.createdAt ?? payload.created_at) ?? now();
  const sid = sessionId(payload);
  const eventToolName = toolName(payload);
  const turnId = cleanString(payload.turn_id ?? payload.turnId);
  const instanceId = eventInstanceId(payload) ?? createdAt;
  const dedupeKey = makeDedupeKey({
    provider: PROVIDER_CODEX,
    sessionId: sid,
    event: details.event,
    instanceId,
  });

  const event = {
    schemaVersion: AGENT_NOTIFICATION_SCHEMA_VERSION,
    id: makeEventId({
      provider: PROVIDER_CODEX,
      sessionId: sid,
      event: details.event,
      createdAt,
      dedupeKey,
    }),
    provider: PROVIDER_CODEX,
    event: details.event,
    severity: details.severity,
    title: details.title,
    createdAt,
    dedupeKey,
    source: {
      hookEventName: hookEventName(payload),
    },
  };

  const values = {
    sessionId: sid,
    turnId,
    cwd: cwd(payload),
    terminalPid: terminalPid(payload),
    subtitle: details.subtitle,
    body: cleanString(details.body),
  };
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) {
      event[key] = value;
    }
  }

  if (eventToolName) {
    event.source.toolName = eventToolName;
  }
  const transcript = transcriptPath(payload);
  if (transcript) {
    event.source.transcriptPath = transcript;
  }

  return event;
}

function isValidAgentNotificationEvent(record) {
  return (
    record &&
    typeof record === 'object' &&
    record.schemaVersion === AGENT_NOTIFICATION_SCHEMA_VERSION &&
    typeof record.id === 'string' &&
    typeof record.provider === 'string' &&
    VALID_AGENT_NOTIFICATION_EVENTS.has(record.event) &&
    VALID_AGENT_NOTIFICATION_SEVERITIES.has(record.severity) &&
    typeof record.title === 'string' &&
    Number.isSafeInteger(record.createdAt) &&
    typeof record.dedupeKey === 'string' &&
    record.source &&
    typeof record.source === 'object' &&
    !Array.isArray(record.source)
  );
}

function parseAgentNotificationJsonl(source) {
  return String(source ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return undefined;
      }
    })
    .filter(isValidAgentNotificationEvent);
}

function isPresentableAgentNotificationEvent(event) {
  return PRESENTABLE_AGENT_NOTIFICATION_EVENTS.has(event?.event);
}

module.exports = {
  AGENT_NOTIFICATION_SCHEMA_VERSION,
  VALID_AGENT_NOTIFICATION_EVENTS,
  VALID_AGENT_NOTIFICATION_SEVERITIES,
  parseAgentNotificationJsonl,
  normalizeCodexHookPayload,
  isPresentableAgentNotificationEvent,
  isValidAgentNotificationEvent,
};
