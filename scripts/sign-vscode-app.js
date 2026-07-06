#!/usr/bin/env node

const { createManagedCodeAppPaths, signManagedCodeApp } = require('../src/managedCodeApp');

const appPath = process.env.VSCODE_SIGN_APP_PATH || createManagedCodeAppPaths().managedAppPath;
const paths = createManagedCodeAppPaths({ managedAppPath: appPath });

signManagedCodeApp({ paths });
console.log(`Signed VS Code app: ${appPath}`);
