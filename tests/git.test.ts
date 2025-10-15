import { describe, expect, spyOn, test } from 'bun:test';
import { GitError } from '@/utils/errors';
import * as git from '@/utils/git';

describe('git utilities', () => {
	describe('execGit', () => {
		test('executes git version command successfully', async () => {
			const result = await git.execGit(['--version']);

			expect(result.success).toBe(true);
			expect(result.exitCode).toBe(0);
			expect(result.stdout).toContain('git version');
		});

		test('handles invalid git command', async () => {
			const result = await git.execGit(['invalid-command-xyz']);

			expect(result.success).toBe(false);
			expect(result.exitCode).not.toBe(0);
		});
	});

	describe('addWorktree error messages', () => {
		test('parses "already exists" error', async () => {
			const spy = spyOn(git, 'execGit').mockResolvedValue({
				success: false,
				stdout: '',
				stderr: "fatal: 'feature-login' already exists",
				exitCode: 128,
			});

			try {
				await git.addWorktree('feature-login', 'feature/login');
				expect(false).toBe(true); // Should not reach here
			} catch (error) {
				expect(error).toBeInstanceOf(GitError);
				expect((error as GitError).message).toContain('Directory already exists');
				expect((error as GitError).message).not.toContain('fatal:');
			}

			spy.mockRestore();
		});

		test('parses "already checked out" error', async () => {
			const spy = spyOn(git, 'execGit').mockResolvedValue({
				success: false,
				stdout: '',
				stderr: "fatal: 'feature/login' is already checked out at '/path/to/repo'",
				exitCode: 128,
			});

			try {
				await git.addWorktree('feature-login', 'feature/login');
				expect(false).toBe(true); // Should not reach here
			} catch (error) {
				expect(error).toBeInstanceOf(GitError);
				expect((error as GitError).message).toContain('already checked out in another worktree');
				expect((error as GitError).message).not.toContain('fatal:');
			}

			spy.mockRestore();
		});

		test('includes raw stderr for unknown errors', async () => {
			const spy = spyOn(git, 'execGit').mockResolvedValue({
				success: false,
				stdout: '',
				stderr: 'fatal: some unknown error message',
				exitCode: 128,
			});

			try {
				await git.addWorktree('feature-login', 'feature/login');
				expect(false).toBe(true); // Should not reach here
			} catch (error) {
				expect(error).toBeInstanceOf(GitError);
				expect((error as GitError).message).toContain('some unknown error message');
			}

			spy.mockRestore();
		});
	});
});
