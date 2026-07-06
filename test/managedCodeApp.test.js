const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
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
  signManagedCodeApp,
  shouldRefreshManagedApp,
} = require('../src/managedCodeApp');

const ensureManagedCodeAppScriptPath = path.join(
  __dirname,
  '..',
  'scripts',
  'ensure-managed-code-app.js',
);

function writeInfoPlist(infoPlistPath, info = {}) {
  fs.mkdirSync(path.dirname(infoPlistPath), { recursive: true });
  fs.writeFileSync(
    infoPlistPath,
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

function makeApp(appPath, info = {}) {
  fs.mkdirSync(path.join(appPath, 'Contents', 'Resources', 'app'), { recursive: true });
  writeInfoPlist(path.join(appPath, 'Contents', 'Info.plist'), info);

  for (const helperName of [
    'Code Helper.app',
    'Code Helper (GPU).app',
    'Code Helper (Plugin).app',
    'Code Helper (Renderer).app',
  ]) {
    writeInfoPlist(path.join(appPath, 'Contents', 'Frameworks', helperName, 'Contents', 'Info.plist'), {
      bundleId: info.helperBundleId || 'com.microsoft.VSCode.helper',
      displayName: helperName.replace(/\.app$/, ''),
      name: helperName.replace(/\.app$/, ''),
    });
  }
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

test('managed app uses a separate local bundle id and helper id', () => {
  assert.equal(MANAGED_BUNDLE_ID, 'com.seongho.Code');
  assert.equal(MANAGED_HELPER_BUNDLE_ID, 'com.seongho.Code.helper');
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
        managedBundleId: 'com.microsoft.VSCode',
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
  const helperInfos = [
    'Code Helper.app',
    'Code Helper (GPU).app',
    'Code Helper (Plugin).app',
    'Code Helper (Renderer).app',
  ].map((helperName) =>
    readAppInfo(path.join(managedAppPath, 'Contents', 'Frameworks', helperName)),
  );

  assert.equal(result.changed, true);
  assert.equal(result.reason, 'managed app missing');
  assert.equal(managedInfo.bundleId, MANAGED_BUNDLE_ID);
  assert.equal(managedInfo.displayName, MANAGED_BUNDLE_DISPLAY_NAME);
  assert.equal(managedInfo.name, MANAGED_BUNDLE_DISPLAY_NAME);
  assert.deepEqual(
    helperInfos.map((helperInfo) => helperInfo.bundleId),
    [
      MANAGED_HELPER_BUNDLE_ID,
      MANAGED_HELPER_BUNDLE_ID,
      MANAGED_HELPER_BUNDLE_ID,
      MANAGED_HELPER_BUNDLE_ID,
    ],
  );
  assert.equal(marker.sourceShortVersion, '1.127.0');
  assert.deepEqual(calls[0], ['/bin/rm', ['-rf', managedAppPath]]);
  assert.deepEqual(calls[1], ['/bin/cp', ['-R', sourceAppPath, managedAppPath]]);
  assert.deepEqual(
    calls.filter(([command]) => command === '/usr/bin/xattr'),
    [
      ['/usr/bin/xattr', ['-dr', 'com.apple.quarantine', managedAppPath]],
      ['/usr/bin/xattr', ['-dr', 'com.apple.provenance', managedAppPath]],
    ],
  );
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
  assert.deepEqual(calls, [
    ['/usr/bin/xattr', ['-dr', 'com.apple.quarantine', managedAppPath]],
    ['/usr/bin/xattr', ['-dr', 'com.apple.provenance', managedAppPath]],
  ]);
});

test('signManagedCodeApp removes Finder custom icon detritus and ad-hoc signs', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-managed-code-app-test-'));
  const managedAppPath = path.join(tmpDir, 'Code.app');
  const paths = createManagedCodeAppPaths({
    sourceAppPath: path.join(tmpDir, 'Visual Studio Code.app'),
    managedAppPath,
  });
  makeApp(managedAppPath, {
    bundleId: MANAGED_BUNDLE_ID,
    displayName: MANAGED_BUNDLE_DISPLAY_NAME,
    name: MANAGED_BUNDLE_DISPLAY_NAME,
    helperBundleId: MANAGED_HELPER_BUNDLE_ID,
  });
  fs.writeFileSync(path.join(managedAppPath, 'Icon\r'), Buffer.from('custom-icon'));
  const execCalls = [];
  const spawnCalls = [];

  const result = signManagedCodeApp({
    paths,
    execFileSync: (command, args) => {
      execCalls.push([command, args]);
      return Buffer.from('');
    },
    spawnSync: (command, args) => {
      spawnCalls.push([command, args]);
      return { status: 0 };
    },
  });

  assert.equal(result.changed, true);
  assert.equal(fs.existsSync(path.join(managedAppPath, 'Icon\r')), false);
  assert.deepEqual(execCalls, [
    ['/usr/bin/xattr', ['-d', 'com.apple.FinderInfo', managedAppPath]],
    ['/usr/bin/xattr', ['-dr', 'com.apple.quarantine', managedAppPath]],
    ['/usr/bin/xattr', ['-dr', 'com.apple.provenance', managedAppPath]],
    [
      '/usr/bin/codesign',
      [
        '--force',
        '--deep',
        '--sign',
        '-',
        `--preserve-metadata=${MANAGED_CODE_SIGN_PRESERVE_METADATA}`,
        managedAppPath,
      ],
    ],
    ['/usr/bin/xattr', ['-dr', 'com.apple.quarantine', managedAppPath]],
    ['/usr/bin/xattr', ['-dr', 'com.apple.provenance', managedAppPath]],
  ]);
  assert.equal(spawnCalls.length, 1);
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

test('package exposes a standalone managed Code app ensure script', () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));

  assert.equal(packageJson.scripts['ensure:code-app'], 'node scripts/ensure-managed-code-app.js');
});

test('ensure-managed-code-app script creates only the managed app bundle', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-managed-code-app-script-test-'));
  const sourceAppPath = path.join(tmpDir, 'Visual Studio Code.app');
  const managedAppPath = path.join(tmpDir, 'Code.app');
  makeApp(sourceAppPath);

  const result = childProcess.spawnSync(process.execPath, [ensureManagedCodeAppScriptPath], {
    env: {
      ...process.env,
      VSCODE_SOURCE_APP_PATH: sourceAppPath,
      VSCODE_APP_PATH: managedAppPath,
    },
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /updated managedCodeApp: managed app missing/);
  assert.doesNotMatch(result.stdout, /== Patching /);
  assert.equal(readAppInfo(managedAppPath).bundleId, MANAGED_BUNDLE_ID);
  assert.equal(fs.existsSync(path.join(managedAppPath, 'Contents', 'Resources', 'Code.icns')), false);
});
