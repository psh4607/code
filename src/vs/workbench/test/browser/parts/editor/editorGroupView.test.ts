/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { deepStrictEqual, strictEqual } from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { filterEditorTitleActions } from '../../../../browser/parts/editor/editorGroupView.js';

suite('EditorGroupView', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('filters configured editor title commands and empty groups', () => {
		const groups = [
			['navigation', [{ id: 'keep' }, { id: 'hide' }]],
			['secondary', [{ id: 'hide' }]],
		] as [string, Array<{ id: string }>][];

		deepStrictEqual(filterEditorTitleActions(groups, ['hide']), [
			['navigation', [{ id: 'keep' }]],
		]);
	});

	test('returns the original groups when no commands are configured', () => {
		const groups = [['navigation', [{ id: 'keep' }]]] as [string, Array<{ id: string }>][];
		strictEqual(filterEditorTitleActions(groups, undefined), groups);
	});
});
