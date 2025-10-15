import { describe, expect, test } from 'bun:test';
import {
	FileSystemError,
	GitError,
	UserCancelledError,
	ValidationError,
	WorktreeError,
} from '@/utils/errors';

describe('error classes', () => {
	describe('WorktreeError', () => {
		test('creates error with message, code, and exitCode', () => {
			const error = new WorktreeError('Test error', 'TEST_CODE', 42);

			expect(error.message).toBe('Test error');
			expect(error.code).toBe('TEST_CODE');
			expect(error.exitCode).toBe(42);
			expect(error.name).toBe('WorktreeError');
		});

		test('defaults to exitCode 1', () => {
			const error = new WorktreeError('Test error', 'TEST_CODE');

			expect(error.exitCode).toBe(1);
		});

		test('is instance of Error', () => {
			const error = new WorktreeError('Test', 'CODE');

			expect(error).toBeInstanceOf(Error);
		});

		test('captures stack trace', () => {
			const error = new WorktreeError('Test', 'CODE');

			expect(error.stack).toBeDefined();
			expect(error.stack).toContain('WorktreeError');
		});
	});

	describe('GitError', () => {
		test('creates error with command information', () => {
			const error = new GitError('Failed to fetch', 'git fetch origin main');

			expect(error.message).toBe('Failed to fetch');
			expect(error.command).toBe('git fetch origin main');
			expect(error.code).toBe('GIT_ERROR');
			expect(error.exitCode).toBe(1);
			expect(error.name).toBe('GitError');
		});

		test('is instance of WorktreeError', () => {
			const error = new GitError('Test', 'git status');

			expect(error).toBeInstanceOf(WorktreeError);
			expect(error).toBeInstanceOf(Error);
		});

		test('includes command in error context', () => {
			const error = new GitError('Branch not found', 'git checkout feature');

			expect(error.command).toBe('git checkout feature');
		});
	});

	describe('ValidationError', () => {
		test('creates validation error', () => {
			const error = new ValidationError('Invalid branch name');

			expect(error.message).toBe('Invalid branch name');
			expect(error.code).toBe('VALIDATION_ERROR');
			expect(error.exitCode).toBe(1);
			expect(error.name).toBe('ValidationError');
		});

		test('is instance of WorktreeError', () => {
			const error = new ValidationError('Test');

			expect(error).toBeInstanceOf(WorktreeError);
			expect(error).toBeInstanceOf(Error);
		});
	});

	describe('FileSystemError', () => {
		test('creates filesystem error', () => {
			const error = new FileSystemError('Directory not found');

			expect(error.message).toBe('Directory not found');
			expect(error.code).toBe('FS_ERROR');
			expect(error.exitCode).toBe(1);
			expect(error.name).toBe('FileSystemError');
		});

		test('is instance of WorktreeError', () => {
			const error = new FileSystemError('Test');

			expect(error).toBeInstanceOf(WorktreeError);
			expect(error).toBeInstanceOf(Error);
		});
	});

	describe('UserCancelledError', () => {
		test('creates cancellation error with default message', () => {
			const error = new UserCancelledError();

			expect(error.message).toBe('Operation cancelled');
			expect(error.code).toBe('USER_CANCELLED');
			expect(error.exitCode).toBe(0);
			expect(error.name).toBe('UserCancelledError');
		});

		test('creates cancellation error with custom message', () => {
			const error = new UserCancelledError('User aborted');

			expect(error.message).toBe('User aborted');
		});

		test('has exitCode 0 (success)', () => {
			const error = new UserCancelledError();

			// User cancellation is not an error, exit cleanly
			expect(error.exitCode).toBe(0);
		});

		test('is instance of WorktreeError', () => {
			const error = new UserCancelledError();

			expect(error).toBeInstanceOf(WorktreeError);
			expect(error).toBeInstanceOf(Error);
		});
	});

	describe('error inheritance', () => {
		test('all errors inherit from WorktreeError', () => {
			expect(new GitError('Test', 'git')).toBeInstanceOf(WorktreeError);
			expect(new ValidationError('Test')).toBeInstanceOf(WorktreeError);
			expect(new FileSystemError('Test')).toBeInstanceOf(WorktreeError);
			expect(new UserCancelledError()).toBeInstanceOf(WorktreeError);
		});

		test('all errors inherit from Error', () => {
			expect(new WorktreeError('Test', 'CODE')).toBeInstanceOf(Error);
			expect(new GitError('Test', 'git')).toBeInstanceOf(Error);
			expect(new ValidationError('Test')).toBeInstanceOf(Error);
			expect(new FileSystemError('Test')).toBeInstanceOf(Error);
			expect(new UserCancelledError()).toBeInstanceOf(Error);
		});

		test('errors can be caught as WorktreeError', () => {
			try {
				throw new GitError('Test', 'git');
			} catch (error) {
				expect(error).toBeInstanceOf(WorktreeError);
			}
		});
	});

	describe('error differentiation', () => {
		test('can distinguish between error types', () => {
			const gitError = new GitError('Test', 'git');
			const validationError = new ValidationError('Test');
			const fsError = new FileSystemError('Test');
			const cancelError = new UserCancelledError();

			expect(gitError).toBeInstanceOf(GitError);
			expect(validationError).toBeInstanceOf(ValidationError);
			expect(fsError).toBeInstanceOf(FileSystemError);
			expect(cancelError).toBeInstanceOf(UserCancelledError);

			expect(gitError).not.toBeInstanceOf(ValidationError);
			expect(validationError).not.toBeInstanceOf(GitError);
		});

		test('exit codes differ between error types', () => {
			expect(new GitError('Test', 'git').exitCode).toBe(1);
			expect(new ValidationError('Test').exitCode).toBe(1);
			expect(new FileSystemError('Test').exitCode).toBe(1);
			expect(new UserCancelledError().exitCode).toBe(0);
		});
	});
});
