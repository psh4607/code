#!/usr/bin/env node

const childProcess = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const sourcePath =
  process.env.CODEX_VSCODE_ICON_SOURCE || path.join(projectRoot, 'assets', 'warp-glass-sky.icns');
const pngSourcePath =
  process.env.CODEX_VSCODE_ICON_PNG_SOURCE || path.join(projectRoot, 'assets', 'warp-glass-sky.png');
const targetPath =
  process.env.VSCODE_ICON_PATH ||
  '/Applications/Code.app/Contents/Resources/Code.icns';
const enableFinderCustomIcon =
  process.env.CODEX_VSCODE_ICON_ENABLE_FINDER_CUSTOM_ICON === '1' &&
  process.env.CODEX_VSCODE_ICON_SKIP_FINDER_CUSTOM_ICON !== '1';

function timestamp() {
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-');
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function getAppBundlePath(iconPath) {
  const appMarker = '.app/Contents/Resources/';
  const markerIndex = iconPath.indexOf(appMarker);
  if (markerIndex === -1) {
    return undefined;
  }

  return iconPath.slice(0, markerIndex + '.app'.length);
}

function run(command, args) {
  childProcess.execFileSync(command, args, {
    stdio: 'ignore',
  });
}

function refreshAppRegistration(appBundlePath) {
  if (!appBundlePath || !fs.existsSync(appBundlePath)) {
    return;
  }

  const now = new Date();
  fs.utimesSync(appBundlePath, now, now);

  const lsregister =
    '/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister';
  if (fs.existsSync(lsregister)) {
    childProcess.spawnSync(lsregister, ['-f', appBundlePath], { stdio: 'ignore' });
  }
}

function ensureFinderCustomIcon({ appBundlePath, force = false }) {
  if (!appBundlePath || !enableFinderCustomIcon) {
    return { state: 'skipped' };
  }

  if (!fs.existsSync(pngSourcePath)) {
    fail(`Managed VS Code icon PNG source not found: ${pngSourcePath}`);
  }

  const customIconPath = path.join(appBundlePath, 'Icon\r');
  if (!force && fs.existsSync(customIconPath)) {
    return { state: 'patched', customIconPath };
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-vscode-icon-'));
  const tempPngPath = path.join(tempDir, 'icon.png');
  const tempRsrcPath = path.join(tempDir, 'icon.rsrc');

  try {
    fs.copyFileSync(pngSourcePath, tempPngPath);
    run('/usr/bin/sips', ['-i', tempPngPath]);
    fs.writeFileSync(
      tempRsrcPath,
      childProcess.execFileSync('/usr/bin/DeRez', ['-only', 'icns', tempPngPath], {
        maxBuffer: 64 * 1024 * 1024,
      }),
    );
    run('/usr/bin/Rez', ['-append', tempRsrcPath, '-o', customIconPath]);
    run('/usr/bin/SetFile', ['-a', 'C', appBundlePath]);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }

  return { state: 'needs-patch', customIconPath };
}

if (!fs.existsSync(sourcePath)) {
  fail(`Managed VS Code icon source not found: ${sourcePath}`);
}

if (!fs.existsSync(targetPath)) {
  fail(`VS Code app icon not found: ${targetPath}`);
}

const sourceIcon = fs.readFileSync(sourcePath);
const targetIcon = fs.readFileSync(targetPath);
const appBundlePath = getAppBundlePath(targetPath);

if (sourceIcon.equals(targetIcon)) {
  const finderIcon = ensureFinderCustomIcon({ appBundlePath });
  if (finderIcon.state === 'needs-patch') {
    refreshAppRegistration(appBundlePath);
    console.log(`Already patched: ${targetPath}`);
    console.log(`Applied Finder custom app icon: ${finderIcon.customIconPath}`);
    console.log('Restart Dock or fully quit and reopen VS Code for the Dock icon to refresh.');
    process.exit(0);
  }

  console.log(`Already patched: ${targetPath}`);
  process.exit(0);
}

const stat = fs.statSync(targetPath);
const backupPath = `${targetPath}.codex-backup-${timestamp()}-vscode-icon`;
const tempPath = `${targetPath}.codex-tmp-${process.pid}.icns`;

fs.copyFileSync(targetPath, backupPath);
fs.writeFileSync(tempPath, sourceIcon, { mode: stat.mode });
fs.chmodSync(tempPath, stat.mode);
fs.renameSync(tempPath, targetPath);

const finderIcon = ensureFinderCustomIcon({ appBundlePath, force: true });
refreshAppRegistration(appBundlePath);

if (finderIcon.state === 'needs-patch') {
  console.log(`Applied Finder custom app icon: ${finderIcon.customIconPath}`);
}

console.log(`Patched VS Code icon: ${targetPath}`);
console.log(`Backup: ${backupPath}`);
console.log('Restart Dock or fully quit and reopen VS Code for Finder and Dock to pick up the icon change.');
