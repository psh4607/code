const assert = require('node:assert/strict');
const test = require('node:test');

const { createAgentNotificationManager } = require('../src/agentNotificationManager');

function event(overrides = {}) {
  return {
    schemaVersion: 1,
    id: 'event-1',
    provider: 'codex',
    event: 'turn_finished',
    severity: 'success',
    sessionId: 'session-1',
    cwd: '/tmp/project',
    terminalPid: 1234,
    title: 'Codex finished',
    createdAt: 1000,
    dedupeKey: 'codex:session-1:turn_finished',
    source: { hookEventName: 'Stop' },
    ...overrides,
  };
}

function createFakeVscode({ activeTerminal, terminals = [] } = {}) {
  const statusBarItems = [];
  const informationMessages = [];
  const quickPicks = [];
  const globalStateValues = new Map();
  const globalStateUpdates = [];

  return {
    statusBarItems,
    informationMessages,
    quickPicks,
    globalStateValues,
    globalStateUpdates,
    vscode: {
      StatusBarAlignment: { Left: 1 },
      window: {
        activeTerminal,
        terminals,
        state: { focused: false },
        createStatusBarItem(alignment, priority) {
          const item = {
            alignment,
            priority,
            text: '',
            tooltip: '',
            command: undefined,
            visible: false,
            disposed: false,
            show() {
              this.visible = true;
            },
            hide() {
              this.visible = false;
            },
            dispose() {
              this.disposed = true;
            },
          };
          statusBarItems.push(item);
          return item;
        },
        async showInformationMessage(message, ...items) {
          informationMessages.push({ message, items });
          return undefined;
        },
        async showQuickPick(items) {
          quickPicks.push(items);
          return undefined;
        },
      },
    },
    context: {
      globalState: {
        get(key, defaultValue) {
          return globalStateValues.has(key) ? globalStateValues.get(key) : defaultValue;
        },
        async update(key, value) {
          globalStateValues.set(key, value);
          globalStateUpdates.push({ key, value });
        },
      },
    },
  };
}

function terminalWithPid(pid) {
  return {
    processId: Promise.resolve(pid),
    shown: false,
    show(preserveFocus) {
      this.preserveFocus = preserveFocus;
      this.shown = true;
    },
  };
}

test('manager polls JSONL events, updates status bar, and presents new unread notifications', async () => {
  const fake = createFakeVscode();
  const manager = createAgentNotificationManager(fake.vscode, {
    eventsPath: '/tmp/events.jsonl',
    pollIntervalMs: 0,
    readFile: () => `${JSON.stringify(event())}\n`,
  });

  manager.start();
  await manager.flush();

  assert.equal(fake.statusBarItems[0].text, 'Codex: 1');
  assert.equal(fake.statusBarItems[0].visible, true);
  assert.equal(fake.statusBarItems[0].command, 'codexTerminal.showAgentNotifications');
  assert.deepEqual(fake.informationMessages.map((message) => message.message), [
    'Complete - Codex finished\n/tmp/project - session session-1',
  ]);
});

test('manager does not present the same event twice across polls', async () => {
  const fake = createFakeVscode();
  const source = `${JSON.stringify(event())}\n`;
  const manager = createAgentNotificationManager(fake.vscode, {
    eventsPath: '/tmp/events.jsonl',
    pollIntervalMs: 0,
    readFile: () => source,
  });

  manager.start();
  await manager.flush();
  await manager.flush();

  assert.equal(fake.informationMessages.length, 1);
  assert.equal(fake.statusBarItems[0].text, 'Codex: 1');
});

test('manager opens the latest unread matching terminal by process id and marks it read', async () => {
  const terminal = terminalWithPid(1234);
  const fake = createFakeVscode({ terminals: [terminal] });
  const manager = createAgentNotificationManager(fake.vscode, {
    eventsPath: '/tmp/events.jsonl',
    pollIntervalMs: 0,
    readFile: () => `${JSON.stringify(event())}\n`,
  });

  manager.start();
  await manager.flush();

  assert.equal(await manager.openLatestAgentNotification(), true);
  assert.equal(terminal.shown, true);
  assert.equal(terminal.preserveFocus, false);
  assert.equal(fake.statusBarItems[0].visible, false);
});

test('manager opens the matching Codex session terminal from the session registry when event pid is missing', async () => {
  const terminal = terminalWithPid(4321);
  const fake = createFakeVscode({ terminals: [terminal] });
  const manager = createAgentNotificationManager(fake.vscode, {
    context: fake.context,
    eventsPath: '/tmp/events.jsonl',
    pollIntervalMs: 0,
    readFile: () => `${JSON.stringify(event({ terminalPid: undefined }))}\n`,
    readSessionRegistry: () => ({
      version: 1,
      records: [
        {
          sessionId: 'session-1',
          terminalPid: 4321,
          cwd: '/tmp/project',
          hookEventName: 'SessionStart',
          updatedAt: 900,
        },
      ],
    }),
  });

  manager.start();
  await manager.flush();

  assert.equal(await manager.openLatestAgentNotification(), true);
  assert.equal(terminal.shown, true);
  assert.equal(terminal.preserveFocus, false);
  assert.equal(fake.statusBarItems[0].visible, false);
});

test('manager falls back to the Codex session registry when the event pid is stale', async () => {
  const terminal = terminalWithPid(4321);
  const fake = createFakeVscode({ terminals: [terminal] });
  const manager = createAgentNotificationManager(fake.vscode, {
    context: fake.context,
    eventsPath: '/tmp/events.jsonl',
    pollIntervalMs: 0,
    readFile: () => `${JSON.stringify(event({ terminalPid: 1111 }))}\n`,
    readSessionRegistry: () => ({
      version: 1,
      records: [
        {
          sessionId: 'session-1',
          terminalPid: 4321,
          cwd: '/tmp/project',
          hookEventName: 'SessionStart',
          updatedAt: 900,
        },
      ],
    }),
  });

  manager.start();
  await manager.flush();

  assert.equal(await manager.openLatestAgentNotification(), true);
  assert.equal(terminal.shown, true);
  assert.equal(terminal.preserveFocus, false);
});

test('manager quick pick lists recent records and clear removes status', async () => {
  const fake = createFakeVscode();
  const manager = createAgentNotificationManager(fake.vscode, {
    eventsPath: '/tmp/events.jsonl',
    pollIntervalMs: 0,
    readFile: () => `${JSON.stringify(event({ body: 'Ready' }))}\n`,
  });

  manager.start();
  await manager.flush();
  await manager.showAgentNotifications();
  assert.equal(fake.quickPicks[0][0].label, 'Codex finished');
  assert.equal(fake.quickPicks[0][0].description, 'Ready');
  assert.equal(fake.quickPicks[0][0].detail, 'Complete - /tmp/project - session session-1');

  assert.equal(manager.clearAgentNotifications(), 1);
  assert.equal(fake.statusBarItems[0].visible, false);
});

test('manager formats rich notification messages with status, project, and action detail', async () => {
  const fake = createFakeVscode();
  const manager = createAgentNotificationManager(fake.vscode, {
    eventsPath: '/tmp/events.jsonl',
    pollIntervalMs: 0,
    readFile: () => `${JSON.stringify(event({
      event: 'permission_requested',
      severity: 'waiting',
      title: 'Codex needs permission',
      subtitle: 'project',
      body: 'Bash: npm test',
      source: { hookEventName: 'PermissionRequest', toolName: 'Bash' },
    }))}\n`,
  });

  manager.start();
  await manager.flush();

  assert.deepEqual(fake.informationMessages.map((message) => message.message), [
    'Request - project - Codex needs permission\nBash: npm test',
  ]);
  assert.match(fake.statusBarItems[0].tooltip, /Request - project - Codex needs permission/);
  assert.match(fake.statusBarItems[0].tooltip, /Bash: npm test/);
});

test('manager restores unread records from global state without replaying seen events', async () => {
  const storedRecord = {
    ...event(),
    isRead: false,
    isPresented: true,
  };
  const fake = createFakeVscode();
  fake.globalStateValues.set('codexTerminal.agentNotifications.records', [storedRecord]);
  fake.globalStateValues.set('codexTerminal.agentNotifications.seenEventIds', ['event-1']);

  const manager = createAgentNotificationManager(fake.vscode, {
    context: fake.context,
    eventsPath: '/tmp/events.jsonl',
    pollIntervalMs: 0,
    readFile: () => `${JSON.stringify(event())}\n`,
  });

  manager.start();
  await manager.flush();

  assert.equal(fake.statusBarItems[0].text, 'Codex: 1');
  assert.equal(fake.statusBarItems[0].visible, true);
  assert.equal(fake.informationMessages.length, 0);
});

test('manager persists records and seen event ids as notifications change', async () => {
  const fake = createFakeVscode();
  const manager = createAgentNotificationManager(fake.vscode, {
    context: fake.context,
    eventsPath: '/tmp/events.jsonl',
    pollIntervalMs: 0,
    readFile: () => `${JSON.stringify(event())}\n`,
  });

  manager.start();
  await manager.flush();
  assert.deepEqual(fake.globalStateValues.get('codexTerminal.agentNotifications.seenEventIds'), [
    'event-1',
  ]);
  assert.equal(fake.globalStateValues.get('codexTerminal.agentNotifications.records')[0].id, 'event-1');

  manager.markAgentNotificationsRead();

  assert.equal(fake.globalStateValues.get('codexTerminal.agentNotifications.records')[0].isRead, true);
});
