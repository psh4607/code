const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  BRIDGE_BUNDLE_IDENTIFIER,
  BRIDGE_EXECUTABLE_NAME,
  BRIDGE_ICON_FILE,
  BRIDGE_ICON_NAME,
  createMacosAgentNotificationPayload,
  createNotificationUri,
  defaultMacosNotificationBridgeAppPath,
  encodeBridgePayloadArgument,
  ensureMacosNotificationBridge,
  checkMacosNotificationBridge,
  macosNotificationBridgeIconPath,
  macosNotificationBridgeExecutablePath,
  sendMacosAgentNotificationPayload,
} = require('../src/macosNotificationBridge');

function event(overrides = {}) {
  return {
    id: 'event-1',
    event: 'turn_finished',
    provider: 'codex',
    sessionId: 'session-1',
    terminalPid: 1234,
    title: 'Codex finished',
    body: 'Ready',
    createdAt: 1000,
    dedupeKey: 'codex:session-1:turn_finished',
    ...overrides,
  };
}

test('defaultMacosNotificationBridgeAppPath lives under managed Application Support', () => {
  assert.equal(
    defaultMacosNotificationBridgeAppPath({ home: '/tmp/home' }),
    '/tmp/home/Library/Application Support/codex-vscode-terminal-tools/CodeAgentNotificationBridge.app',
  );
});

test('createNotificationUri targets this extension URI handler', () => {
  assert.equal(
    createNotificationUri({
      eventId: 'event 1',
      replacementKey: 'session:abc',
      scheme: 'vscode',
      extensionId: 'seongho.codex-vscode-terminal-tools',
    }),
    'vscode://seongho.codex-vscode-terminal-tools/open-agent-notification?id=event+1&replacementKey=session%3Aabc',
  );
});

test('createMacosAgentNotificationPayload maps a formatted agent record into a replaceable native payload', () => {
  const payload = createMacosAgentNotificationPayload(event(), {
    message: 'Codex finished\nproject · session session-1 · Complete\nReady',
  });

  assert.deepEqual(payload, {
    schemaVersion: 1,
    identifier: 'session:session-1',
    eventId: 'event-1',
    replacementKey: 'session:session-1',
    title: 'Codex finished',
    subtitle: 'project · session session-1 · Complete',
    body: 'Ready',
    uri: 'vscode://seongho.codex-vscode-terminal-tools/open-agent-notification?id=event-1&replacementKey=session%3Asession-1',
    sound: true,
  });
});

test('encodeBridgePayloadArgument base64-encodes the JSON payload for Swift argv transport', () => {
  const payload = { title: 'Codex finished', body: 'Ready' };
  const encoded = encodeBridgePayloadArgument(payload);

  assert.deepEqual(JSON.parse(Buffer.from(encoded, 'base64').toString('utf8')), payload);
});

test('sendMacosAgentNotificationPayload skips when the helper app is missing', async () => {
  const result = await sendMacosAgentNotificationPayload(
    { title: 'Codex finished' },
    {
      appPath: '/tmp/missing.app',
      platform: 'darwin',
      existsSync: () => false,
      execFile() {
        throw new Error('should not execute');
      },
    },
  );

  assert.deepEqual(result, {
    ok: false,
    skipped: 'helper-missing',
  });
});

test('sendMacosAgentNotificationPayload invokes the managed helper executable on macOS', async () => {
  const calls = [];
  const appPath = '/tmp/CodeAgentNotificationBridge.app';
  const result = await sendMacosAgentNotificationPayload(
    { title: 'Codex finished' },
    {
      appPath,
      platform: 'darwin',
      existsSync: () => true,
      execFile(file, args, options, callback) {
        calls.push({ file, args, options });
        callback(null, '', '');
      },
    },
  );

  assert.deepEqual(result, { ok: true });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].file, macosNotificationBridgeExecutablePath(appPath));
  assert.deepEqual(calls[0].args.slice(0, 1), ['--notify']);
  assert.equal(calls[0].options.timeout, 10000);
  assert.deepEqual(JSON.parse(Buffer.from(calls[0].args[1], 'base64').toString('utf8')), {
    title: 'Codex finished',
  });
});

test('sendMacosAgentNotificationPayload skips on non-macOS platforms', async () => {
  const result = await sendMacosAgentNotificationPayload(
    { title: 'Codex finished' },
    {
      platform: 'linux',
      existsSync: () => true,
      execFile() {
        throw new Error('should not execute');
      },
    },
  );

  assert.deepEqual(result, {
    ok: false,
    skipped: 'not-macos',
  });
});

test('native bridge Info.plist declares a bundle icon for Notification Center', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'native', 'CodeAgentNotificationBridge', 'Info.plist'),
    'utf8',
  );

  assert.match(source, /<key>CFBundleIconFile<\/key>/);
  assert.match(source, new RegExp(`<string>${BRIDGE_ICON_NAME}</string>`));
});

test('ensureMacosNotificationBridge builds a signed app bundle with a deterministic marker', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-notification-bridge-test-'));
  const projectRoot = path.join(tmpDir, 'project');
  const sourceDir = path.join(projectRoot, 'native', 'CodeAgentNotificationBridge');
  const assetsDir = path.join(projectRoot, 'assets');
  const appPath = path.join(tmpDir, 'CodeAgentNotificationBridge.app');
  const calls = [];
  fs.mkdirSync(sourceDir, { recursive: true });
  fs.mkdirSync(assetsDir, { recursive: true });
  fs.writeFileSync(path.join(sourceDir, 'main.swift'), 'print("bridge")\n');
  fs.writeFileSync(path.join(assetsDir, 'warp-glass-sky.icns'), 'icon-bytes');
  fs.writeFileSync(
    path.join(sourceDir, 'Info.plist'),
    `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict>
<key>CFBundleExecutable</key><string>${BRIDGE_EXECUTABLE_NAME}</string>
<key>CFBundleIdentifier</key><string>${BRIDGE_BUNDLE_IDENTIFIER}</string>
<key>CFBundleIconFile</key><string>${BRIDGE_ICON_NAME}</string>
</dict></plist>
`,
  );

  const result = ensureMacosNotificationBridge({
    appPath,
    projectRoot,
    platform: 'darwin',
    execFileSync(command, args) {
      calls.push({ command, args });
      if (command === 'swiftc') {
        fs.writeFileSync(args.at(-1), '#!/bin/sh\n');
      }
      return '';
    },
  });

  assert.equal(result.changed, true);
  assert.equal(fs.existsSync(path.join(appPath, 'Contents', 'Info.plist')), true);
  assert.equal(fs.existsSync(macosNotificationBridgeExecutablePath(appPath)), true);
  assert.equal(fs.existsSync(macosNotificationBridgeIconPath(appPath)), true);
  assert.equal(
    fs.readFileSync(macosNotificationBridgeIconPath(appPath), 'utf8'),
    'icon-bytes',
  );
  assert.equal(path.basename(macosNotificationBridgeIconPath(appPath)), BRIDGE_ICON_FILE);
  assert.deepEqual(calls.map((call) => call.command), ['swiftc', 'codesign']);
  assert.deepEqual(checkMacosNotificationBridge({ appPath, projectRoot, platform: 'darwin' }), {
    ok: true,
    detail: 'macOS notification bridge app is installed',
  });

  const second = ensureMacosNotificationBridge({
    appPath,
    projectRoot,
    platform: 'darwin',
    execFileSync() {
      throw new Error('already current app should not rebuild');
    },
  });
  assert.equal(second.changed, false);
});
