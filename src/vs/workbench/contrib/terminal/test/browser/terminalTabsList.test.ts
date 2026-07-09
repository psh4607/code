/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { strictEqual } from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { formatTerminalTabTitle } from '../../browser/terminalTabsList.js';

suite('terminalTabsList', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	suite('formatTerminalTabTitle', () => {
		test('leaves titles without separators unchanged', () => {
			strictEqual(formatTerminalTabTitle('workspace root'), 'workspace root');
		});

		test('formats pipe-separated title segments as separate lines', () => {
			strictEqual(
				formatTerminalTabTitle('workspace root | feature branch | running tests'),
				'workspace\u00a0root\nfeature\u00a0branch\nrunning\u00a0tests'
			);
		});

		test('filters empty pipe-separated segments', () => {
			strictEqual(formatTerminalTabTitle(' workspace | | task '), 'workspace\ntask');
		});

		test('preserves leading terminal activity markers', () => {
			strictEqual(
				formatTerminalTabTitle('\u280b | codex-vscode-terminal... | 019f45c0-b7bb'),
				'\u280b\u00a0codex-vscode-terminal...\n019f45c0-b7bb'
			);
			strictEqual(
				formatTerminalTabTitle('\u280b codex-vscode-terminal... | 019f45c0-b7bb'),
				'\u280b\u00a0codex-vscode-terminal...\n019f45c0-b7bb'
			);
		});
	});
});
