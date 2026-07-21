const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  createIncrementalJsonlReader,
} = require('../src/agentNotificationManager');

function createTempEventsFile(t) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-notification-tail-test-'));
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
  return path.join(tmpDir, 'events.jsonl');
}

test('incremental reader starts from a bounded tail and then returns only appended bytes', async (t) => {
  const eventsPath = createTempEventsFile(t);
  const recentLine = JSON.stringify({ id: 'recent-event' });
  const appendedLine = JSON.stringify({ id: 'appended-event' });
  fs.writeFileSync(eventsPath, `${'old-data'.repeat(40)}\n${recentLine}\n`);

  const readEvents = createIncrementalJsonlReader(eventsPath, {
    initialTailBytes: Buffer.byteLength(`${recentLine}\n`),
    maxReadBytes: 1024,
  });

  assert.equal(await readEvents(), `${recentLine}\n`);

  fs.appendFileSync(eventsPath, `${appendedLine}\n`);

  assert.equal(await readEvents(), `${appendedLine}\n`);
  assert.equal(await readEvents(), '');
});

test('incremental reader keeps incomplete UTF-8 JSONL data until its newline arrives', async (t) => {
  const eventsPath = createTempEventsFile(t);
  fs.writeFileSync(eventsPath, '{"title":"안');

  const readEvents = createIncrementalJsonlReader(eventsPath, {
    initialTailBytes: 1024,
    maxReadBytes: 1024,
  });

  assert.equal(await readEvents(), '');

  fs.appendFileSync(eventsPath, '녕"}\n');

  assert.equal(await readEvents(), '{"title":"안녕"}\n');
});

test('incremental reader continues a line split across bounded reads', async (t) => {
  const eventsPath = createTempEventsFile(t);
  const line = `${JSON.stringify({ id: 'event-across-chunks' })}\n`;
  fs.writeFileSync(eventsPath, line);

  const readEvents = createIncrementalJsonlReader(eventsPath, {
    initialTailBytes: 1024,
    maxReadBytes: 7,
  });

  const chunks = [];
  for (let index = 0; index < 10; index += 1) {
    const chunk = await readEvents();
    if (chunk) {
      chunks.push(chunk);
    }
  }

  assert.deepEqual(chunks, [line]);
});

test('incremental reader restarts when the event log is replaced or truncated', async (t) => {
  const eventsPath = createTempEventsFile(t);
  const rotatedPath = `${eventsPath}.old`;
  const firstLine = `${JSON.stringify({ id: 'first-event-with-a-longer-payload' })}\n`;
  const replacementLine = `${JSON.stringify({ id: 'replacement' })}\n`;
  const truncatedLine = `${JSON.stringify({ id: 'new' })}\n`;
  fs.writeFileSync(eventsPath, firstLine);

  const readEvents = createIncrementalJsonlReader(eventsPath, {
    initialTailBytes: 1024,
    maxReadBytes: 1024,
  });

  assert.equal(await readEvents(), firstLine);

  fs.renameSync(eventsPath, rotatedPath);
  fs.writeFileSync(eventsPath, replacementLine);

  assert.equal(await readEvents(), replacementLine);

  fs.truncateSync(eventsPath, 0);
  fs.appendFileSync(eventsPath, truncatedLine);

  assert.equal(await readEvents(), truncatedLine);
});
