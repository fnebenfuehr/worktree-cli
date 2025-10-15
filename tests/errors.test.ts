/**
 * Tests for custom error classes
 */

import { describe, expect, test } from 'bun:test';
import { FileSystemError, GitError, ValidationError, WorktreeError } from '@/utils/errors';

describe('Custom Error Classes', () => {
	test('WorktreeError has correct properties', () => {
		const error = new WorktreeError('Test error', 'TEST_CODE', 42);

		expect(error).toBeInstanceOf(Error);
		expect(error).toBeInstanceOf(WorktreeError);
		expect(error.name).toBe('WorktreeError');
		expect(error.message).toBe('Test error');
		expect(error.code).toBe('TEST_CODE');
		expect(error.exitCode).toBe(42);
	});

	test('WorktreeError defaults exitCode to 1', () => {
		const error = new WorktreeError('Test error', 'TEST_CODE');
		expect(error.exitCode).toBe(1);
	});

	test('GitError extends WorktreeError', () => {
		const error = new GitError('Git failed', 'git status');

		expect(error).toBeInstanceOf(Error);
		expect(error).toBeInstanceOf(WorktreeError);
		expect(error).toBeInstanceOf(GitError);
		expect(error.name).toBe('GitError');
		expect(error.message).toBe('Git failed');
		expect(error.code).toBe('GIT_ERROR');
		expect(error.command).toBe('git status');
		expect(error.exitCode).toBe(1);
	});

	test('ValidationError extends WorktreeError', () => {
		const error = new ValidationError('Invalid input');

		expect(error).toBeInstanceOf(Error);
		expect(error).toBeInstanceOf(WorktreeError);
		expect(error).toBeInstanceOf(ValidationError);
		expect(error.name).toBe('ValidationError');
		expect(error.message).toBe('Invalid input');
		expect(error.code).toBe('VALIDATION_ERROR');
		expect(error.exitCode).toBe(1);
	});

	test('FileSystemError extends WorktreeError', () => {
		const error = new FileSystemError('File not found');

		expect(error).toBeInstanceOf(Error);
		expect(error).toBeInstanceOf(WorktreeError);
		expect(error).toBeInstanceOf(FileSystemError);
		expect(error.name).toBe('FileSystemError');
		expect(error.message).toBe('File not found');
		expect(error.code).toBe('FS_ERROR');
		expect(error.exitCode).toBe(1);
	});

	test('Error has stack trace', () => {
		const error = new GitError('Test', 'git test');
		expect(error.stack).toBeDefined();
		expect(error.stack).toContain('GitError');
	});
});
