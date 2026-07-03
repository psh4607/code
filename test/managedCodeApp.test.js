const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  CODEX_MANAGED_APP_MARKER_RELATIVE_PATH,
  MANAGED_BUNDLE_DISPLAY_NAME,
  MANAGED_BUNDLE_ID,
  buildManagedAppMarker,
  checkManagedCodeApp,
  createManagedCodeAppPaths,
  ensureManagedCodeApp,
  readAppInfo,
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

test('managed app keeps the Microsoft bundle id for signed Electron launch compatibility', () => {
  assert.equal(MANAGED_BUNDLE_ID, 'com.microsoft.VSCode');
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
      managedInfo: { bundleId: 'com.example.BrokenCode', displayName: 'Code', name: 'Code' },
      marker: { sourceShortVersion: '1.127.0', sourceBundleVersion: 'abc' },
    }),
    { refresh: true, reason: 'managed app identity drifted' },
  );

  assert.deepEqual(
    shouldRefreshManagedApp({
      sourceInfo,
      managedExists: true,
      managedInfo: { bundleId: MANAGED_BUNDLE_ID, displayName: 'Code', name: 'Code' },
      marker: {
        managedBundleId: 'com.seongho.Code',
        sourceShortVersion: '1.127.0',
        sourceBundleVersion: 'abc',
      },
    }),
    { refresh: true, reason: 'managed app identity marker drifted' },
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

test('ensureManagedCodeApp copies upstream app, patches identity, and writes marker', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-managed-code-app-test-'));
  const sourceAppPath = path.join(tmpDir, 'Visual Studio Code.app');
  const managedAppPath = path.join(tmpDir, 'Code.app');
  makeApp(sourceAppPath);
  const calls = [];

  const result = ensureManagedCodeApp({
    paths: createManagedCodeAppPaths({ sourceAppPath, managedAppPath }),
    now: () => new Date('2026-07-03T00:00:00.000Z'),
    execFileSync: (command, args, options) => {
      calls.push([command, args]);
      return childProcess.execFileSync(command, args, options);
    },
    spawnSync: () => ({ status: 0 }),
  });

  const markerPath = path.join(managedAppPath, CODEX_MANAGED_APP_MARKER_RELATIVE_PATH);
  const marker = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
  const managedInfo = readAppInfo(managedAppPath);

  assert.equal(result.changed, true);
  assert.equal(result.reason, 'managed app missing');
  assert.equal(managedInfo.bundleId, MANAGED_BUNDLE_ID);
  assert.equal(managedInfo.displayName, MANAGED_BUNDLE_DISPLAY_NAME);
  assert.equal(managedInfo.name, MANAGED_BUNDLE_DISPLAY_NAME);
  assert.equal(marker.sourceShortVersion, '1.127.0');
  assert.deepEqual(calls[0], ['/bin/rm', ['-rf', managedAppPath]]);
  assert.deepEqual(calls[1], ['/bin/cp', ['-R', sourceAppPath, managedAppPath]]);
});

test('ensureManagedCodeApp is idempotent when marker and identity are current', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-managed-code-app-test-'));
  const sourceAppPath = path.join(tmpDir, 'Visual Studio Code.app');
  const managedAppPath = path.join(tmpDir, 'Code.app');
  makeApp(sourceAppPath);
  makeApp(managedAppPath, {
    bundleId: MANAGED_BUNDLE_ID,
    displayName: MANAGED_BUNDLE_DISPLAY_NAME,
    name: MANAGED_BUNDLE_DISPLAY_NAME,
  });
  fs.writeFileSync(
    path.join(managedAppPath, CODEX_MANAGED_APP_MARKER_RELATIVE_PATH),
    `${JSON.stringify(
      buildManagedAppMarker({
        sourceAppPath,
        managedAppPath,
        sourceInfo: readAppInfo(sourceAppPath),
        refreshedAt: '2026-07-03T00:00:00.000Z',
      }),
      null,
      2,
    )}\n`,
  );
  const calls = [];

  const result = ensureManagedCodeApp({
    paths: createManagedCodeAppPaths({ sourceAppPath, managedAppPath }),
    execFileSync: (command, args) => calls.push([command, args]),
    spawnSync: () => ({ status: 0 }),
  });

  assert.equal(result.changed, false);
  assert.equal(result.reason, 'managed app current');
  assert.deepEqual(calls, []);
});

test('checkManagedCodeApp reports missing and current managed app states', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-managed-code-app-test-'));
  const sourceAppPath = path.join(tmpDir, 'Visual Studio Code.app');
  const managedAppPath = path.join(tmpDir, 'Code.app');
  const paths = createManagedCodeAppPaths({ sourceAppPath, managedAppPath });
  makeApp(sourceAppPath);

  assert.deepEqual(checkManagedCodeApp({ paths }), {
    ok: false,
    detail: `managed Code.app missing: ${managedAppPath}`,
  });

  ensureManagedCodeApp({
    paths,
    execFileSync: (command, args, options) => childProcess.execFileSync(command, args, options),
    spawnSync: () => ({ status: 0 }),
  });

  assert.deepEqual(checkManagedCodeApp({ paths }), {
    ok: true,
    detail: 'managed Code.app is current',
  });
});
