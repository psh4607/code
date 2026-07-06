#!/usr/bin/env node

const childProcess = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const workbenchPath =
  process.env.VSCODE_WORKBENCH_MAIN ||
  '/Applications/Code.app/Contents/Resources/app/out/vs/workbench/workbench.desktop.main.js';

const patchMarker = 'codex-vscode-terminal-tools: terminal-attach-by-pid';

const originalAttachToSession =
  'Kr({id:"workbench.action.terminal.attachToSession",title:N(17348,"Attach to Session"),run:async(i,e)=>{let t=e.get($e),o=e.get(rt),n=e.get(Eo),r=e.get(Pe),s=n.getConnection()?.remoteAuthority??void 0,c=await e.get(Fm).getBackend(s);if(!c)throw new Error(`No backend registered for remote authority \'${s}\'`);let l=await c.listProcesses();c.reduceConnectionGraceTime();let p=l.filter(g=>!i.service.isAttachedToTerminal(g)).map(g=>{let f=o.getUriLabel(A.file(g.cwd));return{label:g.title,detail:g.workspaceName?`${g.workspaceName} \\u2E31 ${f}`:f,description:g.pid?String(g.pid):"",term:g}});if(p.length===0){r.info(d(17345,null));return}let m=await t.pick(p,{canPickMany:!1});if(m){let g=await i.service.createTerminal({config:{attachPersistentProcess:m.term}});i.service.setActiveInstance(g),await rwe(g,i)}}})';

const patchedAttachToSession =
  `/* ${patchMarker}. Reapply with patch-vscode-terminal-attach-by-pid. */` +
  'Kr({id:"workbench.action.terminal.attachToSession",title:N(17348,"Attach to Session"),run:async(i,e,t)=>{let o=e.get($e),n=e.get(rt),r=e.get(Eo),s=e.get(Pe),c=r.getConnection()?.remoteAuthority??void 0,l=await e.get(Fm).getBackend(c);if(!l)throw new Error(`No backend registered for remote authority \'${c}\'`);let u=await l.listProcesses();l.reduceConnectionGraceTime();let p=u.filter(g=>!i.service.isAttachedToTerminal(g)).map(g=>{let f=n.getUriLabel(A.file(g.cwd));return{label:g.title,detail:g.workspaceName?`${g.workspaceName} \\u2E31 ${f}`:f,description:g.pid?String(g.pid):"",term:g}});if(p.length===0){s.info(d(17345,null));return}let v=Number(t?.pid??t),m=Number.isSafeInteger(v)&&v>0?p.find(g=>g.term.pid===v):await o.pick(p,{canPickMany:!1});if(m){let g=await i.service.createTerminal({config:{attachPersistentProcess:m.term}});i.service.setActiveInstance(g),await rwe(g,i)}}})';

function timestamp() {
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-');
}

function countOccurrences(source, needle) {
  let count = 0;
  let index = 0;

  while ((index = source.indexOf(needle, index)) !== -1) {
    count += 1;
    index += needle.length;
  }

  return count;
}

function checkSyntax(filePath) {
  childProcess.execFileSync(process.execPath, ['--check', filePath], {
    stdio: 'inherit',
  });
}

function main() {
  if (!fs.existsSync(workbenchPath)) {
    console.error(`VS Code workbench bundle not found: ${workbenchPath}`);
    process.exit(1);
  }

  const source = fs.readFileSync(workbenchPath, 'utf8');

  if (source.includes(patchMarker)) {
    checkSyntax(workbenchPath);
    console.log(`Already patched: ${workbenchPath}`);
    return;
  }

  const originalCount = countOccurrences(source, originalAttachToSession);
  if (originalCount !== 1) {
    console.error('Could not apply VS Code terminal attach-by-pid patch safely.');
    console.error(`Expected exactly one attachToSession marker, found ${originalCount}.`);
    console.error('Inspect workbench.action.terminal.attachToSession before patching.');
    process.exit(1);
  }

  const backupPath = `${workbenchPath}.codex-backup-${timestamp()}-terminal-attach-by-pid`;
  fs.copyFileSync(workbenchPath, backupPath);
  fs.writeFileSync(workbenchPath, source.replace(originalAttachToSession, patchedAttachToSession));
  checkSyntax(workbenchPath);
  console.log(`Patched VS Code terminal attach-by-pid: ${workbenchPath}`);
  console.log(`Backup: ${backupPath}`);
}

main();
