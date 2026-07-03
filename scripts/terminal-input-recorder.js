#!/usr/bin/env node

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  createInputRecord,
  formatInputRecord,
  summarizeInputRecords,
} = require('../src/terminalInputRecorder');

function timestamp() {
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-');
}

function defaultOutputPath() {
  return path.join(os.tmpdir(), `codex-vscode-terminal-input-${timestamp()}.jsonl`);
}

function parseArgs(argv) {
  const args = {
    outputPath: defaultOutputPath(),
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '-h' || arg === '--help') {
      args.help = true;
      continue;
    }

    if (arg === '-o' || arg === '--output') {
      const outputPath = argv[index + 1];
      if (!outputPath) {
        throw new Error(`${arg} requires a path`);
      }
      args.outputPath = path.resolve(outputPath);
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

function printHelp() {
  console.log([
    'Usage: npm run record:terminal-input -- [--output <path>]',
    '',
    'Run this inside the VS Code integrated terminal, then type the exact IME repro:',
    '  1. Type: 나의사랑한글날',
    '  2. Press Shift+Enter once',
    '  3. Press Ctrl+C to stop',
    '',
    'The recorder prints each raw stdin chunk and writes JSONL records to the output path.',
  ].join('\n'));
}

function ensureParentDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function run() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    return;
  }

  if (!process.stdin.isTTY) {
    console.error('terminal-input-recorder requires an interactive TTY stdin.');
    process.exit(1);
  }

  ensureParentDir(args.outputPath);
  const stream = fs.createWriteStream(args.outputPath, { flags: 'a' });
  const records = [];
  const startedAtNs = process.hrtime.bigint();
  let sequence = 0;
  let stopped = false;

  function writeLine(line = '') {
    process.stdout.write(`${line}\n`);
  }

  function stop() {
    if (stopped) {
      return;
    }
    stopped = true;

    try {
      process.stdin.setRawMode(false);
    } catch {}

    process.stdin.pause();

    const summary = summarizeInputRecords(records);
    stream.write(`${JSON.stringify({ type: 'summary', summary })}\n`);
    stream.end();

    writeLine('');
    writeLine('Summary');
    for (const [key, value] of Object.entries(summary)) {
      writeLine(`  ${key}: ${value}`);
    }
    writeLine(`Log: ${args.outputPath}`);
  }

  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  process.on('exit', () => {
    try {
      process.stdin.setRawMode(false);
    } catch {}
  });

  writeLine('Codex VS Code terminal input recorder');
  writeLine(`Log: ${args.outputPath}`);
  writeLine('');
  writeLine('Type the exact repro now: 나의사랑한글날, then Shift+Enter once.');
  writeLine('Press Ctrl+C to stop and print the summary.');
  writeLine('');

  process.stdin.setRawMode(true);
  process.stdin.resume();

  process.stdin.on('data', (chunk) => {
    sequence += 1;
    const record = createInputRecord(chunk, {
      sequence,
      startedAtNs,
    });
    records.push(record);
    stream.write(`${JSON.stringify({ type: 'input', record })}\n`);
    writeLine(formatInputRecord(record));

    if (chunk.includes(0x03)) {
      stop();
    }
  });
}

try {
  run();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
