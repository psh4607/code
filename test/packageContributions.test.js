const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

function readPackageJson() {
  return JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
}

test('package contributes Cmd+Shift+T to restore detached terminal sessions', () => {
  const packageJson = readPackageJson();

  assert.deepEqual(
    packageJson.contributes.keybindings.find(
      (entry) => entry.command === 'codexTerminal.attachDetachedSession',
    ),
    {
      command: 'codexTerminal.attachDetachedSession',
      key: 'cmd+shift+t',
      mac: 'cmd+shift+t',
    },
  );
});

test('package contributes Cmd+V smart paste in focused terminals', () => {
  const packageJson = readPackageJson();

  assert.deepEqual(
    packageJson.contributes.keybindings.find(
      (entry) => entry.command === 'codexTerminal.smartPaste',
    ),
    {
      command: 'codexTerminal.smartPaste',
      key: 'cmd+v',
      mac: 'cmd+v',
      when: 'terminalFocus',
    },
  );
});

test('package contributes agent notification commands and jump-to-unread keybinding', () => {
  const packageJson = readPackageJson();
  const commandIds = packageJson.contributes.commands.map((entry) => entry.command);

  assert.equal(commandIds.includes('codexTerminal.showAgentNotifications'), true);
  assert.equal(commandIds.includes('codexTerminal.openLatestAgentNotification'), true);
  assert.equal(commandIds.includes('codexTerminal.markAgentNotificationsRead'), true);
  assert.equal(commandIds.includes('codexTerminal.clearAgentNotifications'), true);

  assert.deepEqual(
    packageJson.contributes.keybindings.find(
      (entry) => entry.command === 'codexTerminal.openLatestAgentNotification',
    ),
    {
      command: 'codexTerminal.openLatestAgentNotification',
      key: 'cmd+shift+u',
      mac: 'cmd+shift+u',
    },
  );

  assert.equal(
    packageJson.contributes.configuration.properties[
      'codexTerminal.agentNotifications.enabled'
    ].default,
    true,
  );
});

test('package activates on extension URI callbacks for native notification clicks', () => {
  const packageJson = readPackageJson();

  assert.equal(packageJson.activationEvents.includes('onUri'), true);
});

test('package contributes native macOS notification settings', () => {
  const packageJson = readPackageJson();
  const properties = packageJson.contributes.configuration.properties;

  assert.equal(
    properties['codexTerminal.agentNotifications.nativeMacos.enabled'].default,
    true,
  );
  assert.equal(
    properties['codexTerminal.agentNotifications.nativeMacos.sound'].default,
    true,
  );
  assert.equal(
    properties['codexTerminal.agentNotifications.nativeMacos.uriScheme'].default,
    'vscode',
  );
});

test('package terminal tabs layout patch script includes the row-height workbench patch', () => {
  const packageJson = readPackageJson();
  const script = packageJson.scripts['patch:vscode-terminal-tabs-layout'];

  assert.equal(script.includes('--only patch-vscode-terminal-order.js'), true);
  assert.equal(script.includes('--only patch-vscode-terminal-tabs-title-breaks.js'), true);
  assert.equal(script.includes('--only patch-vscode-terminal-tabs-layout.js'), true);
  assert.equal(script.includes('--only sign-vscode-app.js'), true);
});
