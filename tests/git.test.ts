import { describe, expect, test } from 'bun:test';
import { GitError } from '@/utils/errors';
import * as git from '@/utils/git';

describe('git utilities', () => {
	describe('execGit', () => {
		test('executes git version command successfully', async () => {
			const result = await git.execGit(['--version']);

			expect(result.error).toBeNull();
			expect(result.data).toBeDefined();
			expect(result.data?.exitCode).toBe(0);
			expect(result.data?.stdout).toContain('git version');
		});

		test('handles invalid git command', async () => {
			const result = await git.execGit(['invalid-command-xyz']);

			expect(result.error).toBeInstanceOf(GitError);
			expect(result.data).toBeNull();
		});
	});
});
