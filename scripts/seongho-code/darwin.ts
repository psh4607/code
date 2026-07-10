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
	nameLong: string;
	applicationName: string;
	darwinBundleIdentifier: string;
}

const root = path.resolve(__dirname, '../..');
const product = JSON.parse(fs.readFileSync(path.join(root, 'product.json'), 'utf8')) as ProductConfiguration;
const preferredSigningIdentity = 'Seongho Local Code Signing';
const command = process.argv[2];

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

function ensureDarwin(): void {
	if (process.platform !== 'darwin') {
		throw new Error('Seongho Code desktop packaging is currently supported only on macOS.');
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

function readPlistValue(appPath: string, key: string): string {
	return capture('/usr/libexec/PlistBuddy', ['-c', `Print :${key}`, path.join(appPath, 'Contents/Info.plist')]);
}

function assertExpectedApp(appPath: string): void {
	if (!fs.existsSync(appPath)) {
		throw new Error(`Seongho Code app is missing: ${appPath}`);
	}

	const bundleIdentifier = readPlistValue(appPath, 'CFBundleIdentifier');
	const bundleName = readPlistValue(appPath, 'CFBundleName');
	if (bundleIdentifier !== product.darwinBundleIdentifier || bundleName !== product.nameLong) {
		throw new Error(
			`Refusing to manage unexpected app at ${appPath}: ` +
			`${bundleName} (${bundleIdentifier})`
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

function install(): void {
	ensureDarwin();
	const sourceAppPath = getBuildAppPath();
	const installAppPath = getInstallAppPath();
	const temporaryAppPath = `${installAppPath}.install-${process.pid}`;
	const backupAppPath = `${installAppPath}.backup-${process.pid}`;
	assertExpectedApp(sourceAppPath);
	prepareCliPath();

	fs.rmSync(temporaryAppPath, { recursive: true, force: true });
	fs.rmSync(backupAppPath, { recursive: true, force: true });
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
		fs.rmSync(backupAppPath, { recursive: true, force: true });
	} catch (error) {
		fs.rmSync(temporaryAppPath, { recursive: true, force: true });
		if (movedExistingApp && !fs.existsSync(installAppPath) && fs.existsSync(backupAppPath)) {
			fs.renameSync(backupAppPath, installAppPath);
		}
		throw error;
	}

	refreshLaunchServices(installAppPath);
	installCli(installAppPath);
	console.log(`Installed app: ${installAppPath}`);
}

function doctor(): void {
	ensureDarwin();
	const installAppPath = getInstallAppPath();
	const cliPath = getCliPath();
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

	console.log(`Seongho Code doctor passed: ${installAppPath}`);
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
