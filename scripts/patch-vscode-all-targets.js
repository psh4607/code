#!/usr/bin/env node

const childProcess = require('node:child_process');
const path = require('node:path');
const { createManagedCodeAppPaths } = require('../src/managedCodeApp');

function bundlePaths(appPath) {
  return {
    appPath,
    workbenchPath: path.join(
      appPath,
      'Contents',
      'Resources',
      'app',
      'out',
      'vs',
      'workbench',
      'workbench.desktop.main.js',
    ),
    workbenchCssPath: path.join(
      appPath,
      'Contents',
      'Resources',
      'app',
      'out',
      'vs',
      'workbench',
      'workbench.desktop.main.css',
    ),
    mainPath: path.join(appPath, 'Contents', 'Resources', 'app', 'out', 'main.js'),
    iconPath: path.join(appPath, 'Contents', 'Resources', 'Code.icns'),
    dockIconPngPath: path.join(appPath, 'Contents', 'Resources', 'codex-warp-glass-sky.png'),
  };
}

function createDefaultPatchTargets({
  applicationsDir,
  sourceAppPath,
  managedAppPath,
} = {}) {
  const paths = createManagedCodeAppPaths({
    applicationsDir,
    sourceAppPath,
    managedAppPath,
  });
  const targetConfigs = [
    ['managed', paths.managedAppPath],
    ['upstream', paths.sourceAppPath],
  ];
  const seen = new Set();
  const targets = [];

  for (const [id, appPath] of targetConfigs) {
    if (seen.has(appPath)) {
      continue;
    }
    seen.add(appPath);
    targets.push({
      id,
      ...bundlePaths(appPath),
    });
  }

  return targets;
}

function allPatchSteps(target) {
  return [
    {
      script: 'patch-vscode-terminal-order.js',
      env: {
        VSCODE_WORKBENCH_MAIN: target.workbenchPath,
      },
    },
    {
      script: 'patch-vscode-terminal-attach-by-pid.js',
      env: {
        VSCODE_WORKBENCH_MAIN: target.workbenchPath,
      },
    },
    {
      script: 'patch-vscode-ime-guard.js',
      env: {
        VSCODE_WORKBENCH_MAIN: target.workbenchPath,
      },
    },
    {
      script: 'patch-vscode-terminal-tabs-title-breaks.js',
      env: {
        VSCODE_WORKBENCH_MAIN: target.workbenchPath,
      },
    },
    {
      script: 'patch-vscode-sticky-notifications.js',
      env: {
        VSCODE_WORKBENCH_MAIN: target.workbenchPath,
      },
    },
    {
      script: 'patch-vscode-icon.js',
      env: {
        VSCODE_ICON_PATH: target.iconPath,
      },
    },
    {
      script: 'patch-vscode-dock-icon.js',
      env: {
        VSCODE_MAIN_PATH: target.mainPath,
        VSCODE_DOCK_ICON_PNG_PATH: target.dockIconPngPath,
      },
    },
    {
      script: 'patch-vscode-watermark.js',
      env: {
        VSCODE_WORKBENCH_CSS: target.workbenchCssPath,
      },
    },
    {
      script: 'patch-vscode-opaque-overlays.js',
      env: {
        VSCODE_WORKBENCH_CSS: target.workbenchCssPath,
      },
    },
    {
      script: 'patch-vscode-titlebar-center.js',
      env: {
        VSCODE_WORKBENCH_CSS: target.workbenchCssPath,
      },
    },
    {
      script: 'patch-vscode-terminal-tabs-layout.js',
      env: {
        VSCODE_WORKBENCH_CSS: target.workbenchCssPath,
      },
    },
    {
      script: 'sign-vscode-app.js',
      env: {
        VSCODE_SIGN_APP_PATH: target.appPath,
      },
    },
  ];
}

function buildPatchSteps(target, { onlyScripts = [] } = {}) {
  const steps = allPatchSteps(target);
  if (onlyScripts.length === 0) {
    return steps;
  }

  const only = new Set(onlyScripts);
  return steps.filter((step) => only.has(step.script));
}

function parseArgs(argv) {
  const onlyScripts = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg !== '--only') {
      throw new Error(`Unknown argument: ${arg}`);
    }

    const script = argv[index + 1];
    if (!script) {
      throw new Error('--only requires a script name');
    }
    onlyScripts.push(script);
    index += 1;
  }

  return { onlyScripts };
}

function runPatchTargets({
  targets = createDefaultPatchTargets(),
  onlyScripts = [],
  execFileSync = childProcess.execFileSync,
  scriptDir = __dirname,
  stdout = process.stdout,
} = {}) {
  for (const target of targets) {
    stdout.write(`\n== Patching ${target.id}: ${target.appPath}\n`);

    for (const step of buildPatchSteps(target, { onlyScripts })) {
      execFileSync(process.execPath, [path.join(scriptDir, step.script)], {
        env: {
          ...process.env,
          ...step.env,
        },
        stdio: 'inherit',
      });
    }
  }
}

if (require.main === module) {
  runPatchTargets(parseArgs(process.argv.slice(2)));
}

module.exports = {
  buildPatchSteps,
  createDefaultPatchTargets,
  runPatchTargets,
};
