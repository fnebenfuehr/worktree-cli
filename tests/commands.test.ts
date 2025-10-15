/**
 * Integration tests for command error handling
 */

import { beforeAll, describe, expect, mock, test } from 'bun:test';
import { cloneCommand } from '@/commands/clone';
import { createCommand } from '@/commands/create';
import { removeCommand } from '@/commands/remove';
import { switchCommand } from '@/commands/switch';
import { FileSystemError, GitError, ValidationError } from '@/utils/errors';

// Mock isInteractive to return false for non-interactive tests
beforeAll(() => {
	mock.module('@/utils/prompts', () => ({
		isInteractive: () => false,
	}));
});

describe('Command Error Handling', () => {
	describe('cloneCommand', () => {
		test('throws ValidationError when no URL provided', async () => {
			await expect(cloneCommand('')).rejects.toThrow(ValidationError);
			await expect(cloneCommand('')).rejects.toThrow('Git URL required');
		});

		test('throws ValidationError for invalid URL format', async () => {
			await expect(cloneCommand('not-a-valid-url')).rejects.toThrow(ValidationError);
			await expect(cloneCommand('not-a-valid-url')).rejects.toThrow('Invalid git URL');
		});

		test('throws ValidationError for malformed SSH URL', async () => {
			await expect(cloneCommand('git@github.com/user/repo.git')).rejects.toThrow(ValidationError);
		});

		test('throws ValidationError for malformed HTTPS URL', async () => {
			await expect(cloneCommand('github.com/user/repo')).rejects.toThrow(ValidationError);
		});

		test('throws GitError for valid URL format but nonexistent repo', async () => {
			await expect(
				cloneCommand('https://github.com/nonexistent-user-12345/nonexistent-repo-67890.git')
			).rejects.toThrow(GitError);
		});
	});

	describe('createCommand', () => {
		test('throws ValidationError when no branch provided', async () => {
			await expect(createCommand('')).rejects.toThrow(ValidationError);
			await expect(createCommand('')).rejects.toThrow('Branch name required');
		});

		test('throws ValidationError for invalid branch names', async () => {
			await expect(createCommand('branch..name')).rejects.toThrow(ValidationError);
			await expect(createCommand('branch..name')).rejects.toThrow('Invalid branch name');
		});

		test('throws ValidationError for branch starting with slash', async () => {
			await expect(createCommand('/feature')).rejects.toThrow(ValidationError);
		});

		test('throws ValidationError for branch ending with .lock', async () => {
			await expect(createCommand('feature.lock')).rejects.toThrow(ValidationError);
		});

		test('throws ValidationError for branch with consecutive slashes', async () => {
			await expect(createCommand('feature//bug')).rejects.toThrow(ValidationError);
		});

		test('throws ValidationError for branch with invalid characters', async () => {
			await expect(createCommand('feature^bug')).rejects.toThrow(ValidationError);
			await expect(createCommand('feature~bug')).rejects.toThrow(ValidationError);
			await expect(createCommand('feature:bug')).rejects.toThrow(ValidationError);
		});

		test('throws ValidationError when not in git repository', async () => {
			// Save current dir and restore after test
			const originalDir = process.cwd();
			try {
				process.chdir('/tmp');
				await expect(createCommand('test-branch')).rejects.toThrow(ValidationError);
				await expect(createCommand('test-branch')).rejects.toThrow('Not inside a git repository');
			} finally {
				process.chdir(originalDir);
			}
		});
	});

	describe('removeCommand', () => {
		test('throws ValidationError when no branch provided', async () => {
			await expect(removeCommand('')).rejects.toThrow(ValidationError);
			await expect(removeCommand('')).rejects.toThrow('Branch name required');
		});

		test('throws FileSystemError when worktree does not exist', async () => {
			await expect(removeCommand('nonexistent-branch-12345')).rejects.toThrow(FileSystemError);
			await expect(removeCommand('nonexistent-branch-12345')).rejects.toThrow(
				'No such worktree directory'
			);
		});
	});

	describe('switchCommand', () => {
		test('throws ValidationError when no branch provided', async () => {
			await expect(switchCommand('')).rejects.toThrow(ValidationError);
			await expect(switchCommand('')).rejects.toThrow('Branch name required');
		});

		test('throws FileSystemError when worktree does not exist', async () => {
			await expect(switchCommand('nonexistent-branch-12345')).rejects.toThrow(FileSystemError);
			await expect(switchCommand('nonexistent-branch-12345')).rejects.toThrow(
				'No worktree found for branch'
			);
		});

		test('throws ValidationError when not in git repository', async () => {
			const originalDir = process.cwd();
			try {
				process.chdir('/tmp');
				await expect(switchCommand('test-branch')).rejects.toThrow(ValidationError);
				await expect(switchCommand('test-branch')).rejects.toThrow('Not inside a git repository');
			} finally {
				process.chdir(originalDir);
			}
		});
	});
});
