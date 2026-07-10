/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { Disposable, DisposableStore, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';

const CompositionRecentThreshold = 180;
const CompositionQuietPeriod = 360;
const DeferredKeyRepeatThreshold = 200;
const DuplicateSequenceThreshold = 80;
const NativeLineBreakSuppressionDuration = 1400;
const SequenceDeadline = 1200;

type GuardedKeyKind = 'enter' | 'move' | undefined;
type QueuedTerminalSequence = '\x1B\n' | '\x1B\r';

export class TerminalImeGuard {
	private _isComposing = false;
	private _pendingDispatch: (() => void) | undefined;
	private _lastDeferredKeyTime = 0;
	private _lastCompositionActivityTime = 0;
	private _suppressNativeLineBreakUntil = 0;
	private _lastTerminalSequence: QueuedTerminalSequence | undefined;
	private _lastTerminalSequenceTime = 0;
	private readonly _installedWindows = new WeakSet<Window>();

	constructor(private readonly _now: () => number = () => Date.now()) { }

	install(targetWindow: Window): IDisposable {
		if (this._installedWindows.has(targetWindow)) {
			return Disposable.None;
		}
		this._installedWindows.add(targetWindow);

		const disposables = new DisposableStore();
		disposables.add(dom.addDisposableListener(targetWindow, 'compositionstart', () => this.markCompositionStart(), true));
		disposables.add(dom.addDisposableListener(targetWindow, 'compositionupdate', () => this.markCompositionActivity(), true));
		disposables.add(dom.addDisposableListener(targetWindow, 'compositionend', () => this.markCompositionEnd(), true));
		disposables.add(dom.addDisposableListener(targetWindow, 'input', () => this.markCompositionActivity(), true));
		disposables.add(dom.addDisposableListener(targetWindow, 'keydown', event => this._handleKeyDown(event), true));
		disposables.add(dom.addDisposableListener(targetWindow, 'beforeinput', event => this._handleBeforeInput(event), true));
		disposables.add(dom.addDisposableListener(targetWindow, 'keypress', event => this._handleKeyPress(event), true));
		disposables.add(dom.addDisposableListener(targetWindow, 'pagehide', () => this.reset(), true));
		disposables.add(toDisposable(() => this._installedWindows.delete(targetWindow)));
		return disposables;
	}

	markCompositionStart(): void {
		this._isComposing = true;
		this.markCompositionActivity();
	}

	markCompositionActivity(): void {
		this._lastCompositionActivityTime = this._now();
	}

	markCompositionEnd(): void {
		this._isComposing = false;
		this.markCompositionActivity();
	}

	reset(): void {
		this._isComposing = false;
		this._pendingDispatch = undefined;
		this._lastCompositionActivityTime = 0;
		this._suppressNativeLineBreakUntil = 0;
	}

	deferKeybinding(event: KeyboardEvent, dispatch: () => unknown): boolean | undefined {
		const keyKind = this._getGuardedKeyKind(event);
		const isTerminalEnter = keyKind === 'enter' && this._isTerminalEvent(event);
		if (!keyKind || (keyKind === 'enter' && !isTerminalEnter) || (keyKind === 'move' && !this._isCompositionRecent(event))) {
			return undefined;
		}

		if (keyKind === 'enter') {
			this._suppressNativeLineBreakUntil = this._now() + NativeLineBreakSuppressionDuration;
		}

		const now = this._now();
		if (this._pendingDispatch && now - this._lastDeferredKeyTime < DeferredKeyRepeatThreshold) {
			if (!isTerminalEnter) {
				event.preventDefault();
				event.stopImmediatePropagation();
			}
			return true;
		}
		this._lastDeferredKeyTime = now;

		if (!isTerminalEnter) {
			event.preventDefault();
			event.stopImmediatePropagation();
		}

		const targetDocument = (event.target as Node | null)?.ownerDocument ?? document;
		const activeElement = targetDocument.activeElement as HTMLElement | null;
		let didDispatch = false;
		const runDispatch = () => {
			if (didDispatch) {
				return;
			}
			didDispatch = true;
			this._pendingDispatch = undefined;
			setTimeout(() => {
				try {
					dispatch();
				} catch (error) {
					console.error('[terminal-ime-guard] Deferred keybinding failed', error);
				}
			}, 0);
		};
		this._pendingDispatch = runDispatch;
		targetDocument.addEventListener('compositionend', runDispatch, { capture: true, once: true });

		if (keyKind === 'enter') {
			const quietPeriodRemaining = CompositionQuietPeriod - (this._now() - this._lastCompositionActivityTime);
			setTimeout(runDispatch, Math.max(120, quietPeriodRemaining));
			return true;
		}

		setTimeout(runDispatch, 90);
		try {
			activeElement?.blur();
			setTimeout(() => {
				try {
					activeElement?.focus({ preventScroll: true });
				} catch {
					activeElement?.focus();
				}
			}, 0);
		} catch {
			// Ignore elements that cannot be blurred during composition.
		}
		return true;
	}

	suppressTerminalKey(event: KeyboardEvent, sendSequence?: () => void | Promise<void>): boolean {
		if (!this._isTerminalShiftEnter(event)) {
			return false;
		}

		const now = this._now();
		if (this._lastTerminalSequence === '\x1B\r' && now - this._lastTerminalSequenceTime < DuplicateSequenceThreshold) {
			this._suppressNativeLineBreakUntil = now + NativeLineBreakSuppressionDuration;
			return true;
		}

		this._rememberTerminalSequence('\x1B\r', now);
		if (sendSequence) {
			this._queueAfterComposition(sendSequence, 'Terminal Shift+Enter sequence failed');
		}
		return true;
	}

	queueTerminalSequence(sequence: string, sendSequence?: () => void | Promise<void>): boolean | undefined {
		if (sequence !== '\x1B\n' && sequence !== '\x1B\r') {
			return undefined;
		}

		const now = this._now();
		if (this._lastTerminalSequence === sequence && now - this._lastTerminalSequenceTime < DuplicateSequenceThreshold) {
			this._suppressNativeLineBreakUntil = now + NativeLineBreakSuppressionDuration;
			return true;
		}

		if (sequence === '\x1B\n') {
			this._rememberTerminalSequence(sequence, now);
			return true;
		}

		if (!sendSequence) {
			return undefined;
		}
		this._rememberTerminalSequence(sequence, now);
		this._queueAfterComposition(sendSequence, 'Queued terminal CR sequence failed');
		return true;
	}

	private _rememberTerminalSequence(sequence: QueuedTerminalSequence, now: number): void {
		this._lastTerminalSequence = sequence;
		this._lastTerminalSequenceTime = now;
		this._suppressNativeLineBreakUntil = now + NativeLineBreakSuppressionDuration;
	}

	private _queueAfterComposition(callback: () => void | Promise<void>, errorMessage: string): void {
		const deadline = this._now() + SequenceDeadline;
		let didRun = false;
		const run = () => {
			if (didRun) {
				return;
			}
			const now = this._now();
			const quietPeriodRemaining = Math.max(0, CompositionQuietPeriod - (now - this._lastCompositionActivityTime));
			if ((!this._isComposing && quietPeriodRemaining === 0) || now >= deadline) {
				didRun = true;
				try {
					Promise.resolve(callback()).catch(error => console.error(`[terminal-ime-guard] ${errorMessage}`, error));
				} catch (error) {
					console.error(`[terminal-ime-guard] ${errorMessage}`, error);
				}
				return;
			}
			setTimeout(run, Math.min(quietPeriodRemaining || 60, 120));
		};
		run();
	}

	private _getGuardedKeyKind(event: KeyboardEvent): GuardedKeyKind {
		if (event.key === 'Enter' && event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey) {
			return 'enter';
		}
		if (event.metaKey && !event.ctrlKey && !event.altKey && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
			return 'move';
		}
		return undefined;
	}

	private _isComposingEvent(event: KeyboardEvent): boolean {
		return this._isComposing || event.isComposing || event.key === 'Process' || event.keyCode === 229;
	}

	private _isCompositionRecent(event: KeyboardEvent): boolean {
		return this._isComposingEvent(event) || this._now() - this._lastCompositionActivityTime < CompositionRecentThreshold;
	}

	private _isTerminalEvent(event: Event): boolean {
		const target = event.target as HTMLElement | null;
		return !!(target?.classList?.contains('xterm-helper-textarea') || target?.closest?.('.xterm'));
	}

	private _isTerminalShiftEnter(event: KeyboardEvent): boolean {
		return this._getGuardedKeyKind(event) === 'enter' && this._isTerminalEvent(event);
	}

	private _handleKeyDown(event: KeyboardEvent): void {
		if (this._isTerminalShiftEnter(event) && !event.defaultPrevented) {
			this._suppressNativeLineBreakUntil = this._now() + NativeLineBreakSuppressionDuration;
		}
	}

	private _handleBeforeInput(event: InputEvent): void {
		if (this._now() < this._suppressNativeLineBreakUntil &&
			(event.inputType === 'insertLineBreak' || event.inputType === 'insertParagraph' || event.data === '\n' || event.data === '\r')) {
			event.preventDefault();
			event.stopImmediatePropagation();
		}
	}

	private _handleKeyPress(event: KeyboardEvent): void {
		if (this._now() < this._suppressNativeLineBreakUntil && event.key === 'Enter') {
			event.preventDefault();
			event.stopImmediatePropagation();
		}
	}
}

export const terminalImeGuard = new TerminalImeGuard();
