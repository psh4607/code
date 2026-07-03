#!/usr/bin/env node

const childProcess = require('node:child_process');
const { applyHostConfig, checkHostConfig, createDefaultPaths } = require('../src/hostConfig');

const paths = createDefaultPaths();
const results = applyHostConfig({ paths });

for (const result of results) {
  console.log(`${result.changed ? 'updated' : 'ok'} ${result.id}`);
}

childProcess.execFileSync('npm', ['run', 'patch'], {
  cwd: paths.projectRoot,
  stdio: 'inherit',
});

const statuses = checkHostConfig({ paths });
const ok = statuses.every((status) => status.ok);

for (const status of statuses) {
  console.log(`${status.ok ? 'ok' : 'missing'} ${status.id}: ${status.detail}`);
}

process.exit(ok ? 0 : 1);
