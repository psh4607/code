const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const projectRoot = path.resolve(__dirname, '..');

const expectedDefaults = [
  [
    'scripts/patch-vscode-terminal-order.js',
    'VSCODE_WORKBENCH_MAIN',
    '/Applications/Code.app/Contents/Resources/app/out/vs/workbench/workbench.desktop.main.js',
  ],
  [
    'scripts/patch-vscode-ime-guard.js',
    'VSCODE_WORKBENCH_MAIN',
    '/Applications/Code.app/Contents/Resources/app/out/vs/workbench/workbench.desktop.main.js',
  ],
  [
    'scripts/patch-vscode-watermark.js',
    'VSCODE_WORKBENCH_CSS',
    '/Applications/Code.app/Contents/Resources/app/out/vs/workbench/workbench.desktop.main.css',
  ],
  [
    'scripts/patch-vscode-terminal-tabs-layout.js',
    'VSCODE_WORKBENCH_CSS',
    '/Applications/Code.app/Contents/Resources/app/out/vs/workbench/workbench.desktop.main.css',
  ],
  [
    'scripts/patch-vscode-terminal-tabs-title-breaks.js',
    'VSCODE_WORKBENCH_MAIN',
    '/Applications/Code.app/Contents/Resources/app/out/vs/workbench/workbench.desktop.main.js',
  ],
  [
    'scripts/patch-vscode-icon.js',
    'VSCODE_ICON_PATH',
    '/Applications/Code.app/Contents/Resources/Code.icns',
  ],
  [
    'scripts/patch-vscode-dock-icon.js',
    'VSCODE_MAIN_PATH',
    '/Applications/Code.app/Contents/Resources/app/out/main.js',
  ],
  [
    'scripts/patch-vscode-dock-icon.js',
    'VSCODE_DOCK_ICON_PNG_PATH',
    '/Applications/Code.app/Contents/Resources/codex-warp-glass-sky.png',
  ],
];

test('patch script default targets use the managed Code app', () => {
  for (const [relativePath, envName, defaultPath] of expectedDefaults) {
    const source = fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');

    assert.equal(source.includes(`process.env.${envName}`), true, relativePath);
    assert.equal(source.includes(defaultPath), true, relativePath);
  }
});
