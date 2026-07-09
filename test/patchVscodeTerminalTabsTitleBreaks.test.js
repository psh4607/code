const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const scriptPath = path.join(
  __dirname,
  '..',
  'scripts',
  'patch-vscode-terminal-tabs-title-breaks.js',
);

function runPatchScript({ workbenchPath }) {
  return childProcess.spawnSync(process.execPath, [scriptPath], {
    env: {
      ...process.env,
      VSCODE_WORKBENCH_MAIN: workbenchPath,
    },
    encoding: 'utf8',
  });
}

function formatTerminalTitle(value) {
  const context = { input: value };
  vm.runInNewContext(
    `${currentPatchHelper}\nresult=globalThis.__codexVscodeTerminalTabTitleBreaks(input);`,
    context,
  );
  return context.result;
}

const terminalTabsRenderer = [
  'var dft=class{constructor(){this.templateId="terminal.tabs"}',
  'renderElement(i,e,t){let o=this._getVisibilityState.getHasText(),n=this._getVisibilityState.getHasActionBar(),s="",l=this._instantiationService.invokeFunction(Xte,i),u="";if(o)this.fillActionBar(i,t),u=s,i.icon&&(u+=`$(${l}) ${i.title}`);else u=`${s}$(${l})`;t.label.setResource({resource:i.resource,name:u,description:o?i.description:void 0},{fileDecorations:{colors:!0,badges:o}})}}',
  '',
].join('\n');

const vscode127TerminalTabsRenderer = [
  'var dft=class{constructor(){this.templateId="terminal.tabs"}',
  'renderElement(i,e,t){let o=this._getVisibilityState.getHasText(),n=this._getVisibilityState.getHasActionBar(),s="",l=this._instantiationService.invokeFunction(Xte,i),u="";if(o)this.fillActionBar(i,t),u=s,i.icon&&(u+=`${i.title}`);else u=`${s}$(${l})`;t.label.setResource({resource:i.resource,name:u,description:o?i.description:void 0},{fileDecorations:{colors:!0,badges:o}})}}',
  '',
].join('\n');

const currentPatchHelper =
  'globalThis.__codexVscodeTerminalTabTitleBreaks??=(a=>{if(typeof a!="string"||!a.includes("|"))return a;let b=a.split("|").map(c=>c.trim()).filter(Boolean),d=/^[\\u2800-\\u28ff]$/u,e=/^([\\u2800-\\u28ff])\\s+(.+)$/u;if(b.length>1&&d.test(b[0]))b[1]=b[0]+" "+b[1],b.shift();else b[0]&&(b[0]=b[0].replace(e,"$1 $2"));return b.map(c=>c.replace(/ /g,"\\u00a0")).join("\\n")});';
const strippedActivityPatchHelper =
  'globalThis.__codexVscodeTerminalTabTitleBreaks??=(a=>{if(typeof a!="string"||!a.includes("|"))return a;let b=a.split("|").map(c=>c.trim()).filter(Boolean),d=/^[\\u2800-\\u28ff]$/u,e=/^[\\u2800-\\u28ff]\\s+(.+)$/u;if(b.length>1&&d.test(b[0]))b.shift();else b[0]&&(b[0]=b[0].replace(e,"$1"));return b.map(c=>c.replace(/ /g,"\\u00a0")).join("\\n")});';
const loadingSpinPatchHelper =
  'globalThis.__codexVscodeTerminalTabTitleBreaks??=(a=>{if(typeof a!="string"||!a.includes("|"))return a;let b=a.split("|").map(c=>c.trim()).filter(Boolean),d="$(loading~spin)",e=/^[\\u2800-\\u28ff]$/u,f=/^[\\u2800-\\u28ff]\\s+(.+)$/u;if(b.length>1&&e.test(b[0]))b[1]=d+" "+b[1],b.shift();else b[0]&&(b[0]=b[0].replace(f,d+" $1"));return b.map(c=>c.replace(/ /g,"\\u00a0")).join("\\n")});';
const oldSplitPatchHelper =
  'globalThis.__codexVscodeTerminalTabTitleBreaks??=(a=>typeof a=="string"&&a.includes("|")?a.split("|").map(b=>b.trim().replace(/ /g,"\\u00a0")).filter(Boolean).join("\\n"):a);';
const simpleLineBreakPatchHelper =
  'globalThis.__codexVscodeTerminalTabTitleBreaks??=(a=>typeof a=="string"&&a.includes("|")?a.replace(/\\|/g,"\\n"):a);';

test('patch helper preserves leading terminal progress markers without a loading icon', () => {
  assert.equal(
    formatTerminalTitle('\u280b | codex-vscode-terminal... | 019f45c0-b7bb'),
    '\u280b\u00a0codex-vscode-terminal...\n019f45c0-b7bb',
  );
  assert.equal(
    formatTerminalTitle('\u280b codex-vscode-terminal... | 019f45c0-b7bb'),
    '\u280b\u00a0codex-vscode-terminal...\n019f45c0-b7bb',
  );
});

test('patch script formats terminal tab titles with pipe line breaks', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-terminal-title-breaks-test-'));
  const workbenchPath = path.join(tmpDir, 'workbench.desktop.main.js');
  fs.writeFileSync(workbenchPath, terminalTabsRenderer);

  const result = runPatchScript({ workbenchPath });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Patched VS Code terminal tab title breaks:/);
  const nextSource = fs.readFileSync(workbenchPath, 'utf8');
  assert.match(nextSource, /Codex VS Code terminal tab title breaks patch/);
  assert.match(nextSource, /__codexVscodeTerminalTabTitleBreaks/);
  assert.equal(nextSource.includes('$(loading~spin)'), false);
  assert.equal(nextSource.includes('split("|").map(c=>c.trim())'), true);
  assert.equal(nextSource.includes('b[1]=b[0]+" "+b[1]'), true);
  assert.equal(nextSource.includes('join("\\n")'), true);
  assert.equal(nextSource.includes('u+=`$(${l}) ${i.title}`'), false);
  assert.equal(
    nextSource.includes(
      'u+=`$(${l}) ${globalThis.__codexVscodeTerminalTabTitleBreaks?.(i.title)??i.title}`',
    ),
    true,
  );

  const backups = fs
    .readdirSync(tmpDir)
    .filter((entry) =>
      entry.startsWith('workbench.desktop.main.js.codex-backup-') &&
      entry.endsWith('-terminal-tabs-title-breaks'),
    );
  assert.equal(backups.length, 1);
  assert.equal(fs.readFileSync(path.join(tmpDir, backups[0]), 'utf8'), terminalTabsRenderer);
});

test('patch script is idempotent when terminal tab title breaks are already patched', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-terminal-title-breaks-test-'));
  const workbenchPath = path.join(tmpDir, 'workbench.desktop.main.js');
  fs.writeFileSync(
    workbenchPath,
    [
      '/* Codex VS Code terminal tab title breaks patch. Reapply with patch-vscode-terminal-tabs-title-breaks. */',
      currentPatchHelper,
      terminalTabsRenderer.replace(
        'u+=`$(${l}) ${i.title}`',
        'u+=`$(${l}) ${globalThis.__codexVscodeTerminalTabTitleBreaks?.(i.title)??i.title}`',
      ).trimEnd(),
      '',
    ].join('\n'),
  );

  const result = runPatchScript({ workbenchPath });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Already patched: .*workbench\.desktop\.main\.js/);

  const backups = fs
    .readdirSync(tmpDir)
    .filter((entry) =>
      entry.startsWith('workbench.desktop.main.js.codex-backup-') &&
      entry.endsWith('-terminal-tabs-title-breaks'),
    );
  assert.equal(backups.length, 0);
});

test('patch script upgrades the previous pipe breakpoint helper', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-terminal-title-breaks-test-'));
  const workbenchPath = path.join(tmpDir, 'workbench.desktop.main.js');
  const legacyHelper =
    'globalThis.__codexVscodeTerminalTabTitleBreaks??=(a=>typeof a=="string"&&a.includes("|")?a.replace(/ /g,"\\u00a0").replace(/\\|/g,"|\\u200b"):a);';
  fs.writeFileSync(
    workbenchPath,
    [
      '/* Codex VS Code terminal tab title breaks patch. Reapply with patch-vscode-terminal-tabs-title-breaks. */',
      legacyHelper,
      terminalTabsRenderer.replace(
        'u+=`$(${l}) ${i.title}`',
        'u+=`$(${l}) ${globalThis.__codexVscodeTerminalTabTitleBreaks?.(i.title)??i.title}`',
      ).trimEnd(),
      '',
    ].join('\n'),
  );

  const result = runPatchScript({ workbenchPath });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Patched VS Code terminal tab title breaks:/);
  const nextSource = fs.readFileSync(workbenchPath, 'utf8');
  assert.equal(nextSource.includes(legacyHelper), false);
  assert.equal(nextSource.includes(currentPatchHelper), true);
  assert.equal(
    nextSource.match(/Codex VS Code terminal tab title breaks patch/g).length,
    1,
  );
});

test('patch script upgrades the activity-stripping helper', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-terminal-title-breaks-test-'));
  const workbenchPath = path.join(tmpDir, 'workbench.desktop.main.js');
  fs.writeFileSync(
    workbenchPath,
    [
      '/* Codex VS Code terminal tab title breaks patch. Reapply with patch-vscode-terminal-tabs-title-breaks. */',
      strippedActivityPatchHelper,
      terminalTabsRenderer.replace(
        'u+=`$(${l}) ${i.title}`',
        'u+=`$(${l}) ${globalThis.__codexVscodeTerminalTabTitleBreaks?.(i.title)??i.title}`',
      ).trimEnd(),
      '',
    ].join('\n'),
  );

  const result = runPatchScript({ workbenchPath });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Patched VS Code terminal tab title breaks:/);
  const nextSource = fs.readFileSync(workbenchPath, 'utf8');
  assert.equal(nextSource.includes(strippedActivityPatchHelper), false);
  assert.equal(nextSource.includes(currentPatchHelper), true);
  assert.equal(
    nextSource.match(/Codex VS Code terminal tab title breaks patch/g).length,
    1,
  );
});

test('patch script upgrades the loading spinner title helper', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-terminal-title-breaks-test-'));
  const workbenchPath = path.join(tmpDir, 'workbench.desktop.main.js');
  fs.writeFileSync(
    workbenchPath,
    [
      '/* Codex VS Code terminal tab title breaks patch. Reapply with patch-vscode-terminal-tabs-title-breaks. */',
      loadingSpinPatchHelper,
      terminalTabsRenderer.replace(
        'u+=`$(${l}) ${i.title}`',
        'u+=`$(${l}) ${globalThis.__codexVscodeTerminalTabTitleBreaks?.(i.title)??i.title}`',
      ).trimEnd(),
      '',
    ].join('\n'),
  );

  const result = runPatchScript({ workbenchPath });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Patched VS Code terminal tab title breaks:/);
  const nextSource = fs.readFileSync(workbenchPath, 'utf8');
  assert.equal(nextSource.includes(loadingSpinPatchHelper), false);
  assert.equal(nextSource.includes(currentPatchHelper), true);
  assert.equal(nextSource.includes('$(loading~spin)'), false);
  assert.equal(
    nextSource.match(/Codex VS Code terminal tab title breaks patch/g).length,
    1,
  );
});

test('patch script supports the VS Code 1.127 terminal tab title renderer', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-terminal-title-breaks-test-'));
  const workbenchPath = path.join(tmpDir, 'workbench.desktop.main.js');
  fs.writeFileSync(workbenchPath, vscode127TerminalTabsRenderer);

  const result = runPatchScript({ workbenchPath });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Patched VS Code terminal tab title breaks:/);
  const nextSource = fs.readFileSync(workbenchPath, 'utf8');
  assert.equal(nextSource.includes('u+=`${i.title}`'), false);
  assert.equal(
    nextSource.includes(
      'u+=`${globalThis.__codexVscodeTerminalTabTitleBreaks?.(i.title)??i.title}`',
    ),
    true,
  );
  assert.equal(nextSource.includes(currentPatchHelper), true);
});

test('patch script normalizes duplicate title break helpers on an already patched renderer', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-terminal-title-breaks-test-'));
  const workbenchPath = path.join(tmpDir, 'workbench.desktop.main.js');
  fs.writeFileSync(
    workbenchPath,
    [
      '/* Codex VS Code terminal tab title breaks patch. Reapply with patch-vscode-terminal-tabs-title-breaks. */',
      simpleLineBreakPatchHelper,
      '/* Patched by codex-vscode-terminal-tools. Reapply with patch-vscode-terminal-order. */',
      '/* Codex VS Code terminal tab title breaks patch. Reapply with patch-vscode-terminal-tabs-title-breaks. */',
      oldSplitPatchHelper,
      vscode127TerminalTabsRenderer.replace(
        'u+=`${i.title}`',
        'u+=`${globalThis.__codexVscodeTerminalTabTitleBreaks?.(i.title)??i.title}`',
      ).trimEnd(),
      '',
    ].join('\n'),
  );

  const result = runPatchScript({ workbenchPath });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Patched VS Code terminal tab title breaks:/);
  const nextSource = fs.readFileSync(workbenchPath, 'utf8');
  assert.equal(nextSource.includes(simpleLineBreakPatchHelper), false);
  assert.equal(nextSource.includes(oldSplitPatchHelper), false);
  assert.equal(nextSource.includes(currentPatchHelper), true);
  assert.equal(
    nextSource.match(/Codex VS Code terminal tab title breaks patch/g).length,
    1,
  );
  assert.equal(
    nextSource.match(/__codexVscodeTerminalTabTitleBreaks/g).length,
    2,
  );
});

test('patch script fails closed when terminal tabs renderer marker is missing', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-terminal-title-breaks-test-'));
  const workbenchPath = path.join(tmpDir, 'workbench.desktop.main.js');
  fs.writeFileSync(workbenchPath, 'var other=class{renderElement(){}}\n');

  const result = runPatchScript({ workbenchPath });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Could not apply VS Code terminal tab title breaks patch safely/);
});
