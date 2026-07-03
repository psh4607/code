const assert = require('node:assert/strict');
const test = require('node:test');
const { buildRenameSubmission } = require('../src/renameSequence');

test('buildRenameSubmission trims surrounding whitespace', () => {
  assert.deepEqual(buildRenameSubmission('  INF-938 metric cells  '), {
    command: '/rename',
    name: 'INF-938 metric cells',
  });
});

test('buildRenameSubmission rejects blank names', () => {
  assert.equal(buildRenameSubmission('   '), undefined);
});
