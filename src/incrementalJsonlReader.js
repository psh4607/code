const fs = require('node:fs');

const DEFAULT_INITIAL_TAIL_BYTES = 1024 * 1024;
const DEFAULT_MAX_READ_BYTES = 1024 * 1024;
const NEWLINE_BYTE = 0x0a;

function positiveInteger(value, fallback) {
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

function fileIdentity(stat) {
  return `${stat.dev}:${stat.ino}`;
}

function createIncrementalJsonlReader(filePath, {
  fsPromises = fs.promises,
  initialTailBytes = DEFAULT_INITIAL_TAIL_BYTES,
  maxReadBytes = DEFAULT_MAX_READ_BYTES,
} = {}) {
  const initialReadLimit = positiveInteger(initialTailBytes, DEFAULT_INITIAL_TAIL_BYTES);
  const perReadLimit = positiveInteger(maxReadBytes, DEFAULT_MAX_READ_BYTES);
  let identity;
  let offset = 0;
  let remainder = Buffer.alloc(0);
  let dropLeadingPartial = false;

  function reset() {
    identity = undefined;
    offset = 0;
    remainder = Buffer.alloc(0);
    dropLeadingPartial = false;
  }

  async function startReadingFile(handle, stat) {
    identity = fileIdentity(stat);
    offset = Math.max(0, stat.size - initialReadLimit);
    remainder = Buffer.alloc(0);
    dropLeadingPartial = false;

    if (offset <= 0) {
      return;
    }

    const precedingByte = Buffer.allocUnsafe(1);
    const { bytesRead } = await handle.read(precedingByte, 0, 1, offset - 1);
    dropLeadingPartial = bytesRead === 1 && precedingByte[0] !== NEWLINE_BYTE;
  }

  function consume(chunk) {
    if (chunk.length === 0) {
      return '';
    }

    let available = remainder.length > 0
      ? Buffer.concat([remainder, chunk])
      : chunk;
    remainder = Buffer.alloc(0);

    if (dropLeadingPartial) {
      const firstNewline = available.indexOf(NEWLINE_BYTE);
      if (firstNewline < 0) {
        return '';
      }
      available = available.subarray(firstNewline + 1);
      dropLeadingPartial = false;
    }

    const lastNewline = available.lastIndexOf(NEWLINE_BYTE);
    if (lastNewline < 0) {
      remainder = Buffer.from(available);
      return '';
    }

    const completeLines = available.subarray(0, lastNewline + 1);
    remainder = Buffer.from(available.subarray(lastNewline + 1));
    return completeLines.toString('utf8');
  }

  return async function readIncrementalJsonl() {
    let handle;
    try {
      handle = await fsPromises.open(filePath, 'r');
      const stat = await handle.stat();
      const nextIdentity = fileIdentity(stat);
      if (identity !== nextIdentity || stat.size < offset) {
        await startReadingFile(handle, stat);
      }

      const remainingBytes = Math.max(0, stat.size - offset);
      if (remainingBytes === 0) {
        return '';
      }

      const bytesToRead = Math.min(remainingBytes, perReadLimit);
      const chunk = Buffer.allocUnsafe(bytesToRead);
      const { bytesRead } = await handle.read(chunk, 0, bytesToRead, offset);
      offset += bytesRead;
      return consume(chunk.subarray(0, bytesRead));
    } catch {
      reset();
      return '';
    } finally {
      await handle?.close().catch(() => undefined);
    }
  };
}

module.exports = {
  DEFAULT_INITIAL_TAIL_BYTES,
  DEFAULT_MAX_READ_BYTES,
  createIncrementalJsonlReader,
};
