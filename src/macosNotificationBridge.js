const childProcess = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { agentNotificationReplacementKey } = require('./agentNotificationReplacement');

const BRIDGE_APP_NAME = 'Code Agent Notifications.app';
const LEGACY_BRIDGE_APP_NAME = 'CodeAgentNotificationBridge.app';
const BRIDGE_EXECUTABLE_NAME = 'CodeAgentNotificationBridge';
const BRIDGE_BUNDLE_IDENTIFIER = 'com.seongho.CodeAgentNotifications';
const BRIDGE_ICON_NAME = 'AppIcon';
const BRIDGE_ICON_FILE = `${BRIDGE_ICON_NAME}.icns`;
const BRIDGE_ASSETS_CAR_FILE = 'Assets.car';
const BRIDGE_MARKER_VERSION = 1;
const BRIDGE_MARKER_NAME = 'codex-vscode-terminal-tools-marker.json';
const DEFAULT_EXTENSION_ID = 'seongho.codex-vscode-terminal-tools';
const DEFAULT_URI_SCHEME = 'vscode';
const OPEN_NOTIFICATION_PATH = 'open-agent-notification';
const DEFAULT_NOTIFY_TIMEOUT_MS = 10000;
const LSREGISTER_PATH = '/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister';

function defaultMacosNotificationBridgeAppPath({ home = os.homedir() } = {}) {
  return path.join(home, 'Applications', BRIDGE_APP_NAME);
}

function legacyMacosNotificationBridgeAppPaths({ home = os.homedir() } = {}) {
  return [
    path.join(
      home,
      'Library',
      'Application Support',
      'codex-vscode-terminal-tools',
      LEGACY_BRIDGE_APP_NAME,
    ),
  ];
}

function macosNotificationBridgeExecutablePath(appPath) {
  return path.join(appPath, 'Contents', 'MacOS', BRIDGE_EXECUTABLE_NAME);
}

function macosNotificationBridgeInfoPlistPath(appPath) {
  return path.join(appPath, 'Contents', 'Info.plist');
}

function macosNotificationBridgeMarkerPath(appPath) {
  return path.join(appPath, 'Contents', 'Resources', BRIDGE_MARKER_NAME);
}

function macosNotificationBridgeIconPath(appPath) {
  return path.join(appPath, 'Contents', 'Resources', BRIDGE_ICON_FILE);
}

function macosNotificationBridgeAssetsCarPath(appPath) {
  return path.join(appPath, 'Contents', 'Resources', BRIDGE_ASSETS_CAR_FILE);
}

function bridgeSourceDir(projectRoot) {
  return path.join(projectRoot, 'native', 'CodeAgentNotificationBridge');
}

function bridgeSourcePaths(projectRoot) {
  const sourceDir = bridgeSourceDir(projectRoot);
  return {
    mainSwiftPath: path.join(sourceDir, 'main.swift'),
    infoPlistPath: path.join(sourceDir, 'Info.plist'),
    iconPath: path.join(projectRoot, 'assets', 'warp-glass-sky.png'),
  };
}

function fileHashInputs(projectRoot) {
  const { mainSwiftPath, infoPlistPath, iconPath } = bridgeSourcePaths(projectRoot);
  return [
    ['main.swift', mainSwiftPath],
    ['Info.plist', infoPlistPath],
    [BRIDGE_ICON_FILE, iconPath],
  ];
}

function sourceHash(projectRoot) {
  const hash = crypto.createHash('sha256');
  for (const [name, filePath] of fileHashInputs(projectRoot)) {
    hash.update(name);
    hash.update('\0');
    hash.update(fs.readFileSync(filePath));
    hash.update('\0');
  }
  hash.update(BRIDGE_BUNDLE_IDENTIFIER);
  hash.update('\0');
  hash.update(BRIDGE_EXECUTABLE_NAME);
  return hash.digest('hex');
}

function expectedBridgeMarker(projectRoot) {
  return {
    version: BRIDGE_MARKER_VERSION,
    bundleIdentifier: BRIDGE_BUNDLE_IDENTIFIER,
    executableName: BRIDGE_EXECUTABLE_NAME,
    sourceHash: sourceHash(projectRoot),
  };
}

function readJsonFile(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return undefined;
  }
}

function deepEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function writeBridgeAppIconContentsJson(iconsetPath) {
  const images = [
    ['16x16', '1x', 'icon_16x16.png'],
    ['16x16', '2x', 'icon_16x16@2x.png'],
    ['32x32', '1x', 'icon_32x32.png'],
    ['32x32', '2x', 'icon_32x32@2x.png'],
    ['128x128', '1x', 'icon_128x128.png'],
    ['128x128', '2x', 'icon_128x128@2x.png'],
    ['256x256', '1x', 'icon_256x256.png'],
    ['256x256', '2x', 'icon_256x256@2x.png'],
    ['512x512', '1x', 'icon_512x512.png'],
    ['512x512', '2x', 'icon_512x512@2x.png'],
  ].map(([size, scale, filename]) => ({
    idiom: 'mac',
    size,
    scale,
    filename,
  }));

  fs.writeFileSync(
    path.join(iconsetPath, 'Contents.json'),
    `${JSON.stringify({ images, info: { author: 'xcode', version: 1 } }, null, 2)}\n`,
  );
}

function compileBridgeAppIcon({ sourceIconPath, resourcesPath, execFileSync }) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-notification-bridge-assets-'));
  try {
    const assetCatalogPath = path.join(tmpDir, 'Assets.xcassets');
    const iconsetPath = path.join(assetCatalogPath, `${BRIDGE_ICON_NAME}.appiconset`);
    fs.mkdirSync(iconsetPath, { recursive: true });

    const iconSizes = [
      [16, 'icon_16x16.png'],
      [32, 'icon_16x16@2x.png'],
      [32, 'icon_32x32.png'],
      [64, 'icon_32x32@2x.png'],
      [128, 'icon_128x128.png'],
      [256, 'icon_128x128@2x.png'],
      [256, 'icon_256x256.png'],
      [512, 'icon_256x256@2x.png'],
      [512, 'icon_512x512.png'],
      [1024, 'icon_512x512@2x.png'],
    ];
    for (const [pixels, filename] of iconSizes) {
      execFileSync(
        'sips',
        [
          '-z',
          String(pixels),
          String(pixels),
          sourceIconPath,
          '--out',
          path.join(iconsetPath, filename),
        ],
        { stdio: 'pipe' },
      );
    }

    writeBridgeAppIconContentsJson(iconsetPath);
    execFileSync(
      'xcrun',
      [
        'actool',
        '--compile',
        resourcesPath,
        '--platform',
        'macosx',
        '--minimum-deployment-target',
        '12.0',
        '--app-icon',
        BRIDGE_ICON_NAME,
        '--output-partial-info-plist',
        path.join(tmpDir, 'asset-catalog-partial-info.plist'),
        assetCatalogPath,
      ],
      { stdio: 'pipe' },
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function checkMacosNotificationBridge({
  appPath = defaultMacosNotificationBridgeAppPath(),
  projectRoot = path.resolve(__dirname, '..'),
  platform = process.platform,
} = {}) {
  if (platform !== 'darwin') {
    return { ok: true, detail: 'not macOS; notification bridge skipped' };
  }

  if (!fs.existsSync(macosNotificationBridgeExecutablePath(appPath))) {
    return { ok: false, detail: 'macOS notification bridge executable missing' };
  }
  if (!fs.existsSync(macosNotificationBridgeInfoPlistPath(appPath))) {
    return { ok: false, detail: 'macOS notification bridge Info.plist missing' };
  }
  const infoPlist = fs.readFileSync(macosNotificationBridgeInfoPlistPath(appPath), 'utf8');
  if (!infoPlist.includes('<key>CFBundleIconFile</key>') || !infoPlist.includes(`<string>${BRIDGE_ICON_NAME}</string>`)) {
    return { ok: false, detail: 'macOS notification bridge bundle icon is not declared' };
  }
  if (!infoPlist.includes('<key>CFBundleIconName</key>') || !infoPlist.includes(`<string>${BRIDGE_ICON_NAME}</string>`)) {
    return { ok: false, detail: 'macOS notification bridge asset catalog icon is not declared' };
  }
  if (!fs.existsSync(macosNotificationBridgeIconPath(appPath))) {
    return { ok: false, detail: 'macOS notification bridge icon resource missing' };
  }
  if (!fs.existsSync(macosNotificationBridgeAssetsCarPath(appPath))) {
    return { ok: false, detail: 'macOS notification bridge asset catalog missing' };
  }

  const marker = readJsonFile(macosNotificationBridgeMarkerPath(appPath));
  if (!deepEqual(marker, expectedBridgeMarker(projectRoot))) {
    return { ok: false, detail: 'macOS notification bridge marker is stale or missing' };
  }

  return { ok: true, detail: 'macOS notification bridge app is installed' };
}

function ensureMacosNotificationBridge({
  appPath = defaultMacosNotificationBridgeAppPath(),
  projectRoot = path.resolve(__dirname, '..'),
  platform = process.platform,
  execFileSync = childProcess.execFileSync,
  staleAppPaths = [],
} = {}) {
  if (platform !== 'darwin') {
    return { changed: false, detail: 'not macOS; notification bridge skipped' };
  }

  const removedStaleAppPaths = [];
  for (const staleAppPath of staleAppPaths) {
    if (!staleAppPath || path.resolve(staleAppPath) === path.resolve(appPath)) {
      continue;
    }
    if (!fs.existsSync(staleAppPath)) {
      continue;
    }
    try {
      execFileSync(LSREGISTER_PATH, ['-u', staleAppPath], { stdio: 'pipe' });
    } catch {
      // A stale app can still be removed when LaunchServices no longer knows it.
    }
    fs.rmSync(staleAppPath, { recursive: true, force: true });
    removedStaleAppPaths.push(staleAppPath);
  }

  const current = checkMacosNotificationBridge({ appPath, projectRoot, platform });
  if (current.ok) {
    return {
      changed: removedStaleAppPaths.length > 0,
      detail: removedStaleAppPaths.length > 0
        ? `${current.detail}; removed stale bridge app: ${removedStaleAppPaths.join(', ')}`
        : current.detail,
    };
  }

  const { mainSwiftPath, infoPlistPath, iconPath } = bridgeSourcePaths(projectRoot);
  if (!fs.existsSync(mainSwiftPath)) {
    throw new Error(`macOS notification bridge source missing: ${mainSwiftPath}`);
  }
  if (!fs.existsSync(infoPlistPath)) {
    throw new Error(`macOS notification bridge Info.plist source missing: ${infoPlistPath}`);
  }
  if (!fs.existsSync(iconPath)) {
    throw new Error(`macOS notification bridge icon source missing: ${iconPath}`);
  }

  if (fs.existsSync(appPath)) {
    try {
      execFileSync(LSREGISTER_PATH, ['-u', appPath], { stdio: 'pipe' });
    } catch {
      // The app is about to be rebuilt; stale LaunchServices state is best-effort cleanup.
    }
  }
  fs.rmSync(appPath, { recursive: true, force: true });
  fs.mkdirSync(path.join(appPath, 'Contents', 'MacOS'), { recursive: true });
  const resourcesPath = path.join(appPath, 'Contents', 'Resources');
  fs.mkdirSync(resourcesPath, { recursive: true });
  fs.copyFileSync(infoPlistPath, macosNotificationBridgeInfoPlistPath(appPath));
  compileBridgeAppIcon({
    sourceIconPath: iconPath,
    resourcesPath,
    execFileSync,
  });

  const executablePath = macosNotificationBridgeExecutablePath(appPath);
  execFileSync(
    'swiftc',
    [
      '-O',
      '-framework',
      'AppKit',
      '-framework',
      'UserNotifications',
      mainSwiftPath,
      '-o',
      executablePath,
    ],
    { stdio: 'pipe' },
  );
  fs.chmodSync(executablePath, 0o755);
  fs.writeFileSync(
    macosNotificationBridgeMarkerPath(appPath),
    `${JSON.stringify(expectedBridgeMarker(projectRoot), null, 2)}\n`,
  );
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], { stdio: 'pipe' });
  try {
    execFileSync(LSREGISTER_PATH, ['-u', appPath], { stdio: 'pipe' });
    execFileSync(LSREGISTER_PATH, ['-f', appPath], { stdio: 'pipe' });
  } catch {
    // LaunchServices refresh is best-effort; the app still registers when opened.
  }

  return {
    changed: true,
    detail: removedStaleAppPaths.length > 0
      ? `macOS notification bridge app rebuilt; removed stale bridge app: ${removedStaleAppPaths.join(', ')}`
      : 'macOS notification bridge app rebuilt',
  };
}

function cleanText(value) {
  return typeof value === 'string' && value.trim()
    ? value.replace(/\s+/g, ' ').trim()
    : undefined;
}

function createNotificationUri({
  eventId,
  replacementKey,
  scheme = DEFAULT_URI_SCHEME,
  extensionId = DEFAULT_EXTENSION_ID,
} = {}) {
  const params = new URLSearchParams();
  if (eventId) {
    params.set('id', eventId);
  }
  if (replacementKey) {
    params.set('replacementKey', replacementKey);
  }
  return `${scheme}://${extensionId}/${OPEN_NOTIFICATION_PATH}?${params.toString()}`;
}

function createMacosAgentNotificationPayload(record, {
  message,
  scheme = DEFAULT_URI_SCHEME,
  extensionId = DEFAULT_EXTENSION_ID,
  sound = true,
} = {}) {
  const messageLines = typeof message === 'string' ? message.split(/\r?\n/) : [];
  const title = cleanText(messageLines[0]) || cleanText(record?.title) || 'Codex notification';
  const subtitle = cleanText(messageLines[1]) || cleanText(record?.subtitle);
  const body = cleanText(messageLines.slice(2).join('\n')) || cleanText(record?.body);
  const replacementKey = agentNotificationReplacementKey(record);
  const eventId = cleanText(record?.id);
  const payload = {
    schemaVersion: 1,
    identifier: replacementKey || `event:${eventId || Date.now()}`,
    eventId,
    replacementKey,
    title,
    subtitle,
    body,
    uri: createNotificationUri({
      eventId,
      replacementKey,
      scheme,
      extensionId,
    }),
    sound: Boolean(sound),
  };

  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined),
  );
}

function encodeBridgePayloadArgument(payload) {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');
}

function sendMacosAgentNotificationPayload(payload, {
  appPath = defaultMacosNotificationBridgeAppPath(),
  platform = process.platform,
  existsSync = fs.existsSync,
  execFile = childProcess.execFile,
  timeoutMs = DEFAULT_NOTIFY_TIMEOUT_MS,
} = {}) {
  if (platform !== 'darwin') {
    return Promise.resolve({ ok: false, skipped: 'not-macos' });
  }

  const executablePath = macosNotificationBridgeExecutablePath(appPath);
  if (!existsSync(executablePath)) {
    return Promise.resolve({ ok: false, skipped: 'helper-missing' });
  }

  return new Promise((resolve) => {
    try {
      execFile(
        '/usr/bin/open',
        ['-W', '-n', appPath, '--args', '--notify', encodeBridgePayloadArgument(payload)],
        { timeout: timeoutMs, windowsHide: true },
        (error) => {
          if (error) {
            resolve({ ok: false, error: error.message });
            return;
          }
          resolve({ ok: true });
        },
      );
    } catch (error) {
      resolve({ ok: false, error: error.message });
    }
  });
}

function createMacosNotificationBridge(options = {}) {
  return {
    notify(record, notificationOptions = {}) {
      const payload = createMacosAgentNotificationPayload(record, {
        message: notificationOptions.message,
        scheme: options.scheme,
        extensionId: options.extensionId,
        sound: options.sound,
      });
      return sendMacosAgentNotificationPayload(payload, options);
    },
  };
}

module.exports = {
  BRIDGE_APP_NAME,
  BRIDGE_BUNDLE_IDENTIFIER,
  BRIDGE_EXECUTABLE_NAME,
  BRIDGE_ICON_FILE,
  BRIDGE_ICON_NAME,
  DEFAULT_EXTENSION_ID,
  DEFAULT_URI_SCHEME,
  OPEN_NOTIFICATION_PATH,
  checkMacosNotificationBridge,
  createMacosAgentNotificationPayload,
  createMacosNotificationBridge,
  createNotificationUri,
  defaultMacosNotificationBridgeAppPath,
  encodeBridgePayloadArgument,
  ensureMacosNotificationBridge,
  legacyMacosNotificationBridgeAppPaths,
  macosNotificationBridgeExecutablePath,
  macosNotificationBridgeAssetsCarPath,
  macosNotificationBridgeIconPath,
  sendMacosAgentNotificationPayload,
};
