/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { SpawnSyncOptions } from 'node:child_process';
import type { Stats } from 'node:fs';

const { execFileSync, spawnSync } = require('node:child_process') as typeof import('node:child_process');
const fs = require('node:fs') as typeof import('node:fs');
const os = require('node:os') as typeof import('node:os');
const path = require('node:path') as typeof import('node:path');

interface ProductConfiguration {
	nameShort: string;
	nameLong: string;
	applicationName: string;
	dataFolderName: string;
	darwinBundleIdentifier: string;
}

const root = path.resolve(__dirname, '../..');
const product = JSON.parse(fs.readFileSync(path.join(root, 'product.json'), 'utf8')) as ProductConfiguration;
const preferredSigningIdentity = 'Seongho Local Code Signing';
const command = process.argv[2];
const layoutSeedVersion = 3;
const globalLayoutStateKeys = [
	'peekViewLayout',
	'terminal.hidden',
	'views.cachedViewPositions',
	'views.customizations',
	'workbench.activity.pinnedViewlets2',
	'workbench.activity.placeholderViewlets',
	'workbench.activity.showAccounts',
	'workbench.activityBar.hidden',
	'workbench.activityBar.location',
	'workbench.auxiliaryBar.empty',
	'workbench.auxiliaryBar.lastNonMaximizedSize',
	'workbench.auxiliaryBar.size',
	'workbench.auxiliarybar.pinnedPanels',
	'workbench.auxiliarybar.placeholderPanels',
	'workbench.panel.alignment',
	'workbench.panel.lastNonMaximizedHeight',
	'workbench.panel.lastNonMaximizedWidth',
	'workbench.panel.pinnedPanels',
	'workbench.panel.placeholderPanels',
	'workbench.panel.size',
	'workbench.quickInput.viewState',
	'workbench.sideBar.position',
	'workbench.sideBar.size',
	'workbench.statusBar.hidden',
	'workbench.statusbar.hidden',
];
const globalLayoutStateGlobs = [
	'workbench.panel.*.hidden',
	'workbench.*.views.state.hidden',
	'workbench.view.*.state.hidden',
	'workbench.views.service.*.state.hidden',
];
const workspaceLayoutStateKeys = [
	'workbench.activity.viewletsWorkspaceState',
	'workbench.activityBar.hidden',
	'workbench.auxiliaryBar.hidden',
	'workbench.auxiliaryBar.lastNonMaximizedVisibility',
	'workbench.auxiliaryBar.wasLastMaximized',
	'workbench.auxiliarybar.activepanelid',
	'workbench.auxiliarybar.viewContainersWorkspaceState',
	'workbench.editor.centered',
	'workbench.editor.hidden',
	'workbench.panel.hidden',
	'workbench.panel.position',
	'workbench.panel.viewContainersWorkspaceState',
	'workbench.panel.wasLastMaximized',
	'workbench.sideBar.hidden',
	'workbench.sideBar.position',
	'workbench.sidebar.activeviewletid',
	'workbench.statusBar.hidden',
];
const workspaceLayoutStateGlobs = [
	'workbench.*.views.state',
	'workbench.panel.*',
	'workbench.view.*.numberOfVisibleViews',
	'workbench.view.*.state',
	'workbench.views.service.*.numberOfVisibleViews',
	'workbench.views.service.*.state',
];

function run(executable: string, args: string[], options: SpawnSyncOptions = {}): void {
	const result = spawnSync(executable, args, {
		cwd: root,
		stdio: 'inherit',
		...options,
	});
	if (result.error) {
		throw result.error;
	}
	if (result.status !== 0) {
		throw new Error(`${executable} exited with status ${result.status}`);
	}
}

function capture(executable: string, args: string[]): string {
	return execFileSync(executable, args, { cwd: root, encoding: 'utf8' }).trim();
}

function removeDirectory(directoryPath: string): void {
	fs.rmSync(directoryPath, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}

function ensureDarwin(): void {
	if (process.platform !== 'darwin') {
		throw new Error('Code desktop packaging is currently supported only on macOS.');
	}
	if (process.arch !== 'arm64' && process.arch !== 'x64') {
		throw new Error(`Unsupported macOS architecture: ${process.arch}`);
	}
}

function getBuildAppPath(): string {
	return path.resolve(root, `../VSCode-darwin-${process.arch}/${product.nameLong}.app`);
}

function getInstallAppPath(): string {
	return path.resolve(process.env.SEONGHO_CODE_INSTALL_PATH || `/Applications/${product.nameLong}.app`);
}

function getCliPath(): string {
	return path.resolve(process.env.SEONGHO_CODE_CLI_PATH || path.join(os.homedir(), '.local/bin', product.applicationName));
}

function getSettingsSourcePath(): string {
	return path.resolve(
		process.env.SEONGHO_CODE_SETTINGS_SOURCE ||
		path.join(os.homedir(), 'Library/Application Support/Code/User/settings.json')
	);
}

function getSettingsTargetPath(): string {
	return path.resolve(
		process.env.SEONGHO_CODE_SETTINGS_TARGET ||
		path.join(os.homedir(), 'Library/Application Support', product.nameShort, 'User/settings.json')
	);
}

function getKeybindingsSourcePath(): string {
	return path.resolve(
		process.env.SEONGHO_CODE_KEYBINDINGS_SOURCE ||
		path.join(os.homedir(), 'Library/Application Support/Code/User/keybindings.json')
	);
}

function getKeybindingsTargetPath(): string {
	return path.resolve(
		process.env.SEONGHO_CODE_KEYBINDINGS_TARGET ||
		path.join(os.homedir(), 'Library/Application Support', product.nameShort, 'User/keybindings.json')
	);
}

function getLayoutSourcePath(): string {
	return path.resolve(
		process.env.SEONGHO_CODE_LAYOUT_SOURCE ||
		path.join(os.homedir(), 'Library/Application Support/Code/User/globalStorage/state.vscdb')
	);
}

function getLayoutTargetPath(): string {
	return path.resolve(
		process.env.SEONGHO_CODE_LAYOUT_TARGET ||
		path.join(os.homedir(), 'Library/Application Support', product.nameShort, 'User/globalStorage/state.vscdb')
	);
}

function getWorkspaceLayoutSourcePath(): string {
	return path.resolve(
		process.env.SEONGHO_CODE_WORKSPACE_LAYOUT_SOURCE ||
		path.join(os.homedir(), 'Library/Application Support/Code/User/workspaceStorage')
	);
}

function getWorkspaceLayoutTargetPath(): string {
	return path.resolve(
		process.env.SEONGHO_CODE_WORKSPACE_LAYOUT_TARGET ||
		path.join(os.homedir(), 'Library/Application Support', product.nameShort, 'User/workspaceStorage')
	);
}

function getLayoutMarkerPath(): string {
	return `${getLayoutTargetPath()}.layout-seed-v${layoutSeedVersion}.json`;
}

function readPlistValue(appPath: string, key: string): string {
	return capture('/usr/libexec/PlistBuddy', ['-c', `Print :${key}`, path.join(appPath, 'Contents/Info.plist')]);
}

function assertExpectedApp(appPath: string): void {
	if (!fs.existsSync(appPath)) {
		throw new Error(`Code app is missing: ${appPath}`);
	}

	const bundleIdentifier = readPlistValue(appPath, 'CFBundleIdentifier');
	const bundleDisplayName = readPlistValue(appPath, 'CFBundleDisplayName');
	if (bundleIdentifier !== product.darwinBundleIdentifier || bundleDisplayName !== product.nameLong) {
		throw new Error(
			`Refusing to manage unexpected app at ${appPath}: ` +
			`${bundleDisplayName} (${bundleIdentifier})`
		);
	}
}

function resolveSigningIdentity(): string {
	const configuredIdentity = process.env.SEONGHO_CODE_SIGN_IDENTITY?.trim();
	const requestedIdentity = configuredIdentity || preferredSigningIdentity;
	if (requestedIdentity === '-') {
		return requestedIdentity;
	}

	const identities = capture('/usr/bin/security', ['find-identity', '-v', '-p', 'codesigning']);
	if (identities.includes(`"${requestedIdentity}"`)) {
		return requestedIdentity;
	}
	if (configuredIdentity) {
		throw new Error(`Configured code signing identity is unavailable: ${configuredIdentity}`);
	}

	console.warn(`Code signing identity '${preferredSigningIdentity}' was not found; using ad-hoc signing.`);
	return '-';
}

function signApp(appPath: string): void {
	assertExpectedApp(appPath);
	fs.rmSync(path.join(appPath, 'Icon\r'), { force: true });
	run('/usr/bin/xattr', ['-cr', appPath]);
	run('/usr/bin/codesign', [
		'--force',
		'--deep',
		'--sign',
		resolveSigningIdentity(),
		'--preserve-metadata=entitlements',
		appPath,
	]);
	run('/usr/bin/xattr', ['-cr', appPath]);
	run('/usr/bin/codesign', ['--verify', '--deep', '--strict', '--verbose=2', appPath]);
}

function build(): void {
	ensureDarwin();
	run('npm', ['run', 'gulp', `vscode-darwin-${process.arch}`]);
	const appPath = getBuildAppPath();
	signApp(appPath);
	console.log(`Built and signed: ${appPath}`);
}

function prepareCliPath(): { cliPath: string; existingCliStat: Stats | undefined } {
	const cliPath = getCliPath();
	fs.mkdirSync(path.dirname(cliPath), { recursive: true });
	fs.accessSync(path.dirname(cliPath), fs.constants.W_OK);
	let existingCliStat: Stats | undefined;
	try {
		existingCliStat = fs.lstatSync(cliPath);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
			throw error;
		}
	}
	if (existingCliStat && !existingCliStat.isSymbolicLink()) {
		throw new Error(`Refusing to replace non-symlink CLI path: ${cliPath}`);
	}
	return { cliPath, existingCliStat };
}

function installCli(appPath: string): void {
	const { cliPath, existingCliStat } = prepareCliPath();
	const cliTarget = path.join(appPath, 'Contents/Resources/app/bin/code');
	if (!fs.existsSync(cliTarget)) {
		throw new Error(`Packaged CLI is missing: ${cliTarget}`);
	}

	if (existingCliStat) {
		fs.rmSync(cliPath);
	}
	fs.symlinkSync(cliTarget, cliPath);
	console.log(`Installed CLI: ${cliPath} -> ${cliTarget}`);
}

function refreshLaunchServices(appPath: string): void {
	const lsregister = '/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister';
	if (fs.existsSync(lsregister)) {
		run(lsregister, ['-f', appPath]);
	}
}

function seedProfileFile(label: string, sourcePath: string, targetPath: string): void {
	if (!fs.existsSync(sourcePath)) {
		console.warn(`VS Code ${label} source is missing; skipping profile seed: ${sourcePath}`);
		return;
	}
	if (fs.existsSync(targetPath)) {
		console.log(`Preserved existing Code ${label}: ${targetPath}`);
		return;
	}

	fs.mkdirSync(path.dirname(targetPath), { recursive: true });
	fs.copyFileSync(sourcePath, targetPath, fs.constants.COPYFILE_EXCL);
	console.log(`Seeded Code ${label}: ${sourcePath} -> ${targetPath}`);
}

function seedProfileDefaults(): void {
	seedProfileFile('settings', getSettingsSourcePath(), getSettingsTargetPath());
	seedProfileFile('keybindings', getKeybindingsSourcePath(), getKeybindingsTargetPath());
}

function assertSeededProfileFile(label: string, sourcePath: string, targetPath: string): void {
	if (fs.existsSync(sourcePath) && !fs.existsSync(targetPath)) {
		throw new Error(`Seeded Code ${label} are missing: ${targetPath}`);
	}
}

function sqlString(value: string): string {
	const quote = String.fromCharCode(39);
	return `${quote}${value.replaceAll(quote, quote + quote)}${quote}`;
}

function getLayoutWhereClause(exactStateKeys: string[], stateGlobs: string[]): string {
	const exactKeys = exactStateKeys.map(sqlString).join(', ');
	const globs = stateGlobs.map(pattern => `key GLOB ${sqlString(pattern)}`).join(' OR ');
	return `key IN (${exactKeys}) OR ${globs}`;
}

function ensureStateDatabase(databasePath: string): void {
	fs.mkdirSync(path.dirname(databasePath), { recursive: true });
	if (!fs.existsSync(databasePath)) {
		capture('/usr/bin/sqlite3', [databasePath, 'CREATE TABLE ItemTable (key TEXT UNIQUE ON CONFLICT REPLACE, value BLOB);']);
	}
}

function mergeLayoutState(sourcePath: string, targetPath: string, whereClause: string): number {
	ensureStateDatabase(targetPath);
	const backupPath = `${targetPath}.before-layout-seed-v${layoutSeedVersion}`;
	if (!fs.existsSync(backupPath)) {
		fs.copyFileSync(targetPath, backupPath, fs.constants.COPYFILE_EXCL);
	}

	const query = [
		`ATTACH DATABASE ${sqlString(sourcePath)} AS sourceDb;`,
		'BEGIN IMMEDIATE;',
		`DELETE FROM ItemTable WHERE ${whereClause};`,
		`INSERT OR REPLACE INTO ItemTable(key, value) SELECT key, value FROM sourceDb.ItemTable WHERE ${whereClause};`,
		'SELECT changes();',
		'COMMIT;',
	].join(' ');
	return Number(capture('/usr/bin/sqlite3', [targetPath, query]).split('\n').at(-1));
}

function getMostRecentEmptyWindowStatePath(storagePath: string): string | undefined {
	if (!fs.existsSync(storagePath)) {
		return undefined;
	}

	return fs.readdirSync(storagePath, { withFileTypes: true })
		.filter(entry => entry.isDirectory() && /^\d+$/.test(entry.name))
		.map(entry => path.join(storagePath, entry.name, 'state.vscdb'))
		.filter(databasePath => fs.existsSync(databasePath))
		.sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs)
		.at(0);
}

interface WorkspaceLayoutSeedResult {
	workspaceCount: number;
	seededKeyCount: number;
	emptyWindowSeeded: boolean;
}

function seedWorkspaceLayoutState(): WorkspaceLayoutSeedResult {
	const sourceStoragePath = getWorkspaceLayoutSourcePath();
	const targetStoragePath = getWorkspaceLayoutTargetPath();
	const result: WorkspaceLayoutSeedResult = { workspaceCount: 0, seededKeyCount: 0, emptyWindowSeeded: false };
	if (!fs.existsSync(sourceStoragePath)) {
		console.warn(`VS Code workspace layout source is missing; skipping workspace layout seed: ${sourceStoragePath}`);
		return result;
	}

	const whereClause = getLayoutWhereClause(workspaceLayoutStateKeys, workspaceLayoutStateGlobs);
	for (const entry of fs.readdirSync(sourceStoragePath, { withFileTypes: true })) {
		if (!entry.isDirectory()) {
			continue;
		}

		const sourceDirectory = path.join(sourceStoragePath, entry.name);
		const workspaceMetadataPath = path.join(sourceDirectory, 'workspace.json');
		const sourceDatabasePath = path.join(sourceDirectory, 'state.vscdb');
		if (!fs.existsSync(workspaceMetadataPath) || !fs.existsSync(sourceDatabasePath)) {
			continue;
		}

		const targetDirectory = path.join(targetStoragePath, entry.name);
		const targetMetadataPath = path.join(targetDirectory, 'workspace.json');
		fs.mkdirSync(targetDirectory, { recursive: true });
		if (!fs.existsSync(targetMetadataPath)) {
			fs.copyFileSync(workspaceMetadataPath, targetMetadataPath, fs.constants.COPYFILE_EXCL);
		}
		result.seededKeyCount += mergeLayoutState(sourceDatabasePath, path.join(targetDirectory, 'state.vscdb'), whereClause);
		result.workspaceCount++;
	}

	const emptyWindowSourcePath = getMostRecentEmptyWindowStatePath(sourceStoragePath);
	const emptyWindowTargetPath = getMostRecentEmptyWindowStatePath(targetStoragePath);
	if (emptyWindowSourcePath && emptyWindowTargetPath) {
		result.seededKeyCount += mergeLayoutState(emptyWindowSourcePath, emptyWindowTargetPath, whereClause);
		result.emptyWindowSeeded = true;
	}

	return result;
}

function assertCodeAppNotRunning(appPath: string): void {
	const executablePrefix = path.join(appPath, 'Contents/MacOS/');
	const processes = capture('/bin/ps', ['-axo', 'command=']).split('\n');
	if (processes.some(process => process.startsWith(executablePrefix))) {
		throw new Error(`Quit Code before installing or seeding layout state: ${appPath}`);
	}
}

function seedLayoutState(): void {
	const sourcePath = getLayoutSourcePath();
	const targetPath = getLayoutTargetPath();
	const markerPath = getLayoutMarkerPath();
	if (fs.existsSync(markerPath)) {
		console.log(`Preserved existing Code layout state: ${targetPath}`);
		return;
	}

	let globalSeededKeyCount = 0;
	if (fs.existsSync(sourcePath)) {
		globalSeededKeyCount = mergeLayoutState(
			sourcePath,
			targetPath,
			getLayoutWhereClause(globalLayoutStateKeys, globalLayoutStateGlobs)
		);
	} else {
		console.warn(`VS Code layout source is missing; skipping global layout seed: ${sourcePath}`);
	}

	const workspaceResult = seedWorkspaceLayoutState();
	fs.mkdirSync(path.dirname(markerPath), { recursive: true });
	fs.writeFileSync(markerPath, `${JSON.stringify({
		version: layoutSeedVersion,
		global: { sourcePath, targetPath, seededKeyCount: globalSeededKeyCount },
		workspace: {
			sourcePath: getWorkspaceLayoutSourcePath(),
			targetPath: getWorkspaceLayoutTargetPath(),
			...workspaceResult,
		},
	}, null, 2)}\n`);
	console.log(
		`Seeded Code layout state (${globalSeededKeyCount} global keys, ` +
		`${workspaceResult.seededKeyCount} keys across ${workspaceResult.workspaceCount} workspaces` +
		`${workspaceResult.emptyWindowSeeded ? ' and the current empty window' : ''}).`
	);
}

function install(): void {
	ensureDarwin();
	const sourceAppPath = getBuildAppPath();
	const installAppPath = getInstallAppPath();
	const temporaryAppPath = `${installAppPath}.install-${process.pid}`;
	const backupAppPath = `${installAppPath}.backup-${process.pid}`;
	assertCodeAppNotRunning(installAppPath);
	assertExpectedApp(sourceAppPath);
	prepareCliPath();

	removeDirectory(temporaryAppPath);
	removeDirectory(backupAppPath);
	run('/usr/bin/ditto', [sourceAppPath, temporaryAppPath]);
	signApp(temporaryAppPath);

	let movedExistingApp = false;
	try {
		if (fs.existsSync(installAppPath)) {
			assertExpectedApp(installAppPath);
			fs.renameSync(installAppPath, backupAppPath);
			movedExistingApp = true;
		}
		fs.renameSync(temporaryAppPath, installAppPath);
		removeDirectory(backupAppPath);
	} catch (error) {
		removeDirectory(temporaryAppPath);
		if (movedExistingApp && !fs.existsSync(installAppPath) && fs.existsSync(backupAppPath)) {
			fs.renameSync(backupAppPath, installAppPath);
		}
		throw error;
	}

	refreshLaunchServices(installAppPath);
	installCli(installAppPath);
	seedProfileDefaults();
	seedLayoutState();
	console.log(`Installed app: ${installAppPath}`);
}

function doctor(): void {
	ensureDarwin();
	const installAppPath = getInstallAppPath();
	const cliPath = getCliPath();
	const extensionRegistryPath = path.join(os.homedir(), product.dataFolderName, 'extensions/extensions.json');
	assertExpectedApp(installAppPath);
	run('/usr/bin/codesign', ['--verify', '--deep', '--strict', '--verbose=2', installAppPath]);

	if (!fs.existsSync(cliPath) || !fs.lstatSync(cliPath).isSymbolicLink()) {
		throw new Error(`Seongho Code CLI symlink is missing: ${cliPath}`);
	}
	const expectedCliTarget = path.join(installAppPath, 'Contents/Resources/app/bin/code');
	const actualCliTarget = fs.readlinkSync(cliPath);
	if (actualCliTarget !== expectedCliTarget) {
		throw new Error(`CLI target mismatch: expected ${expectedCliTarget}, got ${actualCliTarget}`);
	}
	if (!fs.existsSync(extensionRegistryPath)) {
		throw new Error(`Shared VS Code extension registry is missing: ${extensionRegistryPath}`);
	}
	assertSeededProfileFile('settings', getSettingsSourcePath(), getSettingsTargetPath());
	assertSeededProfileFile('keybindings', getKeybindingsSourcePath(), getKeybindingsTargetPath());
	if (
		(fs.existsSync(getLayoutSourcePath()) || fs.existsSync(getWorkspaceLayoutSourcePath())) &&
		!fs.existsSync(getLayoutMarkerPath())
	) {
		throw new Error(`Seeded Code layout marker is missing: ${getLayoutMarkerPath()}`);
	}

	console.log(`Code doctor passed: ${installAppPath}`);
}

try {
	switch (command) {
		case 'build':
			build();
			break;
		case 'install':
			install();
			break;
		case 'apply':
			build();
			install();
			doctor();
			break;
		case 'doctor':
			doctor();
			break;
		default:
			throw new Error('Usage: darwin.ts <build|install|apply|doctor>');
	}
} catch (error) {
	console.error(error instanceof Error ? error.message : error);
	process.exitCode = 1;
}
