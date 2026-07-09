#!/usr/bin/env node

const childProcess = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  CODE_SIGN_IDENTITY_ENV,
  CODE_SIGN_KEYCHAIN_ENV,
  findCodeSignIdentity,
  getConfiguredCodeSignIdentity,
  getConfiguredCodeSignKeychainPath,
} = require('../src/codeSignIdentity');

const DEFAULT_VALID_DAYS = 3650;
const PKCS12_PASSWORD = 'codex-local-codesign';

function writeOpenSslConfig({ configPath, identity }) {
  const safeIdentity = identity.replace(/[\r\n]/g, ' ').replace(/[\\/]/g, ' ');
  fs.writeFileSync(
    configPath,
    [
      '[req]',
      'distinguished_name = req_distinguished_name',
      'prompt = no',
      'x509_extensions = v3_codesign',
      '',
      '[req_distinguished_name]',
      `CN = ${safeIdentity}`,
      '',
      '[v3_codesign]',
      'basicConstraints = critical,CA:false',
      'keyUsage = critical,digitalSignature',
      'extendedKeyUsage = critical,codeSigning',
      '',
    ].join('\n'),
  );
}

function run(execFileSync, command, args, options = {}) {
  execFileSync(command, args, {
    stdio: 'inherit',
    ...options,
  });
}

function createLocalCodeSignIdentity({
  identity = getConfiguredCodeSignIdentity(),
  keychainPath = getConfiguredCodeSignKeychainPath(),
  validDays = DEFAULT_VALID_DAYS,
  execFileSync = childProcess.execFileSync,
  stdout = process.stdout,
} = {}) {
  const existing = findCodeSignIdentity({ identity, execFileSync, keychainPath });
  if (existing) {
    stdout.write(`ok code signing identity exists: ${existing.name} (${existing.hash})\n`);
    return { changed: false, identity: existing };
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-local-codesign-'));
  const configPath = path.join(tmpDir, 'openssl.cnf');
  const keyPath = path.join(tmpDir, 'identity.key');
  const certPath = path.join(tmpDir, 'identity.crt');
  const p12Path = path.join(tmpDir, 'identity.p12');

  try {
    writeOpenSslConfig({ configPath, identity });
    run(execFileSync, 'openssl', [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-sha256',
      '-nodes',
      '-days',
      String(validDays),
      '-keyout',
      keyPath,
      '-out',
      certPath,
      '-config',
      configPath,
    ]);
    run(execFileSync, 'openssl', [
      'pkcs12',
      '-export',
      '-legacy',
      '-inkey',
      keyPath,
      '-in',
      certPath,
      '-out',
      p12Path,
      '-name',
      identity,
      '-passout',
      `pass:${PKCS12_PASSWORD}`,
    ]);
    run(execFileSync, '/usr/bin/security', [
      'import',
      p12Path,
      '-k',
      keychainPath,
      '-P',
      PKCS12_PASSWORD,
      '-A',
      '-T',
      '/usr/bin/codesign',
    ]);
    run(execFileSync, '/usr/bin/security', [
      'add-trusted-cert',
      '-r',
      'trustRoot',
      '-p',
      'codeSign',
      '-k',
      keychainPath,
      certPath,
    ]);

    const created = findCodeSignIdentity({ identity, execFileSync, keychainPath });
    if (!created) {
      throw new Error(`Created certificate was not accepted as a valid code signing identity: ${identity}`);
    }

    stdout.write(`created code signing identity: ${created.name} (${created.hash})\n`);
    return { changed: true, identity: created };
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

if (require.main === module) {
  try {
    createLocalCodeSignIdentity();
  } catch (error) {
    console.error(error.message);
    console.error(
      `Set ${CODE_SIGN_IDENTITY_ENV}=<name> to use another identity or ` +
        `${CODE_SIGN_KEYCHAIN_ENV}=<path> to target another keychain.`,
    );
    process.exit(1);
  }
}

module.exports = {
  createLocalCodeSignIdentity,
  run,
  writeOpenSslConfig,
};
