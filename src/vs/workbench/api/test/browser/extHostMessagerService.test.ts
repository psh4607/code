/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CodexCloseNotificationPrefix, CodexNotificationSourceId, CodexReplaceNotificationPrefix, MainThreadMessageService } from '../../browser/mainThreadMessageService.js';
import { IDialogService, IPrompt, IPromptButton } from '../../../../platform/dialogs/common/dialogs.js';
import { INotificationService, INotification, NoOpNotification, INotificationHandle, Severity, IPromptChoice, IPromptOptions, IStatusMessageOptions, INotificationSource, INotificationSourceFilter, NotificationsFilter, IStatusHandle, NotificationPriority } from '../../../../platform/notification/common/notification.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { mock } from '../../../../base/test/common/mock.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { TestDialogService } from '../../../../platform/dialogs/test/common/testDialogService.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { TestExtensionService } from '../../../test/common/workbenchTestServices.js';
import { ExtensionIdentifier } from '../../../../platform/extensions/common/extensions.js';

const emptyCommandService: ICommandService = {
	_serviceBrand: undefined,
	onWillExecuteCommand: () => Disposable.None,
	onDidExecuteCommand: () => Disposable.None,
	executeCommand: (commandId: string, ...args: unknown[]): Promise<any> => {
		return Promise.resolve(undefined);
	}
};

const emptyNotificationService = new class implements INotificationService {
	declare readonly _serviceBrand: undefined;
	readonly onDidChangeFilter: Event<void> = Event.None;
	notify(...args: unknown[]): never {
		throw new Error('not implemented');
	}
	info(...args: unknown[]): never {
		throw new Error('not implemented');
	}
	warn(...args: unknown[]): never {
		throw new Error('not implemented');
	}
	error(...args: unknown[]): never {
		throw new Error('not implemented');
	}
	prompt(severity: Severity, message: string, choices: IPromptChoice[], options?: IPromptOptions): INotificationHandle {
		throw new Error('not implemented');
	}
	status(message: string | Error, options?: IStatusMessageOptions): IStatusHandle {
		return { close: () => { } };
	}
	setFilter(): void {
		throw new Error('not implemented');
	}
	getFilter(source?: INotificationSource | undefined): NotificationsFilter {
		throw new Error('not implemented');
	}
	getFilters(): INotificationSourceFilter[] {
		throw new Error('not implemented');
	}
	removeFilter(sourceId: string): void {
		throw new Error('not implemented');
	}
};

class EmptyNotificationService implements INotificationService {
	declare readonly _serviceBrand: undefined;
	filter: boolean = false;
	constructor(private withNotify: (notification: INotification) => void) {
	}

	readonly onDidChangeFilter: Event<void> = Event.None;
	notify(notification: INotification): INotificationHandle {
		this.withNotify(notification);

		return new NoOpNotification();
	}
	info(message: any): void {
		throw new Error('Method not implemented.');
	}
	warn(message: any): void {
		throw new Error('Method not implemented.');
	}
	error(message: any): void {
		throw new Error('Method not implemented.');
	}
	prompt(severity: Severity, message: string, choices: IPromptChoice[], options?: IPromptOptions): INotificationHandle {
		throw new Error('Method not implemented');
	}
	status(message: string, options?: IStatusMessageOptions): IStatusHandle {
		return { close: () => { } };
	}
	setFilter(): void {
		throw new Error('Method not implemented.');
	}
	getFilter(source?: INotificationSource | undefined): NotificationsFilter {
		throw new Error('Method not implemented.');
	}
	getFilters(): INotificationSourceFilter[] {
		throw new Error('Method not implemented.');
	}
	removeFilter(sourceId: string): void {
		throw new Error('Method not implemented.');
	}
}

class TestNotificationHandle extends NoOpNotification {
	private readonly _onDidClose = new Emitter<void>();
	override readonly onDidClose = this._onDidClose.event;
	closed = false;

	override close(): void {
		if (!this.closed) {
			this.closed = true;
			this._onDidClose.fire();
		}
	}
}

class RecordingNotificationService extends EmptyNotificationService {
	readonly notifications: INotification[] = [];
	readonly handles: TestNotificationHandle[] = [];

	constructor() {
		super(() => { });
	}

	override notify(notification: INotification): INotificationHandle {
		const handle = new TestNotificationHandle();
		this.notifications.push(notification);
		this.handles.push(handle);
		return handle;
	}
}

suite('ExtHostMessageService', function () {

	test('propagte handle on select', async function () {

		const service = new MainThreadMessageService(null!, new EmptyNotificationService(notification => {
			assert.strictEqual(notification.actions!.primary!.length, 1);
			queueMicrotask(() => notification.actions!.primary![0].run());
		}), emptyCommandService, new TestDialogService(), new TestExtensionService());

		const handle = await service.$showMessage(1, 'h', {}, [{ handle: 42, title: 'a thing', isCloseAffordance: true }]);
		assert.strictEqual(handle, 42);

		service.dispose();
	});

	test('keeps codex extension notifications sticky and replaceable', async function () {
		const notificationService = new RecordingNotificationService();
		const service = new MainThreadMessageService(null!, notificationService, emptyCommandService, new TestDialogService(), new TestExtensionService());
		const source = { identifier: new ExtensionIdentifier(CodexNotificationSourceId), label: 'Codex' };

		const first = service.$showMessage(Severity.Info, `${CodexReplaceNotificationPrefix}session%3A1\x1FFirst`, { source }, []);
		await Promise.resolve();

		assert.strictEqual(notificationService.notifications.length, 1);
		assert.strictEqual(notificationService.notifications[0].message, 'First');
		assert.strictEqual(notificationService.notifications[0].sticky, true);
		assert.strictEqual(notificationService.notifications[0].priority, NotificationPriority.URGENT);

		const second = service.$showMessage(Severity.Info, `${CodexReplaceNotificationPrefix}session%3A1\x1FSecond`, { source }, []);
		await Promise.resolve();

		assert.strictEqual(notificationService.notifications.length, 2);
		assert.strictEqual(notificationService.notifications[1].message, 'Second');
		assert.strictEqual(notificationService.handles[0].closed, true);
		assert.strictEqual(await first, undefined);

		notificationService.handles[1].close();
		assert.strictEqual(await second, undefined);

		service.dispose();
	});

	test('closes codex replaceable notifications without showing a new notification', async function () {
		const notificationService = new RecordingNotificationService();
		const service = new MainThreadMessageService(null!, notificationService, emptyCommandService, new TestDialogService(), new TestExtensionService());
		const source = { identifier: new ExtensionIdentifier(CodexNotificationSourceId), label: 'Codex' };

		const shown = service.$showMessage(Severity.Info, `${CodexReplaceNotificationPrefix}session%3A2\x1FVisible`, { source }, []);
		await Promise.resolve();

		const closed = service.$showMessage(Severity.Info, `${CodexCloseNotificationPrefix}session%3A2\x1F`, { source }, []);
		await Promise.resolve();

		assert.strictEqual(notificationService.notifications.length, 1);
		assert.strictEqual(notificationService.handles[0].closed, true);
		assert.strictEqual(await shown, undefined);
		assert.strictEqual(await closed, undefined);

		service.dispose();
	});

	suite('modal', () => {
		test('calls dialog service', async () => {
			const service = new MainThreadMessageService(null!, emptyNotificationService, emptyCommandService, new class extends mock<IDialogService>() {
				override prompt({ type, message, buttons, cancelButton }: IPrompt<any>) {
					assert.strictEqual(type, 1);
					assert.strictEqual(message, 'h');
					assert.strictEqual(buttons!.length, 1);
					assert.strictEqual((cancelButton as IPromptButton<unknown>)!.label, 'Cancel');
					return Promise.resolve({ result: buttons![0].run({ checkboxChecked: false }) });
				}
			} as IDialogService, new TestExtensionService());

			const handle = await service.$showMessage(1, 'h', { modal: true }, [{ handle: 42, title: 'a thing', isCloseAffordance: false }]);
			assert.strictEqual(handle, 42);

			service.dispose();
		});

		test('returns undefined when cancelled', async () => {
			const service = new MainThreadMessageService(null!, emptyNotificationService, emptyCommandService, new class extends mock<IDialogService>() {
				override prompt(prompt: IPrompt<any>) {
					return Promise.resolve({ result: (prompt.cancelButton as IPromptButton<unknown>)!.run({ checkboxChecked: false }) });
				}
			} as IDialogService, new TestExtensionService());

			const handle = await service.$showMessage(1, 'h', { modal: true }, [{ handle: 42, title: 'a thing', isCloseAffordance: false }]);
			assert.strictEqual(handle, undefined);

			service.dispose();
		});

		test('hides Cancel button when not needed', async () => {
			const service = new MainThreadMessageService(null!, emptyNotificationService, emptyCommandService, new class extends mock<IDialogService>() {
				override prompt({ type, message, buttons, cancelButton }: IPrompt<any>) {
					assert.strictEqual(buttons!.length, 0);
					assert.ok(cancelButton);
					return Promise.resolve({ result: (cancelButton as IPromptButton<unknown>).run({ checkboxChecked: false }) });
				}
			} as IDialogService, new TestExtensionService());

			const handle = await service.$showMessage(1, 'h', { modal: true }, [{ handle: 42, title: 'a thing', isCloseAffordance: true }]);
			assert.strictEqual(handle, 42);

			service.dispose();
		});
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});
