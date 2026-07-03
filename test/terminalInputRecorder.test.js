const assert = require('node:assert/strict');
const test = require('node:test');
const {
  createInputRecord,
  formatInputRecord,
  summarizeInputRecords,
} = require('../src/terminalInputRecorder');

test('createInputRecord labels ESC plus CR as the managed Shift+Enter sequence', () => {
  const record = createInputRecord(Buffer.from([0x1b, 0x0d]), {
    sequence: 7,
    startedAtNs: 1_000_000n,
    nowNs: 3_500_000n,
  });

  assert.deepEqual(record, {
    sequence: 7,
    elapsedMs: 2.5,
    byteLength: 2,
    hex: '1b 0d',
    utf8: '\u001b\r',
    labels: ['ESC', 'CR', 'ESC+CR'],
  });
});

test('createInputRecord keeps committed Hangul bytes readable', () => {
  const record = createInputRecord(Buffer.from('날', 'utf8'), {
    sequence: 1,
    startedAtNs: 0n,
    nowNs: 0n,
  });

  assert.equal(record.hex, 'eb 82 a0');
  assert.equal(record.utf8, '날');
  assert.deepEqual(record.labels, ['UTF8_NON_ASCII']);
});

test('formatInputRecord emits a compact one-line trace', () => {
  const record = createInputRecord(Buffer.from([0x1b, 0x0a]), {
    sequence: 12,
    startedAtNs: 0n,
    nowNs: 12_345_678n,
  });

  assert.equal(
    formatInputRecord(record),
    '#0012 +12.346ms len=2 hex=1b 0a labels=ESC,LF,ESC+LF utf8="\\u001b\\n"',
  );
});

test('summarizeInputRecords counts the newline and sequence signals needed for diagnosis', () => {
  const records = [
    createInputRecord(Buffer.from('나의사랑한글날', 'utf8'), {
      sequence: 1,
      startedAtNs: 0n,
      nowNs: 0n,
    }),
    createInputRecord(Buffer.from([0x0d]), {
      sequence: 2,
      startedAtNs: 0n,
      nowNs: 1_000_000n,
    }),
    createInputRecord(Buffer.from([0x1b, 0x0d]), {
      sequence: 3,
      startedAtNs: 0n,
      nowNs: 2_000_000n,
    }),
  ];

  assert.deepEqual(summarizeInputRecords(records), {
    chunks: 3,
    bytes: 24,
    escCr: 1,
    escLf: 0,
    cr: 2,
    lf: 0,
    etx: 0,
    hangulChunks: 1,
  });
});
