const childProcess = require('node:child_process');
const os = require('node:os');
const path = require('node:path');

const AD_HOC_CODE_SIGN_IDENTITY = '-';
const CODE_SIGN_IDENTITY_ENV = 'CODEX_VSCODE_CODESIGN_IDENTITY';
const CODE_SIGN_KEYCHAIN_ENV = 'CODEX_VSCODE_CODESIGN_KEYCHAIN';
const DEFAULT_CODE_SIGN_IDENTITY = 'Seongho Local Code Signing';

function getDefaultCodeSignKeychainPath({ homeDir = os.homedir() } = {}) {
  return path.join(homeDir, 'Library', 'Keychains', 'login.keychain-db');
}

function getConfiguredCodeSignIdentity({ env = process.env } = {}) {
  const configured = env[CODE_SIGN_IDENTITY_ENV]?.trim();
  return configured || DEFAULT_CODE_SIGN_IDENTITY;
}

function getConfiguredCodeSignKeychainPath({ env = process.env } = {}) {
  const configured = env[CODE_SIGN_KEYCHAIN_ENV]?.trim();
  return configured || getDefaultCodeSignKeychainPath();
}

function parseCodeSignIdentities(output) {
  const identities = [];

  for (const line of String(output || '').split(/\r?\n/)) {
    const match = line.match(/^\s*\d+\)\s+([A-Fa-f0-9]{40})\s+"(.+)"\s*$/);
    if (!match) {
      continue;
    }

    identities.push({
      hash: match[1],
      name: match[2],
    });
  }

  return identities;
}

function listCodeSignIdentities({
  execFileSync = childProcess.execFileSync,
  keychainPath,
} = {}) {
  const args = ['find-identity', '-v', '-p', 'codesigning'];
  if (keychainPath) {
    args.push(keychainPath);
  }

  try {
    return parseCodeSignIdentities(
      execFileSync('/usr/bin/security', args, {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }),
    );
  } catch {
    return [];
  }
}

function findCodeSignIdentity({ identity, execFileSync = childProcess.execFileSync, keychainPath } = {}) {
  if (!identity || identity === AD_HOC_CODE_SIGN_IDENTITY) {
    return undefined;
  }

  return listCodeSignIdentities({ execFileSync, keychainPath }).find(
    (candidate) => candidate.name === identity || candidate.hash.toLowerCase() === identity.toLowerCase(),
  );
}

function resolveCodeSignIdentity({
  env = process.env,
  execFileSync = childProcess.execFileSync,
  keychainPath,
} = {}) {
  const configuredIdentity = getConfiguredCodeSignIdentity({ env });
  const explicitlyConfigured = Boolean(env[CODE_SIGN_IDENTITY_ENV]?.trim());

  if (configuredIdentity === AD_HOC_CODE_SIGN_IDENTITY) {
    return {
      identity: AD_HOC_CODE_SIGN_IDENTITY,
      kind: 'ad-hoc',
      reason: `${CODE_SIGN_IDENTITY_ENV} forces ad-hoc signing`,
    };
  }

  const found = findCodeSignIdentity({
    identity: configuredIdentity,
    execFileSync,
    keychainPath,
  });
  if (found) {
    return {
      identity: found.hash,
      kind: 'certificate',
      name: found.name,
      reason: `using local code signing identity ${found.name}`,
    };
  }

  if (explicitlyConfigured) {
    throw new Error(
      `Configured code signing identity not found: ${configuredIdentity}. ` +
        `Run npm run ensure:codesign-identity or set ${CODE_SIGN_IDENTITY_ENV}=- for ad-hoc signing.`,
    );
  }

  return {
    identity: AD_HOC_CODE_SIGN_IDENTITY,
    kind: 'ad-hoc',
    reason: `default code signing identity not found: ${configuredIdentity}`,
  };
}

module.exports = {
  AD_HOC_CODE_SIGN_IDENTITY,
  CODE_SIGN_IDENTITY_ENV,
  CODE_SIGN_KEYCHAIN_ENV,
  DEFAULT_CODE_SIGN_IDENTITY,
  findCodeSignIdentity,
  getConfiguredCodeSignIdentity,
  getConfiguredCodeSignKeychainPath,
  getDefaultCodeSignKeychainPath,
  listCodeSignIdentities,
  parseCodeSignIdentities,
  resolveCodeSignIdentity,
};
