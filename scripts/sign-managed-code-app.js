#!/usr/bin/env node

const { createManagedCodeAppPaths, signManagedCodeApp } = require('../src/managedCodeApp');

const paths = createManagedCodeAppPaths();
signManagedCodeApp({ paths });
console.log(`Signed managed Code.app: ${paths.managedAppPath}`);
