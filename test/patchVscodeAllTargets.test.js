const assert = require('node:assert/strict');
const test = require('node:test');
const {
  buildPatchSteps,
  createDefaultPatchTargets,
} = require('../scripts/patch-vscode-all-targets');

test('createDefaultPatchTargets includes managed Code and upstream Visual Studio Code', () => {
  const targets = createDefaultPatchTargets({
    projectRoot: '/tmp/project',
    sourceAppPath: '/tmp/Applications/Visual Studio Code.app',
    managedAppPath: '/tmp/Applications/Code.app',
  });

  assert.deepEqual(
    targets.map((target) => [target.id, target.appPath]),
    [
      ['managed', '/tmp/Applications/Code.app'],
      ['upstream', '/tmp/Applications/Visual Studio Code.app'],
    ],
  );
  assert.equal(
    targets[0].workbenchPath,
    '/tmp/Applications/Code.app/Contents/Resources/app/out/vs/workbench/workbench.desktop.main.js',
  );
  assert.equal(
    targets[1].workbenchPath,
    '/tmp/Applications/Visual Studio Code.app/Contents/Resources/app/out/vs/workbench/workbench.desktop.main.js',
  );
  assert.equal(
    targets[1].iconPath,
    '/tmp/Applications/Visual Studio Code.app/Contents/Resources/Code.icns',
  );
});

test('buildPatchSteps passes target-specific env to every bundle patch and signer', () => {
  const [target] = createDefaultPatchTargets({
    projectRoot: '/tmp/project',
    sourceAppPath: '/tmp/Applications/Visual Studio Code.app',
    managedAppPath: '/tmp/Applications/Code.app',
  });

  const steps = buildPatchSteps(target);

  assert.deepEqual(
    steps.map((step) => step.script),
    [
      'patch-vscode-terminal-order.js',
      'patch-vscode-ime-guard.js',
      'patch-vscode-terminal-tabs-title-breaks.js',
      'patch-vscode-icon.js',
      'patch-vscode-dock-icon.js',
      'patch-vscode-watermark.js',
      'patch-vscode-opaque-overlays.js',
      'patch-vscode-titlebar-center.js',
      'patch-vscode-terminal-tabs-layout.js',
      'sign-vscode-app.js',
    ],
  );
  assert.equal(steps[0].env.VSCODE_WORKBENCH_MAIN, target.workbenchPath);
  assert.equal(steps[2].env.VSCODE_WORKBENCH_MAIN, target.workbenchPath);
  assert.equal(steps[3].env.VSCODE_ICON_PATH, target.iconPath);
  assert.equal(steps[4].env.VSCODE_MAIN_PATH, target.mainPath);
  assert.equal(steps[4].env.VSCODE_DOCK_ICON_PNG_PATH, target.dockIconPngPath);
  assert.equal(steps[5].env.VSCODE_WORKBENCH_CSS, target.workbenchCssPath);
  assert.equal(steps[6].env.VSCODE_WORKBENCH_CSS, target.workbenchCssPath);
  assert.equal(steps[7].env.VSCODE_WORKBENCH_CSS, target.workbenchCssPath);
  assert.equal(steps[9].env.VSCODE_SIGN_APP_PATH, target.appPath);
});

test('buildPatchSteps can run one patch kind plus signing for both target types', () => {
  const [target] = createDefaultPatchTargets({
    projectRoot: '/tmp/project',
    sourceAppPath: '/tmp/Applications/Visual Studio Code.app',
    managedAppPath: '/tmp/Applications/Code.app',
  });

  const steps = buildPatchSteps(target, {
    onlyScripts: ['patch-vscode-ime-guard.js', 'sign-vscode-app.js'],
  });

  assert.deepEqual(
    steps.map((step) => step.script),
    ['patch-vscode-ime-guard.js', 'sign-vscode-app.js'],
  );
});
