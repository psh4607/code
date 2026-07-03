#!/usr/bin/env node

const { checkHostConfig, createDefaultPaths } = require('../src/hostConfig');

const json = process.argv.includes('--json');
const paths = createDefaultPaths();
const statuses = checkHostConfig({ paths });
const ok = statuses.every((status) => status.ok);

if (json) {
  console.log(JSON.stringify({ ok, statuses }, null, 2));
} else {
  for (const status of statuses) {
    console.log(`${status.ok ? 'ok' : 'missing'} ${status.id}: ${status.detail}`);
  }
}

process.exit(ok ? 0 : 1);
