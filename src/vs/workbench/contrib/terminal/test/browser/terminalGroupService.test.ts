/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { deepStrictEqual, strictEqual } from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { moveTerminalGroupAfter } from '../../browser/terminalGroupService.js';

suite('TerminalGroupService', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('moves a new group directly after the active group', () => {
		const groups = ['first', 'active', 'third', 'new'];
		strictEqual(moveTerminalGroupAfter(groups, 'new', 'active'), true);
		deepStrictEqual(groups, ['first', 'active', 'new', 'third']);
	});

	test('moves a group forward relative to its original position', () => {
		const groups = ['new', 'first', 'target', 'last'];
		strictEqual(moveTerminalGroupAfter(groups, 'new', 'target'), true);
		deepStrictEqual(groups, ['first', 'target', 'new', 'last']);
	});

	test('does not report a move when the group is already adjacent', () => {
		const groups = ['first', 'target', 'new', 'last'];
		strictEqual(moveTerminalGroupAfter(groups, 'new', 'target'), false);
		deepStrictEqual(groups, ['first', 'target', 'new', 'last']);
	});
});
