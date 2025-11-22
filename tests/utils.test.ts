import { describe, expect, test } from 'bun:test';
import { branchToDirName, extractRepoName } from '@/utils/naming';

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
});
