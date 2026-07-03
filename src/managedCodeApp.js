const childProcess = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_APPLICATIONS_DIR = '/Applications';
const SOURCE_APP_NAME = 'Visual Studio Code.app';
const MANAGED_APP_NAME = 'Code.app';
const MANAGED_BUNDLE_ID = 'com.seongho.Code';
const MANAGED_BUNDLE_DISPLAY_NAME = 'Code';
const CODEX_MANAGED_APP_MARKER_RELATIVE_PATH =
  'Contents/Resources/app/codex-managed-code-app.json';

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

  if (
    !marker ||
    marker.sourceShortVersion !== (sourceInfo?.shortVersion || '') ||
    marker.sourceBundleVersion !== (sourceInfo?.bundleVersion || '')
  ) {
    return { refresh: true, reason: 'upstream app version changed' };
  }

  return { refresh: false, reason: 'managed app current' };
}

function ensureManagedCodeApp() {
  throw new Error('ensureManagedCodeApp not implemented');
}

function checkManagedCodeApp() {
  throw new Error('checkManagedCodeApp not implemented');
}

module.exports = {
  CODEX_MANAGED_APP_MARKER_RELATIVE_PATH,
  MANAGED_BUNDLE_DISPLAY_NAME,
  MANAGED_BUNDLE_ID,
  buildManagedAppMarker,
  checkManagedCodeApp,
  createManagedCodeAppPaths,
  ensureManagedCodeApp,
  readAppInfo,
  shouldRefreshManagedApp,
};
