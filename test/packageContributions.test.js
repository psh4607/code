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
