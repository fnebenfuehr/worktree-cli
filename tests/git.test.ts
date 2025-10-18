import { describe, expect, test } from 'bun:test';
import { GitError } from '@/utils/errors';
import * as git from '@/utils/git';

describe('git utilities', () => {
	describe('execGit', () => {
		test('executes git version command successfully', async () => {
			const result = await git.execGit(['--version']);

			expect(result.exitCode).toBe(0);
			expect(result.stdout).toContain('git version');
		});

		test('handles invalid git command', async () => {
			await expect(git.execGit(['invalid-command-xyz'])).rejects.toThrow(GitError);
		});
	});
});
