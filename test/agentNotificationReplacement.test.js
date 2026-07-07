const assert = require('node:assert/strict');
const test = require('node:test');

const {
  encodeCloseNotificationMessage,
  encodeReplaceableNotificationMessage,
} = require('../src/agentNotificationReplacement');

test('encodeReplaceableNotificationMessage tags session notifications for replacement', () => {
  assert.equal(
    encodeReplaceableNotificationMessage('Codex finished', { sessionId: 'session-1' }),
    '\x1Fcodex-vscode-terminal-tools:replace-notification:session%3Asession-1\x1FCodex finished',
  );
});

test('encodeCloseNotificationMessage tags session notifications for silent dismissal', () => {
  assert.equal(
    encodeCloseNotificationMessage({ sessionId: 'session-1' }),
    '\x1Fcodex-vscode-terminal-tools:close-notification:session%3Asession-1\x1F',
  );
});

test('encodeCloseNotificationMessage returns undefined when no replacement key exists', () => {
  assert.equal(encodeCloseNotificationMessage({ id: 'event-1' }), undefined);
});
