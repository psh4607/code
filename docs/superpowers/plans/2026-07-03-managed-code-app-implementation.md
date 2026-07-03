# Managed Code App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `npm run apply` create or refresh `/Applications/Code.app`, then apply all managed VS Code patches to that custom app while sharing existing VS Code user data.

**Architecture:** Add a small managed-app module that owns app-path resolution, source metadata, marker generation, copy/refresh, bundle identity checks, and final ad-hoc signing. Keep shared user settings in `hostConfig.js`, but retarget patch paths from the official app to the managed `Code.app`. Keep patch scripts environment-overridable for tests and manual recovery.

**Tech Stack:** Node.js CommonJS, macOS `.app` bundles, `Info.plist` edited through `/usr/libexec/PlistBuddy`, existing `node:test` tests, existing shell-driven patch scripts.

---

## File Structure

- Create `src/managedCodeApp.js`: path helpers, metadata readers, marker JSON, refresh decision, app copy, `com.seongho.Code` identity patching, helper identity patching, ad-hoc signing, and doctor status.
- Modify `src/hostConfig.js`: default paths should point patch targets at `/Applications/Code.app`; export managed-app checks and call them from `applyHostConfig`/`checkHostConfig`.
- Modify `scripts/apply-host-config.js`: ensure the managed app before running patch scripts.
- Add `scripts/sign-managed-code-app.js`: ad-hoc sign the final patched app after removing Finder custom icon detritus.
- Modify `scripts/patch-vscode-terminal-order.js`, `scripts/patch-vscode-ime-guard.js`, `scripts/patch-vscode-watermark.js`, `scripts/patch-vscode-icon.js`, `scripts/patch-vscode-dock-icon.js`: default to managed app paths.
- Modify `scripts/doctor.js`: no functional split needed if `checkHostConfig` reports the managed app.
- Modify `test/hostConfig.test.js`: add default-path, apply, and doctor checks for `Code.app`.
- Add `test/managedCodeApp.test.js`: unit-test marker generation, bundle identity patching, refresh decisions, copy command behavior, and status results.
- Modify `README.md` and `AGENTS.md`: describe the official upstream app vs managed `Code.app` model and update recovery commands.

---

### Task 1: Managed App Unit Tests

**Files:**
- Create: `src/managedCodeApp.js`
- Create: `test/managedCodeApp.test.js`

- [ ] **Step 1: Write failing tests for metadata and refresh decisions**

Create `test/managedCodeApp.test.js` with tests that require the new API:

```javascript
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
    '/tmp/Applications/Code.app/Contents/Resources/app/codex-managed-code-app.json',
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
```

- [ ] **Step 2: Run tests to verify RED**

Run: `node --test test/managedCodeApp.test.js`

Expected: FAIL with `Cannot find module '../src/managedCodeApp'`.

- [ ] **Step 3: Implement minimal metadata helpers**

Create `src/managedCodeApp.js` with constants, `createManagedCodeAppPaths`, `readAppInfo`, `buildManagedAppMarker`, `shouldRefreshManagedApp`, and stub `ensureManagedCodeApp`/`checkManagedCodeApp` exports. `ensureManagedCodeApp` can throw `not implemented` until Task 2 tests are added.

- [ ] **Step 4: Run tests to verify GREEN**

Run: `node --test test/managedCodeApp.test.js`

Expected: PASS for the metadata tests from Step 1.

- [ ] **Step 5: Commit**

Run:

```bash
git add src/managedCodeApp.js test/managedCodeApp.test.js
git commit -m "test: cover managed Code app metadata"
```

---

### Task 2: Managed App Copy and Identity

**Files:**
- Modify: `src/managedCodeApp.js`
- Modify: `test/managedCodeApp.test.js`

- [ ] **Step 1: Write failing tests for app copy, identity patching, marker writing, and status**

Append tests that use dependency injection:

```javascript
test('ensureManagedCodeApp copies upstream app, patches identity, and writes marker', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-managed-code-app-test-'));
  const sourceAppPath = path.join(tmpDir, 'Visual Studio Code.app');
  const managedAppPath = path.join(tmpDir, 'Code.app');
  makeApp(sourceAppPath);
  const calls = [];

  const result = ensureManagedCodeApp({
    paths: createManagedCodeAppPaths({ sourceAppPath, managedAppPath }),
    now: () => new Date('2026-07-03T00:00:00.000Z'),
    execFileSync: (command, args) => {
      calls.push([command, args]);
      if (command === '/bin/cp') {
        fs.cpSync(args[1], args[2], { recursive: true });
      }
    },
    spawnSync: () => ({ status: 0 }),
  });

  const markerPath = path.join(managedAppPath, CODEX_MANAGED_APP_MARKER_RELATIVE_PATH);
  const marker = JSON.parse(fs.readFileSync(markerPath, 'utf8'));

  assert.equal(result.changed, true);
  assert.equal(result.reason, 'managed app missing');
  assert.equal(readAppInfo(managedAppPath).bundleId, MANAGED_BUNDLE_ID);
  assert.equal(readAppInfo(managedAppPath).displayName, MANAGED_BUNDLE_DISPLAY_NAME);
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
    JSON.stringify(
      buildManagedAppMarker({
        sourceAppPath,
        managedAppPath,
        sourceInfo: readAppInfo(sourceAppPath),
        refreshedAt: '2026-07-03T00:00:00.000Z',
      }),
      null,
      2,
    ) + '\n',
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

  assert.deepEqual(checkManagedCodeApp({ paths }), {
    ok: false,
    detail: `managed Code.app missing: ${managedAppPath}`,
  });

  makeApp(sourceAppPath);
  ensureManagedCodeApp({
    paths,
    execFileSync: (command, args) => {
      if (command === '/bin/rm') fs.rmSync(args[1], { recursive: true, force: true });
      if (command === '/bin/cp') fs.cpSync(args[1], args[2], { recursive: true });
    },
    spawnSync: () => ({ status: 0 }),
  });

  assert.deepEqual(checkManagedCodeApp({ paths }), {
    ok: true,
    detail: 'managed Code.app is current',
  });
});
```

- [ ] **Step 2: Run tests to verify RED**

Run: `node --test test/managedCodeApp.test.js`

Expected: FAIL because `ensureManagedCodeApp` still throws or does not patch identity.

- [ ] **Step 3: Implement copy, identity patching, marker writing, and checks**

Implement `ensureManagedCodeApp` using `/bin/rm -rf`, `/bin/cp -R`, `/usr/libexec/PlistBuddy`, marker JSON writes, and optional injected `execFileSync`/`spawnSync`. Implement `checkManagedCodeApp` with clear missing/stale/current details.

- [ ] **Step 4: Run tests to verify GREEN**

Run: `node --test test/managedCodeApp.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add src/managedCodeApp.js test/managedCodeApp.test.js
git commit -m "feat: manage custom Code app bundle"
```

---

### Task 3: Host Config Integration

**Files:**
- Modify: `src/hostConfig.js`
- Modify: `scripts/apply-host-config.js`
- Modify: `test/hostConfig.test.js`

- [ ] **Step 1: Write failing tests for default managed paths and apply/doctor integration**

Add tests to `test/hostConfig.test.js` that assert:

```javascript
const { applyHostConfig, createDefaultPaths } = require('../src/hostConfig');

test('createDefaultPaths targets the managed Code app for bundle patches', () => {
  const paths = createDefaultPaths({ home: '/tmp/home', projectRoot: '/tmp/project' });

  assert.equal(paths.vscodeSourceAppPath, '/Applications/Visual Studio Code.app');
  assert.equal(paths.vscodeAppPath, '/Applications/Code.app');
  assert.equal(
    paths.workbenchPath,
    '/Applications/Code.app/Contents/Resources/app/out/vs/workbench/workbench.desktop.main.js',
  );
  assert.equal(paths.vscodeIconPath, '/Applications/Code.app/Contents/Resources/Code.icns');
});

test('applyHostConfig ensures the managed Code app before shared host config', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-host-config-test-'));
  const home = path.join(tmpDir, 'home');
  const sourceAppPath = path.join(tmpDir, 'Visual Studio Code.app');
  const managedAppPath = path.join(tmpDir, 'Code.app');
  const projectRoot = path.join(tmpDir, 'project');
  makeApp(sourceAppPath);
  fs.mkdirSync(projectRoot, { recursive: true });

  const results = applyHostConfig({
    paths: createDefaultPaths({
      home,
      projectRoot,
      applicationsDir: tmpDir,
    }),
    ensureManagedCodeApp: () => ({ changed: true, reason: 'managed app missing' }),
  });

  assert.deepEqual(results[0], {
    id: 'managedCodeApp',
    changed: true,
    detail: 'managed app missing',
  });
});
```

- [ ] **Step 2: Run tests to verify RED**

Run: `node --test test/hostConfig.test.js`

Expected: FAIL because default paths still target `/Applications/Visual Studio Code.app` and `applyHostConfig` has no managed-app result.

- [ ] **Step 3: Wire managed paths and apply result**

Update `createDefaultPaths` to accept `applicationsDir`, `vscodeSourceAppPath`, and `vscodeAppPath`, default patch paths to `/Applications/Code.app`, add `managedCodeAppPaths`, call injected/default `ensureManagedCodeApp` first in `applyHostConfig`, and add `managedCodeApp` status in `checkHostConfig`.

- [ ] **Step 4: Run tests to verify GREEN**

Run: `node --test test/hostConfig.test.js test/managedCodeApp.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add src/hostConfig.js scripts/apply-host-config.js test/hostConfig.test.js
git commit -m "feat: route host patches to managed Code app"
```

---

### Task 4: Patch Script Defaults

**Files:**
- Modify: `scripts/patch-vscode-terminal-order.js`
- Modify: `scripts/patch-vscode-ime-guard.js`
- Modify: `scripts/patch-vscode-watermark.js`
- Modify: `scripts/patch-vscode-icon.js`
- Modify: `scripts/patch-vscode-dock-icon.js`
- Modify: patch-script tests as needed

- [ ] **Step 1: Write failing tests where possible**

For scripts with tests that assert output paths or missing-target errors, adjust or add expectations so the default path contains `/Applications/Code.app`. Keep existing environment override tests unchanged.

- [ ] **Step 2: Run focused patch-script tests to verify RED**

Run:

```bash
node --test test/patchVscodeIcon.test.js test/patchVscodeDockIcon.test.js test/patchVscodeWatermark.test.js test/patchVscodeTerminalOrder.test.js test/patchVscodeImeGuard.test.js
```

Expected: FAIL only in tests that now expect managed defaults.

- [ ] **Step 3: Update defaults**

Replace hard-coded default app paths in patch scripts with `/Applications/Code.app/...`, preserving every `VSCODE_*` environment override.

- [ ] **Step 4: Run focused tests to verify GREEN**

Run the same focused `node --test ...` command.

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add scripts/patch-vscode-*.js test/patchVscode*.test.js
git commit -m "chore: default patch scripts to managed Code app"
```

---

### Task 5: Documentation and Full Verification

**Files:**
- Modify: `README.md`
- Modify: `AGENTS.md`
- Modify: `docs/superpowers/plans/2026-07-03-managed-code-app-implementation.md`

- [ ] **Step 1: Update docs**

Document that `/Applications/Visual Studio Code.app` is the upstream source and `/Applications/Code.app` is the managed runtime app. Explain that user data remains shared and that `npm run apply` creates/refreshes `Code.app`.

- [ ] **Step 2: Run full test suite**

Run: `npm test`

Expected: all tests pass.

- [ ] **Step 3: Run read-only doctor**

Run: `npm run doctor`

Expected before first real apply: it may report missing `managedCodeApp` if `/Applications/Code.app` has not yet been created. Capture the exact output in the final response.

- [ ] **Step 4: Run real apply only if intended**

Run: `npm run apply`

Expected: create or refresh `/Applications/Code.app`, patch the managed bundle, and report all doctor statuses as ok. If `Code.app` is running or locked, stop and report that it must be quit before retrying.

- [ ] **Step 5: Commit**

Run:

```bash
git add README.md AGENTS.md docs/superpowers/plans/2026-07-03-managed-code-app-implementation.md
git commit -m "docs: describe managed Code app workflow"
```

---

## Self-Review

Spec coverage:
- Managed `Code.app` creation and refresh: Tasks 1-3.
- Display identity and signed bundle id preservation: Tasks 1-2, plus launch smoke verification.
- Shared user data: Task 3 keeps host settings paths unchanged and Task 5 documents it.
- Patch scripts default to managed app: Task 4.
- Doctor and apply integration: Tasks 2-3 and Task 5.
- Error handling for missing upstream and stale state: Tasks 2-3.

Placeholder scan: no TBD/TODO/implement-later placeholders remain.

Type consistency:
- `createManagedCodeAppPaths`, `ensureManagedCodeApp`, `checkManagedCodeApp`, `readAppInfo`, `buildManagedAppMarker`, and `shouldRefreshManagedApp` are used consistently across tests and implementation tasks.
