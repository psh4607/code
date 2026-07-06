const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const scriptPath = path.join(__dirname, '..', 'scripts', 'patch-vscode-terminal-attach-by-pid.js');

const originalAttachToSession =
  'Kr({id:"workbench.action.terminal.attachToSession",title:N(17348,"Attach to Session"),run:async(i,e)=>{let t=e.get($e),o=e.get(rt),n=e.get(Eo),r=e.get(Pe),s=n.getConnection()?.remoteAuthority??void 0,c=await e.get(Fm).getBackend(s);if(!c)throw new Error(`No backend registered for remote authority \'${s}\'`);let l=await c.listProcesses();c.reduceConnectionGraceTime();let p=l.filter(g=>!i.service.isAttachedToTerminal(g)).map(g=>{let f=o.getUriLabel(A.file(g.cwd));return{label:g.title,detail:g.workspaceName?`${g.workspaceName} \\u2E31 ${f}`:f,description:g.pid?String(g.pid):"",term:g}});if(p.length===0){r.info(d(17345,null));return}let m=await t.pick(p,{canPickMany:!1});if(m){let g=await i.service.createTerminal({config:{attachPersistentProcess:m.term}});i.service.setActiveInstance(g),await rwe(g,i)}}})';

function runPatchScript(workbenchPath) {
  return childProcess.spawnSync(process.execPath, [scriptPath], {
    env: {
      ...process.env,
      VSCODE_WORKBENCH_MAIN: workbenchPath,
    },
    encoding: 'utf8',
  });
}

function writeWorkbench(source) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-terminal-attach-test-'));
  const workbenchPath = path.join(tmpDir, 'workbench.desktop.main.js');
  fs.writeFileSync(
    workbenchPath,
    [
      'const N=(id,text)=>text;',
      'const d=()=>"";',
      'const A={file:value=>value};',
      'const $e=Symbol(),rt=Symbol(),Eo=Symbol(),Pe=Symbol(),Fm=Symbol();',
      'const rwe=async()=>{};',
      'function Kr(value){return value}',
      source,
      '',
    ].join('\n'),
  );
  return { tmpDir, workbenchPath };
}

test('patch script lets terminal attach command accept a persistent process pid argument', () => {
  const { workbenchPath } = writeWorkbench(originalAttachToSession);

  const result = runPatchScript(workbenchPath);

  assert.equal(result.status, 0, result.stderr);
  const source = fs.readFileSync(workbenchPath, 'utf8');
  assert.match(source, /codex-vscode-terminal-tools: terminal-attach-by-pid/);
  assert.match(source, /Number\(t\?\.pid\?\?t\)/);
  assert.match(source, /p\.find\(g=>g\.term\.pid===v\)/);
});

test('patch script is idempotent when attach-by-pid is already installed', () => {
  const { tmpDir, workbenchPath } = writeWorkbench(originalAttachToSession);

  const first = runPatchScript(workbenchPath);
  const second = runPatchScript(workbenchPath);

  assert.equal(first.status, 0, first.stderr);
  assert.equal(second.status, 0, second.stderr);
  assert.match(second.stdout, /Already patched:/);

  const backups = fs
    .readdirSync(tmpDir)
    .filter((entry) => entry.startsWith('workbench.desktop.main.js.codex-backup-'));
  assert.equal(backups.length, 1);
});

test('patch script fails closed when the attach command marker is missing', () => {
  const { workbenchPath } = writeWorkbench('console.log("missing attach command");');

  const result = runPatchScript(workbenchPath);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Could not apply VS Code terminal attach-by-pid patch safely/);
});
