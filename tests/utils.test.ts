import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { realpath as fsRealpath, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { branchToDirName, extractRepoName, realpath } from '@/utils/fs';

describe('fs utilities', () => {
	describe('extractRepoName', () => {
		test('extracts name from SSH URL', () => {
			expect(extractRepoName('git@github.com:user/my-repo.git')).toBe('my-repo');
		});

		test('extracts name from HTTPS URL with .git', () => {
			expect(extractRepoName('https://github.com/user/my-repo.git')).toBe('my-repo');
		});

		test('extracts name from HTTPS URL without .git', () => {
			expect(extractRepoName('https://github.com/user/my-repo')).toBe('my-repo');
		});

		test('handles trailing slash', () => {
			expect(extractRepoName('https://github.com/user/my-repo/')).toBe('my-repo');
		});

		test('returns null for invalid URL', () => {
			expect(extractRepoName('')).toBe(null);
		});
	});

	describe('branchToDirName', () => {
		test('converts slashes to dashes', () => {
			expect(branchToDirName('feature/login')).toBe('feature-login');
		});

		test('handles multiple slashes', () => {
			expect(branchToDirName('feature/user/auth')).toBe('feature-user-auth');
		});

		test('leaves branches without slashes unchanged', () => {
			expect(branchToDirName('main')).toBe('main');
		});

		test('handles empty string', () => {
			expect(branchToDirName('')).toBe('');
		});
	});

	describe('realpath', () => {
		let tempDir: string;
		let testFile: string;
		let symlinkPath: string;

		beforeAll(async () => {
			tempDir = await mkdtemp(join(tmpdir(), 'realpath-test-'));
			// Normalize tempDir to handle macOS /var -> /private/var symlink
			tempDir = await fsRealpath(tempDir);
			testFile = join(tempDir, 'test.txt');
			symlinkPath = join(tempDir, 'symlink');

			await writeFile(testFile, 'test content');
			await symlink(testFile, symlinkPath);
		});

		afterAll(async () => {
			await rm(tempDir, { recursive: true, force: true });
		});

		test('resolves symlinks correctly', async () => {
			const resolved = await realpath(symlinkPath);
			expect(resolved).toBe(testFile);
		});

		test('returns normalized path for regular files', async () => {
			const resolved = await realpath(testFile);
			expect(resolved).toBe(testFile);
		});

		test('returns original path on error', async () => {
			const nonexistent = '/nonexistent/path/file.txt';
			const result = await realpath(nonexistent);
			expect(result).toBe(nonexistent);
		});
	});
});
