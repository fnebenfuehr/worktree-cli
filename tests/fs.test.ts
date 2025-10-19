import { describe, expect, test } from 'bun:test';
import { branchToDirName, extractRepoName } from '@/utils/naming';

describe('fs utils', () => {
	describe('extractRepoName', () => {
		test('extracts name from SSH URL', () => {
			expect(extractRepoName('git@github.com:user/repo.git')).toBe('repo');
		});

		test('extracts name from HTTPS URL', () => {
			expect(extractRepoName('https://github.com/user/repo.git')).toBe('repo');
		});

		test('extracts name from URL without .git', () => {
			expect(extractRepoName('https://github.com/user/my-app')).toBe('my-app');
		});

		test('handles URLs with trailing slash', () => {
			expect(extractRepoName('https://github.com/user/repo/')).toBe('repo');
		});

		test('returns null for empty string', () => {
			expect(extractRepoName('')).toBe(null);
		});

		test('extracts name from nested path', () => {
			expect(extractRepoName('git@gitlab.com:group/subgroup/project.git')).toBe('project');
		});
	});

	describe('branchToDirName', () => {
		test('replaces slashes with hyphens', () => {
			expect(branchToDirName('feature/login')).toBe('feature-login');
		});

		test('handles multiple slashes', () => {
			expect(branchToDirName('feature/auth/login')).toBe('feature-auth-login');
		});

		test('leaves simple names unchanged', () => {
			expect(branchToDirName('main')).toBe('main');
		});

		test('handles empty string', () => {
			expect(branchToDirName('')).toBe('');
		});

		test('preserves non-slash characters', () => {
			expect(branchToDirName('feature_login')).toBe('feature_login');
			expect(branchToDirName('feature.login')).toBe('feature.login');
		});
	});
});
