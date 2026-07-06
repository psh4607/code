#!/usr/bin/env node

const { createDefaultPaths } = require('../src/hostConfig');
const { ensureManagedCodeApp } = require('../src/managedCodeApp');

const paths = createDefaultPaths();
const result = ensureManagedCodeApp({ paths: paths.managedCodeAppPaths });

console.log(`${result.changed ? 'updated' : 'ok'} managedCodeApp: ${result.reason}`);
