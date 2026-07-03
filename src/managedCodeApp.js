const childProcess = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_APPLICATIONS_DIR = '/Applications';
const SOURCE_APP_NAME = 'Visual Studio Code.app';
const MANAGED_APP_NAME = 'Code.app';
const MANAGED_BUNDLE_ID = 'com.seongho.Code';
const MANAGED_HELPER_BUNDLE_ID = 'com.seongho.Code.helper';
const MANAGED_BUNDLE_DISPLAY_NAME = 'Code';
// Preserve entitlements such as JIT, but let codesign regenerate the identifier
// and avoid preserving hardened-runtime library validation from Microsoft's app.
const MANAGED_CODE_SIGN_PRESERVE_METADATA = 'entitlements';
const CODEX_MANAGED_APP_MARKER_RELATIVE_PATH =
  'Contents/Resources/app/codex-managed-code-app.json';
const MANAGED_HELPER_INFO_PLIST_RELATIVE_PATHS = [
  'Contents/Frameworks/Code Helper.app/Contents/Info.plist',
  'Contents/Frameworks/Code Helper (GPU).app/Contents/Info.plist',
  'Contents/Frameworks/Code Helper (Plugin).app/Contents/Info.plist',
  'Contents/Frameworks/Code Helper (Renderer).app/Contents/Info.plist',
];

function createManagedCodeAppPaths({
  applicationsDir = DEFAULT_APPLICATIONS_DIR,
  sourceAppPath = path.join(applicationsDir, SOURCE_APP_NAME),
  managedAppPath = path.join(applicationsDir, MANAGED_APP_NAME),
} = {}) {
  return {
    applicationsDir,
    sourceAppPath,
    managedAppPath,
    markerPath: path.join(managedAppPath, CODEX_MANAGED_APP_MARKER_RELATIVE_PATH),
    infoPlistPath: path.join(managedAppPath, 'Contents', 'Info.plist'),
    sourceInfoPlistPath: path.join(sourceAppPath, 'Contents', 'Info.plist'),
  };
}

function readPlistKey(infoPlistPath, key) {
  try {
    return childProcess
      .execFileSync('/usr/libexec/PlistBuddy', ['-c', `Print :${key}`, infoPlistPath], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      })
      .trim();
  } catch {
    return '';
  }
}

function readAppInfo(appPath) {
  const infoPlistPath = path.join(appPath, 'Contents', 'Info.plist');
  if (!fs.existsSync(infoPlistPath)) {
    return undefined;
  }

  return {
    bundleId: readPlistKey(infoPlistPath, 'CFBundleIdentifier'),
    displayName: readPlistKey(infoPlistPath, 'CFBundleDisplayName'),
    name: readPlistKey(infoPlistPath, 'CFBundleName'),
    shortVersion: readPlistKey(infoPlistPath, 'CFBundleShortVersionString'),
    bundleVersion: readPlistKey(infoPlistPath, 'CFBundleVersion'),
  };
}

function readManagedAppMarker(markerPath) {
  if (!fs.existsSync(markerPath)) {
    return undefined;
  }

  try {
    return JSON.parse(fs.readFileSync(markerPath, 'utf8'));
  } catch {
    return undefined;
  }
}

function buildManagedAppMarker({ sourceAppPath, managedAppPath, sourceInfo, refreshedAt }) {
  return {
    managedBy: 'codex-vscode-terminal-tools',
    sourceAppPath,
    managedAppPath,
    sourceBundleId: sourceInfo?.bundleId || '',
    sourceDisplayName: sourceInfo?.displayName || '',
    sourceName: sourceInfo?.name || '',
    sourceShortVersion: sourceInfo?.shortVersion || '',
    sourceBundleVersion: sourceInfo?.bundleVersion || '',
    managedBundleId: MANAGED_BUNDLE_ID,
    managedDisplayName: MANAGED_BUNDLE_DISPLAY_NAME,
    refreshedAt,
  };
}

function shouldRefreshManagedApp({ sourceInfo, managedExists, managedInfo, marker } = {}) {
  if (!managedExists) {
    return { refresh: true, reason: 'managed app missing' };
  }

  if (!managedInfo || managedInfo.bundleId !== MANAGED_BUNDLE_ID) {
    return { refresh: true, reason: 'managed app identity drifted' };
  }

  if (marker && marker.managedBundleId && marker.managedBundleId !== MANAGED_BUNDLE_ID) {
    return { refresh: true, reason: 'managed app identity marker drifted' };
  }

  if (
    !marker ||
    marker.sourceShortVersion !== (sourceInfo?.shortVersion || '') ||
    marker.sourceBundleVersion !== (sourceInfo?.bundleVersion || '')
  ) {
    return { refresh: true, reason: 'upstream app version changed' };
  }

  return { refresh: false, reason: 'managed app current' };
}

function setPlistString({ infoPlistPath, key, value, execFileSync }) {
  try {
    execFileSync('/usr/libexec/PlistBuddy', ['-c', `Set :${key} ${value}`, infoPlistPath], {
      stdio: 'ignore',
    });
  } catch {
    execFileSync(
      '/usr/libexec/PlistBuddy',
      ['-c', `Add :${key} string ${value}`, infoPlistPath],
      {
        stdio: 'ignore',
      },
    );
  }
}

function patchManagedAppIdentity({ infoPlistPath, execFileSync }) {
  for (const [key, value] of [
    ['CFBundleIdentifier', MANAGED_BUNDLE_ID],
    ['CFBundleDisplayName', MANAGED_BUNDLE_DISPLAY_NAME],
    ['CFBundleName', MANAGED_BUNDLE_DISPLAY_NAME],
  ]) {
    setPlistString({ infoPlistPath, key, value, execFileSync });
  }
}

function patchManagedHelperIdentity({ managedAppPath, execFileSync }) {
  for (const relativePath of MANAGED_HELPER_INFO_PLIST_RELATIVE_PATHS) {
    const infoPlistPath = path.join(managedAppPath, relativePath);
    if (!fs.existsSync(infoPlistPath)) {
      continue;
    }
    setPlistString({
      infoPlistPath,
      key: 'CFBundleIdentifier',
      value: MANAGED_HELPER_BUNDLE_ID,
      execFileSync,
    });
  }
}

function refreshLaunchServices({ managedAppPath, spawnSync }) {
  const now = new Date();
  try {
    fs.utimesSync(managedAppPath, now, now);
  } catch {}

  const lsregister =
    '/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister';
  if (fs.existsSync(lsregister)) {
    spawnSync(lsregister, ['-f', managedAppPath], { stdio: 'ignore' });
  }
}

function clearGatekeeperAttributes({ managedAppPath, execFileSync }) {
  for (const attribute of ['com.apple.quarantine', 'com.apple.provenance']) {
    try {
      execFileSync('/usr/bin/xattr', ['-dr', attribute, managedAppPath], {
        stdio: 'ignore',
      });
    } catch {}
  }
}

function removeCodeSigningDetritus({ managedAppPath, execFileSync }) {
  fs.rmSync(path.join(managedAppPath, 'Icon\r'), { force: true });
  try {
    execFileSync('/usr/bin/xattr', ['-d', 'com.apple.FinderInfo', managedAppPath], {
      stdio: 'ignore',
    });
  } catch {}
}

function signManagedCodeApp({
  paths = createManagedCodeAppPaths(),
  execFileSync = childProcess.execFileSync,
  spawnSync = childProcess.spawnSync,
} = {}) {
  if (!fs.existsSync(paths.managedAppPath)) {
    throw new Error(`Managed Code.app missing: ${paths.managedAppPath}`);
  }

  removeCodeSigningDetritus({ managedAppPath: paths.managedAppPath, execFileSync });
  clearGatekeeperAttributes({ managedAppPath: paths.managedAppPath, execFileSync });
  execFileSync(
    '/usr/bin/codesign',
    [
      '--force',
      '--deep',
      '--sign',
      '-',
      `--preserve-metadata=${MANAGED_CODE_SIGN_PRESERVE_METADATA}`,
      paths.managedAppPath,
    ],
    { stdio: 'inherit' },
  );
  clearGatekeeperAttributes({ managedAppPath: paths.managedAppPath, execFileSync });
  refreshLaunchServices({ managedAppPath: paths.managedAppPath, spawnSync });

  return { changed: true, reason: 'managed app signed' };
}

function ensureManagedCodeApp({
  paths = createManagedCodeAppPaths(),
  execFileSync = childProcess.execFileSync,
  spawnSync = childProcess.spawnSync,
  now = () => new Date(),
} = {}) {
  if (!fs.existsSync(paths.sourceAppPath)) {
    throw new Error(`Upstream Visual Studio Code app missing: ${paths.sourceAppPath}`);
  }

  const sourceInfo = readAppInfo(paths.sourceAppPath);
  if (!sourceInfo) {
    throw new Error(`Upstream Visual Studio Code Info.plist missing: ${paths.sourceAppPath}`);
  }

  const managedExists = fs.existsSync(paths.managedAppPath);
  const managedInfo = managedExists ? readAppInfo(paths.managedAppPath) : undefined;
  const marker = readManagedAppMarker(paths.markerPath);
  const decision = shouldRefreshManagedApp({
    sourceInfo,
    managedExists,
    managedInfo,
    marker,
  });

  if (!decision.refresh) {
    clearGatekeeperAttributes({ managedAppPath: paths.managedAppPath, execFileSync });
    return { changed: false, reason: decision.reason };
  }

  execFileSync('/bin/rm', ['-rf', paths.managedAppPath], { stdio: 'ignore' });
  execFileSync('/bin/cp', ['-R', paths.sourceAppPath, paths.managedAppPath], {
    stdio: 'ignore',
  });
  clearGatekeeperAttributes({ managedAppPath: paths.managedAppPath, execFileSync });

  patchManagedAppIdentity({
    infoPlistPath: paths.infoPlistPath,
    execFileSync,
  });
  patchManagedHelperIdentity({
    managedAppPath: paths.managedAppPath,
    execFileSync,
  });

  const refreshedAt = now().toISOString();
  const markerValue = buildManagedAppMarker({
    sourceAppPath: paths.sourceAppPath,
    managedAppPath: paths.managedAppPath,
    sourceInfo,
    refreshedAt,
  });

  fs.mkdirSync(path.dirname(paths.markerPath), { recursive: true });
  fs.writeFileSync(paths.markerPath, `${JSON.stringify(markerValue, null, 2)}\n`);
  refreshLaunchServices({ managedAppPath: paths.managedAppPath, spawnSync });

  return { changed: true, reason: decision.reason };
}

function checkManagedCodeApp({ paths = createManagedCodeAppPaths() } = {}) {
  if (!fs.existsSync(paths.sourceAppPath)) {
    return {
      ok: false,
      detail: `upstream Visual Studio Code app missing: ${paths.sourceAppPath}`,
    };
  }

  if (!fs.existsSync(paths.managedAppPath)) {
    return {
      ok: false,
      detail: `managed Code.app missing: ${paths.managedAppPath}`,
    };
  }

  const sourceInfo = readAppInfo(paths.sourceAppPath);
  const managedInfo = readAppInfo(paths.managedAppPath);
  const marker = readManagedAppMarker(paths.markerPath);
  const decision = shouldRefreshManagedApp({
    sourceInfo,
    managedExists: true,
    managedInfo,
    marker,
  });

  if (decision.refresh) {
    return {
      ok: false,
      detail: `managed Code.app stale: ${decision.reason}`,
    };
  }

  return {
    ok: true,
    detail: 'managed Code.app is current',
  };
}

module.exports = {
  CODEX_MANAGED_APP_MARKER_RELATIVE_PATH,
  MANAGED_CODE_SIGN_PRESERVE_METADATA,
  MANAGED_BUNDLE_DISPLAY_NAME,
  MANAGED_BUNDLE_ID,
  MANAGED_HELPER_BUNDLE_ID,
  buildManagedAppMarker,
  checkManagedCodeApp,
  createManagedCodeAppPaths,
  ensureManagedCodeApp,
  readAppInfo,
  readManagedAppMarker,
  signManagedCodeApp,
  shouldRefreshManagedApp,
};
