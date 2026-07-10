/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { strictEqual } from 'assert';
import { mainWindow } from '../../../../../base/browser/window.js';
import { timeout } from '../../../../../base/common/async.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TerminalImeGuard } from '../../browser/terminalImeGuard.js';

function createKeyboardEvent(target: HTMLElement, init: KeyboardEventInit): KeyboardEvent {
	const event = new KeyboardEvent('keydown', { ...init, cancelable: true });
	Object.defineProperty(event, 'target', { value: target });
	return event;
}

function createTerminalKeyEvent(): KeyboardEvent {
	const textarea = document.createElement('textarea');
	textarea.classList.add('xterm-helper-textarea');
	return createKeyboardEvent(textarea, { key: 'Enter', shiftKey: true });
}

suite('TerminalImeGuard', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('queues exactly one managed terminal Shift+Enter sequence', () => {
		let now = 10_000;
		const guard = new TerminalImeGuard(() => now);
		let sendCount = 0;

		strictEqual(guard.suppressTerminalKey(createTerminalKeyEvent(), () => { sendCount++; }), true);
		strictEqual(sendCount, 1);

		now += 20;
		strictEqual(guard.suppressTerminalKey(createTerminalKeyEvent(), () => { sendCount++; }), true);
		strictEqual(sendCount, 1);
	});

	test('drops LF sendSequence and queues CR sendSequence', () => {
		let now = 10_000;
		const guard = new TerminalImeGuard(() => now);
		let sendCount = 0;

		strictEqual(guard.queueTerminalSequence('\x1B\n', () => { sendCount++; }), true);
		strictEqual(sendCount, 0);

		now += 100;
		strictEqual(guard.queueTerminalSequence('\x1B\r', () => { sendCount++; }), true);
		strictEqual(sendCount, 1);
		strictEqual(guard.queueTerminalSequence('echo test', () => { sendCount++; }), undefined);
		strictEqual(sendCount, 1);
	});

	test('defers command-arrow keybindings during recent composition', async () => {
		let now = 10_000;
		const guard = new TerminalImeGuard(() => now);
		guard.markCompositionActivity();
		const target = document.createElement('button');
		const event = createKeyboardEvent(target, { key: 'ArrowLeft', metaKey: true });
		let dispatchCount = 0;

		strictEqual(guard.deferKeybinding(event, () => dispatchCount++), true);
		strictEqual(event.defaultPrevented, true);
		document.dispatchEvent(new CompositionEvent('compositionend'));
		await timeout(5);
		strictEqual(dispatchCount, 1);

		now += 200;
		const staleEvent = createKeyboardEvent(target, { key: 'ArrowLeft', metaKey: true });
		strictEqual(guard.deferKeybinding(staleEvent, () => dispatchCount++), undefined);
	});

	test('suppresses native line break input after terminal Shift+Enter', () => {
		const guard = new TerminalImeGuard(() => 10_000);
		const installation = guard.install(mainWindow);
		const textarea = document.createElement('textarea');
		textarea.classList.add('xterm-helper-textarea');
		document.body.appendChild(textarea);

		textarea.dispatchEvent(new KeyboardEvent('keydown', {
			key: 'Enter',
			shiftKey: true,
			bubbles: true,
			cancelable: true,
		}));
		const beforeInputEvent = new InputEvent('beforeinput', {
			inputType: 'insertLineBreak',
			data: '\n',
			bubbles: true,
			cancelable: true,
		});
		textarea.dispatchEvent(beforeInputEvent);

		strictEqual(beforeInputEvent.defaultPrevented, true);
		textarea.remove();
		installation.dispose();
	});

	test('does not intercept Shift+Enter outside the terminal', () => {
		const guard = new TerminalImeGuard(() => 10_000);
		const event = createKeyboardEvent(document.createElement('button'), { key: 'Enter', shiftKey: true });
		strictEqual(guard.suppressTerminalKey(event), false);
		strictEqual(guard.deferKeybinding(event, () => undefined), undefined);
	});
});
