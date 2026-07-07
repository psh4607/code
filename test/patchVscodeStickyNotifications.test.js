const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const scriptPath = path.join(__dirname, '..', 'scripts', 'patch-vscode-sticky-notifications.js');

function runPatchScript({ workbenchPath }) {
  return childProcess.spawnSync(process.execPath, [scriptPath], {
    env: {
      ...process.env,
      VSCODE_WORKBENCH_MAIN: workbenchPath,
    },
    encoding: 'utf8',
  });
}

const workbenchSource = [
  'class xge{',
  '_showMessage(i,e,t,o){return new Promise(n=>{let r=t.map(p=>ci({id:`_extension_message_handle_${p.handle}`,label:p.title,enabled:!0,run:()=>(n(p.handle),Promise.resolve())})),s,c=!1;o.source&&(s={label:o.source.label,id:o.source.identifier.value},c=xge.URGENT_NOTIFICATION_SOURCES.includes(s.id)),s||(s=d(4458,null));let l=[];o.source&&l.push(ci({id:o.source.identifier.value,label:d(4459,null),run:()=>this._commandService.executeCommand("_extensions.manage",o.source.identifier.value)}));let u=this._notificationService.notify({severity:i,message:e,actions:{primary:r,secondary:l},source:s,priority:c?3:0,sticky:c});U.once(u.onDidClose)(()=>{n(void 0)})})}',
  '}',
  'xge.URGENT_NOTIFICATION_SOURCES=["vscode.github-authentication","vscode.microsoft-authentication"],xge=y([bo(to.MainThreadMessageService),h(1,Pe),h(2,be),h(3,lt),h(4,dt)],xge);',
  '',
].join('\n');

test('patch script makes this extension an urgent sticky notification source', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-sticky-notifications-test-'));
  const workbenchPath = path.join(tmpDir, 'workbench.desktop.main.js');
  fs.writeFileSync(workbenchPath, workbenchSource);

  const result = runPatchScript({ workbenchPath });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Patched VS Code sticky notifications:/);
  const nextSource = fs.readFileSync(workbenchPath, 'utf8');
  assert.match(nextSource, /codex-vscode-terminal-tools: sticky-notifications/);
  assert.match(nextSource, /codex-vscode-terminal-tools: replace-notification-by-session/);
  assert.match(nextSource, /"seongho\.codex-vscode-terminal-tools"/);
  assert.match(nextSource, /CODEX_REPLACEABLE_NOTIFICATIONS/);
  assert.match(nextSource, /replace-notification:\(\[\^\\x1F\]\+\)/);
  assert.match(nextSource, /\.close\?\.\(\)/);

  const backups = fs
    .readdirSync(tmpDir)
    .filter((entry) =>
      entry.startsWith('workbench.desktop.main.js.codex-backup-') &&
      entry.endsWith('-sticky-notifications'),
    );
  assert.equal(backups.length, 1);
  assert.equal(fs.readFileSync(path.join(tmpDir, backups[0]), 'utf8'), workbenchSource);
});

test('patch script is idempotent when sticky notification source is already present', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-sticky-notifications-test-'));
  const workbenchPath = path.join(tmpDir, 'workbench.desktop.main.js');
  fs.writeFileSync(workbenchPath, workbenchSource);
  const firstResult = runPatchScript({ workbenchPath });
  assert.equal(firstResult.status, 0, firstResult.stderr);

  const result = runPatchScript({ workbenchPath });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Already patched: .*workbench\.desktop\.main\.js/);
  const backups = fs
    .readdirSync(tmpDir)
    .filter((entry) =>
      entry.startsWith('workbench.desktop.main.js.codex-backup-') &&
      entry.endsWith('-sticky-notifications'),
    );
  assert.equal(backups.length, 1);
});

test('patch script upgrades an existing sticky-only patch with replaceable notifications', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-sticky-notifications-test-'));
  const workbenchPath = path.join(tmpDir, 'workbench.desktop.main.js');
  fs.writeFileSync(
    workbenchPath,
    workbenchSource.replace(
      'xge.URGENT_NOTIFICATION_SOURCES=["vscode.github-authentication","vscode.microsoft-authentication"],',
      'xge.URGENT_NOTIFICATION_SOURCES=["vscode.github-authentication","vscode.microsoft-authentication","seongho.codex-vscode-terminal-tools"/* codex-vscode-terminal-tools: sticky-notifications. Reapply with patch-vscode-sticky-notifications. */],',
    ),
  );

  const result = runPatchScript({ workbenchPath });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Patched VS Code sticky notifications:/);
  const nextSource = fs.readFileSync(workbenchPath, 'utf8');
  assert.match(nextSource, /codex-vscode-terminal-tools: replace-notification-by-session/);
  assert.equal((nextSource.match(/seongho\.codex-vscode-terminal-tools/g) || []).length, 2);
});

test('patch script fails closed when urgent notification source marker is missing', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-sticky-notifications-test-'));
  const workbenchPath = path.join(tmpDir, 'workbench.desktop.main.js');
  fs.writeFileSync(
    workbenchPath,
    workbenchSource.replace(
      'xge.URGENT_NOTIFICATION_SOURCES=["vscode.github-authentication","vscode.microsoft-authentication"],',
      '',
    ),
  );

  const result = runPatchScript({ workbenchPath });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Could not apply VS Code sticky notifications patch safely/);
});

test('patch script fails closed when notification sticky source path changes', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-sticky-notifications-test-'));
  const workbenchPath = path.join(tmpDir, 'workbench.desktop.main.js');
  fs.writeFileSync(workbenchPath, workbenchSource.replace('sticky:c', 'sticky:!1'));

  const result = runPatchScript({ workbenchPath });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Could not find VS Code notification sticky source path/);
});
