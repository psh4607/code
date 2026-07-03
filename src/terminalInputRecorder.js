const CONTROL_LABELS = new Map([
  [0x00, 'NUL'],
  [0x03, 'ETX'],
  [0x04, 'EOT'],
  [0x08, 'BS'],
  [0x09, 'TAB'],
  [0x0a, 'LF'],
  [0x0d, 'CR'],
  [0x1b, 'ESC'],
  [0x7f, 'DEL'],
]);

function hexByte(byte) {
  return byte.toString(16).padStart(2, '0');
}

function isPrintableAscii(byte) {
  return byte >= 0x20 && byte <= 0x7e;
}

function unique(values) {
  return [...new Set(values)];
}

function labelsForBuffer(buffer) {
  const labels = [];

  for (const byte of buffer) {
    if (CONTROL_LABELS.has(byte)) {
      labels.push(CONTROL_LABELS.get(byte));
    }
  }

  for (let index = 0; index < buffer.length - 1; index += 1) {
    const byte = buffer[index];
    const nextByte = buffer[index + 1];

    if (byte === 0x1b && nextByte === 0x0d) {
      labels.push('ESC+CR');
    }

    if (byte === 0x1b && nextByte === 0x0a) {
      labels.push('ESC+LF');
    }

    if (byte === 0x1b && nextByte === 0x5b) {
      labels.push('CSI');
    }
  }

  const hasNonAscii = [...buffer].some((byte) => byte >= 0x80);
  if (hasNonAscii) {
    labels.push('UTF8_NON_ASCII');
  }

  const hasPrintableAscii = [...buffer].some(isPrintableAscii);
  if (hasPrintableAscii) {
    labels.push('PRINTABLE_ASCII');
  }

  return unique(labels);
}

function createInputRecord(buffer, { sequence, startedAtNs, nowNs = process.hrtime.bigint() }) {
  const elapsedMs = Number(nowNs - startedAtNs) / 1_000_000;

  return {
    sequence,
    elapsedMs: Math.round(elapsedMs * 1000) / 1000,
    byteLength: buffer.length,
    hex: [...buffer].map(hexByte).join(' '),
    utf8: buffer.toString('utf8'),
    labels: labelsForBuffer(buffer),
  };
}

function formatInputRecord(record) {
  const sequence = String(record.sequence).padStart(4, '0');
  const elapsedMs = record.elapsedMs.toFixed(3);
  const labels = record.labels.length > 0 ? record.labels.join(',') : '-';

  return `#${sequence} +${elapsedMs}ms len=${record.byteLength} hex=${record.hex} labels=${labels} utf8=${JSON.stringify(record.utf8)}`;
}

function recordHasLabel(record, label) {
  return record.labels.includes(label);
}

function countByte(records, byteHex) {
  return records.reduce(
    (count, record) => count + record.hex.split(' ').filter((byte) => byte === byteHex).length,
    0,
  );
}

function summarizeInputRecords(records) {
  return {
    chunks: records.length,
    bytes: records.reduce((sum, record) => sum + record.byteLength, 0),
    escCr: records.filter((record) => recordHasLabel(record, 'ESC+CR')).length,
    escLf: records.filter((record) => recordHasLabel(record, 'ESC+LF')).length,
    cr: countByte(records, '0d'),
    lf: countByte(records, '0a'),
    etx: countByte(records, '03'),
    hangulChunks: records.filter(
      (record) => recordHasLabel(record, 'UTF8_NON_ASCII') && /[가-힣]/u.test(record.utf8),
    ).length,
  };
}

module.exports = {
  createInputRecord,
  formatInputRecord,
  summarizeInputRecords,
};
