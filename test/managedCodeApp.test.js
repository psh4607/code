const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  CODEX_MANAGED_APP_MARKER_RELATIVE_PATH,
  MANAGED_BUNDLE_DISPLAY_NAME,
  MANAGED_BUNDLE_ID,
  buildManagedAppMarker,
  createManagedCodeAppPaths,
  shouldRefreshManagedApp,
} = require('../src/managedCodeApp');

function makeApp(appPath, info = {}) {
  fs.mkdirSync(path.join(appPath, 'Contents', 'Resources', 'app'), { recursive: true });
  fs.writeFileSync(
    path.join(appPath, 'Contents', 'Info.plist'),
    [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
      '<plist version="1.0">',
      '<dict>',
      '<key>CFBundleDisplayName</key>',
      `<string>${info.displayName || 'Visual Studio Code'}</string>`,
      '<key>CFBundleIdentifier</key>',
      `<string>${info.bundleId || 'com.microsoft.VSCode'}</string>`,
      '<key>CFBundleName</key>',
      `<string>${info.name || 'Visual Studio Code'}</string>`,
      '<key>CFBundleShortVersionString</key>',
      `<string>${info.version || '1.127.0'}</string>`,
      '<key>CFBundleVersion</key>',
      `<string>${info.build || '1'}</string>`,
      '</dict>',
      '</plist>',
      '',
    ].join('\n'),
  );
}

test('createManagedCodeAppPaths separates upstream Visual Studio Code from managed Code app', () => {
  const paths = createManagedCodeAppPaths({ applicationsDir: '/tmp/Applications' });

  assert.equal(paths.sourceAppPath, '/tmp/Applications/Visual Studio Code.app');
  assert.equal(paths.managedAppPath, '/tmp/Applications/Code.app');
  assert.equal(
    paths.markerPath,
    `/tmp/Applications/Code.app/${CODEX_MANAGED_APP_MARKER_RELATIVE_PATH}`,
  );
});

test('buildManagedAppMarker records source and managed identity', () => {
  const marker = buildManagedAppMarker({
    sourceAppPath: '/Applications/Visual Studio Code.app',
    managedAppPath: '/Applications/Code.app',
    sourceInfo: {
      bundleId: 'com.microsoft.VSCode',
      displayName: 'Code',
      name: 'Code',
      shortVersion: '1.127.0',
      bundleVersion: 'abc',
    },
    refreshedAt: '2026-07-03T00:00:00.000Z',
  });

  assert.equal(marker.sourceAppPath, '/Applications/Visual Studio Code.app');
  assert.equal(marker.managedAppPath, '/Applications/Code.app');
  assert.equal(marker.sourceBundleId, 'com.microsoft.VSCode');
  assert.equal(marker.sourceShortVersion, '1.127.0');
  assert.equal(marker.sourceBundleVersion, 'abc');
  assert.equal(marker.managedBundleId, MANAGED_BUNDLE_ID);
  assert.equal(marker.managedDisplayName, MANAGED_BUNDLE_DISPLAY_NAME);
});

test('shouldRefreshManagedApp refreshes missing, stale, or wrong-identity managed apps', () => {
  const sourceInfo = {
    bundleId: 'com.microsoft.VSCode',
    displayName: 'Code',
    name: 'Code',
    shortVersion: '1.127.0',
    bundleVersion: 'abc',
  };

  assert.deepEqual(shouldRefreshManagedApp({ sourceInfo, managedExists: false }), {
    refresh: true,
    reason: 'managed app missing',
  });

  assert.deepEqual(
    shouldRefreshManagedApp({
      sourceInfo,
      managedExists: true,
      managedInfo: { bundleId: MANAGED_BUNDLE_ID, displayName: 'Code', name: 'Code' },
      marker: { sourceShortVersion: '1.126.0', sourceBundleVersion: 'abc' },
    }),
    { refresh: true, reason: 'upstream app version changed' },
  );

  assert.deepEqual(
    shouldRefreshManagedApp({
      sourceInfo,
      managedExists: true,
      managedInfo: { bundleId: 'com.microsoft.VSCode', displayName: 'Code', name: 'Code' },
      marker: { sourceShortVersion: '1.127.0', sourceBundleVersion: 'abc' },
    }),
    { refresh: true, reason: 'managed app identity drifted' },
  );

  assert.deepEqual(
    shouldRefreshManagedApp({
      sourceInfo,
      managedExists: true,
      managedInfo: { bundleId: MANAGED_BUNDLE_ID, displayName: 'Code', name: 'Code' },
      marker: { sourceShortVersion: '1.127.0', sourceBundleVersion: 'abc' },
    }),
    { refresh: false, reason: 'managed app current' },
  );
});

module.exports = {
  makeApp,
};
