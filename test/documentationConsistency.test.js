const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const projectRoot = path.resolve(__dirname, '..');

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');
}

test('README documents the current host-management surfaces and patch wrapper scope', () => {
  const readme = readProjectFile('README.md');

  assert.equal(readme.includes('macOS notification bridge app'), true);
  assert.equal(readme.includes('The global wrapper runs the full local patch sequence'), true);
  assert.equal(readme.includes('The global wrapper now refreshes `/Applications/Code.app`'), false);
});

test('README documents title-hidden Codex session resume through the hook registry', () => {
  const readme = readProjectFile('README.md');

  assert.equal(readme.includes('visible `thread-id`'), false);
  assert.equal(readme.includes('SessionStart hook registry'), true);
  assert.equal(readme.includes('stored startup restore records'), true);
});

test('AGENTS documents current Codex title and restore guardrails', () => {
  const agents = readProjectFile('AGENTS.md');

  assert.equal(agents.includes('tabs expose `thread-id`'), false);
  assert.equal(agents.includes('visible `thread-id`'), false);
  assert.equal(agents.includes('SessionStart hook registry'), true);
  assert.equal(agents.includes('cwd-only matching disabled'), false);
  assert.equal(agents.includes('startup-window and saved-session guards'), true);
});

test('Codex session auto-resume design matches title-hidden hook registry implementation', () => {
  const spec = readProjectFile(
    'docs/superpowers/specs/2026-07-03-codex-session-auto-resume-design.md',
  );

  assert.equal(spec.includes('configured with `thread-id`'), false);
  assert.equal(spec.includes('SessionStart hook registry'), true);
  assert.equal(spec.includes('stored startup restore records'), true);
  assert.equal(spec.includes('arbitrary cwd-only terminals'), true);
});
