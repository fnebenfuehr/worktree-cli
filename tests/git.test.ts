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

	describe('gitFetchRemoteBranch', () => {
		test('throws GitError when fetching non-existent branch', async () => {
			await expect(git.gitFetchRemoteBranch('non-existent-branch-xyz-123')).rejects.toThrow(
				GitError
			);
		});

		test('error message contains branch name', async () => {
			try {
				await git.gitFetchRemoteBranch('non-existent-branch-xyz-123');
			} catch (error) {
				expect(error).toBeInstanceOf(GitError);
				expect((error as GitError).message).toContain('non-existent-branch-xyz-123');
			}
		});
	});

	describe('gitSetUpstreamTracking', () => {
		test('throws GitError for non-existent branch', async () => {
			await expect(
				git.gitSetUpstreamTracking('non-existent-branch', 'origin/non-existent')
			).rejects.toThrow(GitError);
		});

		test('error message contains branch and upstream names', async () => {
			try {
				await git.gitSetUpstreamTracking('test-branch', 'origin/test-upstream');
			} catch (error) {
				expect(error).toBeInstanceOf(GitError);
				expect((error as GitError).message).toContain('test-branch');
				expect((error as GitError).message).toContain('origin/test-upstream');
			}
		});
	});

	describe('gitCreateBranch', () => {
		test('handles origin/ prefix in baseBranch correctly', async () => {
			// This should fail because origin/non-existent doesn't exist,
			// but it should try to use it directly (not fetch origin/origin/non-existent)
			try {
				await git.gitCreateBranch('new-branch', 'origin/non-existent-ref');
			} catch (error) {
				expect(error).toBeInstanceOf(GitError);
				// Verify error message shows the correct ref (not origin/origin/)
				expect((error as GitError).message).toContain('origin/non-existent-ref');
				expect((error as GitError).message).not.toContain('origin/origin/');
			}
		});
	});
});
