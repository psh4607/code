#!/usr/bin/env node

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { normalizeCodexHookPayload } = require('../src/agentNotificationEvents');

const DEFAULT_EVENTS_PATH = path.join(
  os.homedir(),
  '.codex',
  'codex-vscode-terminal-tools',
  'notifications',
  'events.jsonl',
);

function eventsPath() {
  return process.env.CODEX_AGENT_NOTIFICATION_EVENTS_PATH || DEFAULT_EVENTS_PATH;
}

function now() {
  const overridden = Number(process.env.CODEX_AGENT_NOTIFICATION_NOW_MS);
  return Number.isFinite(overridden) ? overridden : Date.now();
}

function readStdinSync() {
  try {
    return fs.readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

function appendEvent(filePath, event) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, `${JSON.stringify(event)}\n`);
}

function cleanText(value) {
  return typeof value === 'string' && value.trim()
    ? value.replace(/\s+/g, ' ').trim()
    : undefined;
}

function truncateText(value, maxLength = 72) {
  const text = cleanText(value);
  if (!text || text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength - 1).trimEnd()}...`;
}

function stripMarkdownForNotification(value) {
  return String(value ?? '')
    .replace(/!\[([^\]\r\n]*)\]\(([^)\r\n]+)\)/g, (_, label, target) =>
      label ? `${label} (${target.trim()})` : target.trim(),
    )
    .replace(/\[([^\]\r\n]{1,160})\]\(([^)\r\n]+)\)/g, (_, label, target) =>
      `${label.trim()} (${target.trim()})`,
    )
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/(^|\s)[>*-]\s+(?=\S)/g, '$1');
}

function summarizeCompletedDetail(value) {
  return truncateText(stripMarkdownForNotification(value), 220);
}

function stripTranscriptAttachmentWrappers(value) {
  return String(value ?? '').replace(/<\/?(?:image|file)\b[^>]*>/gi, ' ');
}

function stripPromptAttachmentReferences(value) {
  return String(value ?? '').replace(/^\s*(?:\[[^\]\r\n]{1,40}\]\s*)+/g, '');
}

function textFromContentValue(value) {
  if (typeof value !== 'string') {
    return undefined;
  }
  return cleanText(stripTranscriptAttachmentWrappers(value));
}

function textFromContent(content) {
  if (typeof content === 'string') {
    return textFromContentValue(content);
  }
  if (!Array.isArray(content)) {
    return undefined;
  }
  return cleanText(
    content
      .map((item) => item?.text ?? item?.input_text ?? item?.output_text)
      .map(textFromContentValue)
      .filter(Boolean)
      .join(' '),
  );
}

function turnIdFromTranscriptPayload(payload) {
  return payload?.internal_chat_message_metadata_passthrough?.turn_id;
}

function summarizeUserPrompt(value) {
  const text = cleanText(stripPromptAttachmentReferences(value));
  if (!text) {
    return undefined;
  }

  const explicitTitle = text.match(
    /(?:적어줘|써줘|넣어줘|표시해줘)\s+(.{2,80}?)\s*(?:이렇게|처럼)(?:[.!?。…]*|$)/i,
  );
  if (explicitTitle?.[1]) {
    return truncateText(explicitTitle[1].replace(/[.!?。…]+$/g, ''));
  }

  const quoted = text.match(/[`"“”'‘’]([^`"“”'‘’]{2,80})[`"“”'‘’]/);
  if (quoted?.[1]) {
    return truncateText(quoted[1]);
  }

  return truncateText(
    stripPromptAttachmentReferences(
      text
        .replace(/^(?:음|좋아|자|그럼|오케이|ㅇㅋ|ok|okay)[\s,.!…-]*/i, '')
        .replace(/\s*(?:해줘|해주세요|ㄱㄱ)\s*$/i, ''),
    ),
  );
}

function readTranscriptUserPrompt(transcriptPath, turnId) {
  if (!transcriptPath || !turnId) {
    return undefined;
  }

  let source;
  try {
    source = fs.readFileSync(transcriptPath, 'utf8');
  } catch {
    return undefined;
  }

  let prompt;
  for (const line of source.split('\n')) {
    if (!line.trim()) {
      continue;
    }
    let record;
    try {
      record = JSON.parse(line);
    } catch {
      continue;
    }
    const payload = record?.payload;
    if (
      record?.type === 'response_item' &&
      payload?.type === 'message' &&
      payload?.role === 'user' &&
      turnIdFromTranscriptPayload(payload) === turnId
    ) {
      prompt = textFromContent(payload.content);
    }
  }
  return prompt;
}

function readTranscriptAssistantFinal(transcriptPath, turnId) {
  if (!transcriptPath || !turnId) {
    return undefined;
  }

  let source;
  try {
    source = fs.readFileSync(transcriptPath, 'utf8');
  } catch {
    return undefined;
  }

  let finalMessage;
  let taskCompleteMessage;
  for (const line of source.split('\n')) {
    if (!line.trim()) {
      continue;
    }
    let record;
    try {
      record = JSON.parse(line);
    } catch {
      continue;
    }

    const payload = record?.payload;
    if (
      record?.type === 'response_item' &&
      payload?.type === 'message' &&
      payload?.role === 'assistant' &&
      payload?.phase === 'final_answer' &&
      turnIdFromTranscriptPayload(payload) === turnId
    ) {
      finalMessage = textFromContent(payload.content);
    }

    if (
      record?.type === 'event_msg' &&
      payload?.type === 'task_complete' &&
      payload?.turn_id === turnId
    ) {
      taskCompleteMessage = cleanText(payload.last_agent_message);
    }
  }

  return finalMessage ?? taskCompleteMessage;
}

function enrichCompletedEvent(event) {
  if (event?.event !== 'turn_finished') {
    return event;
  }

  const prompt = readTranscriptUserPrompt(event.source?.transcriptPath, event.turnId);
  const summary = summarizeUserPrompt(prompt);
  const detail = summarizeCompletedDetail(
    readTranscriptAssistantFinal(event.source?.transcriptPath, event.turnId),
  );
  if (!summary && !detail) {
    return event;
  }

  return {
    ...event,
    ...(summary ? { title: summary } : {}),
    ...(detail ? { body: detail } : {}),
  };
}

function main() {
  try {
    const raw = readStdinSync();
    const payload = raw ? JSON.parse(raw) : {};
    const event = enrichCompletedEvent(normalizeCodexHookPayload(payload, { now }));
    if (event) {
      appendEvent(eventsPath(), event);
    }
  } catch {
    // Hooks are best-effort. Never block Codex startup or turn completion.
  }

  process.stdout.write('{}');
}

main();
