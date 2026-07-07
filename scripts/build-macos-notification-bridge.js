#!/usr/bin/env node

const {
  createDefaultPaths,
} = require('../src/hostConfig');
const {
  ensureMacosNotificationBridge,
} = require('../src/macosNotificationBridge');

const paths = createDefaultPaths();
const result = ensureMacosNotificationBridge({
  appPath: paths.macosNotificationBridgeAppPath,
  projectRoot: paths.projectRoot,
});

console.log(`${result.changed ? 'updated' : 'ok'} macosNotificationBridge: ${result.detail}`);
