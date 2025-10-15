import { describe, expect, test } from 'bun:test';
import { isSafePath, isValidBranchName, isValidGitUrl } from '@/utils/validation';

describe('validation utilities', () => {
	describe('isValidGitUrl', () => {
		test('accepts valid SSH URLs', () => {
			expect(isValidGitUrl('git@github.com:user/repo.git')).toBe(true);
			expect(isValidGitUrl('git@gitlab.com:organization/project.git')).toBe(true);
			expect(isValidGitUrl('git@bitbucket.org:team/repository.git')).toBe(true);
		});

		test('accepts nested SSH repository paths', () => {
			expect(isValidGitUrl('git@gitlab.com:group/subgroup/project.git')).toBe(true);
			expect(isValidGitUrl('git@github.com:org/team/project.git')).toBe(true);
			expect(isValidGitUrl('git@gitlab.com:a/b/c/d/repo.git')).toBe(true);
			expect(isValidGitUrl('git@github.com:org/team/project')).toBe(true);
		});

		test('accepts SSH with custom usernames and ports', () => {
			expect(isValidGitUrl('deploy@server.com:repo.git')).toBe(true);
			expect(isValidGitUrl('ssh://git@github.com:2222/user/repo.git')).toBe(true);
		});

		test('accepts git protocol URLs', () => {
			expect(isValidGitUrl('git://github.com/user/repo.git')).toBe(true);
			expect(isValidGitUrl('git://server.com/repo.git')).toBe(true);
		});

		test('accepts file protocol URLs', () => {
			expect(isValidGitUrl('file:///path/to/repo.git')).toBe(true);
			expect(isValidGitUrl('file:///home/user/repos/project.git')).toBe(true);
		});

		test('accepts valid HTTPS URLs with .git', () => {
			expect(isValidGitUrl('https://github.com/user/repo.git')).toBe(true);
			expect(isValidGitUrl('http://github.com/user/repo.git')).toBe(true);
		});

		test('accepts valid HTTPS URLs without .git', () => {
			expect(isValidGitUrl('https://github.com/user/repo')).toBe(true);
			expect(isValidGitUrl('https://gitlab.com/org/project')).toBe(true);
		});

		test('accepts URLs with ports', () => {
			expect(isValidGitUrl('https://gitlab.example.com:8443/user/repo.git')).toBe(true);
		});

		test('accepts URLs with nested paths', () => {
			expect(isValidGitUrl('https://gitlab.com/group/subgroup/repo.git')).toBe(true);
		});

		test('rejects invalid URLs', () => {
			expect(isValidGitUrl('')).toBe(false);
			expect(isValidGitUrl('not-a-url')).toBe(false);
			expect(isValidGitUrl('ftp://github.com/user/repo.git')).toBe(false);
			expect(isValidGitUrl('https://github.com')).toBe(false);
			expect(isValidGitUrl('github.com/user/repo')).toBe(false);
		});

		test('rejects malformed SSH URLs', () => {
			expect(isValidGitUrl('git@github.com/user/repo.git')).toBe(false);
			expect(isValidGitUrl('git@github.com:')).toBe(false);
			expect(isValidGitUrl('git@:user/repo.git')).toBe(false);
		});

		test('rejects invalid hostnames in SSH URLs', () => {
			expect(isValidGitUrl('git@.-host:repo.git')).toBe(false);
			expect(isValidGitUrl('git@host.-bad:repo.git')).toBe(false);
			expect(isValidGitUrl('git@-host:repo.git')).toBe(false);
			expect(isValidGitUrl('git@host-:repo.git')).toBe(false);
		});

		test('rejects SSH URLs with double colon (invalid port syntax)', () => {
			expect(isValidGitUrl('git@host:2222:repo.git')).toBe(false);
		});

		test('accepts repository names with hyphens', () => {
			expect(isValidGitUrl('git@github.com:user/my-repo-name.git')).toBe(true);
			expect(isValidGitUrl('https://github.com/user/my-repo-name.git')).toBe(true);
		});

		test('accepts usernames with dots and special characters', () => {
			expect(isValidGitUrl('john.doe@server.com:repo.git')).toBe(true);
			expect(isValidGitUrl('user_name@github.com:repo.git')).toBe(true);
			expect(isValidGitUrl('user-123@server.com:repo.git')).toBe(true);
		});

		test('accepts IPv4 addresses', () => {
			expect(isValidGitUrl('git@192.168.1.1:repo.git')).toBe(true);
			expect(isValidGitUrl('git@10.0.0.1:user/repo.git')).toBe(true);
			expect(isValidGitUrl('ssh://git@192.168.1.100:2222/repo.git')).toBe(true);
			expect(isValidGitUrl('https://192.168.1.1/user/repo.git')).toBe(true);
		});

		test('accepts IPv6 addresses', () => {
			expect(isValidGitUrl('git@[::1]:repo.git')).toBe(true);
			expect(isValidGitUrl('git@[2001:db8::1]:user/repo.git')).toBe(true);
			expect(isValidGitUrl('ssh://git@[::1]:2222/repo.git')).toBe(true);
			expect(isValidGitUrl('https://[2001:db8::1]/user/repo.git')).toBe(true);
		});

		test('accepts authenticated HTTPS URLs', () => {
			expect(isValidGitUrl('https://user@github.com/repo/project.git')).toBe(true);
			expect(isValidGitUrl('https://user:token@github.com/repo/project.git')).toBe(true);
			expect(isValidGitUrl('https://user:pass@192.168.1.1/repo.git')).toBe(true);
		});

		test('handles non-string input', () => {
			expect(isValidGitUrl(null as any)).toBe(false);
			expect(isValidGitUrl(undefined as any)).toBe(false);
			expect(isValidGitUrl(123 as any)).toBe(false);
		});

		test('rejects URLs with shell injection attempts', () => {
			expect(isValidGitUrl('https://github.com/user/repo.git; rm -rf /')).toBe(false);
			expect(isValidGitUrl('git@github.com:user/repo.git && malicious-command')).toBe(false);
			expect(isValidGitUrl('https://github.com/user/repo.git | cat /etc/passwd')).toBe(false);
			expect(isValidGitUrl('git@github.com:user/repo.git$(whoami)')).toBe(false);
			expect(isValidGitUrl('https://github.com/user/repo.git`id`')).toBe(false);
		});
	});

	describe('isValidBranchName', () => {
		test('accepts valid branch names', () => {
			expect(isValidBranchName('main')).toBe(true);
			expect(isValidBranchName('feature/login')).toBe(true);
			expect(isValidBranchName('bugfix-issue-123')).toBe(true);
			expect(isValidBranchName('release/v1.0.0')).toBe(true);
			expect(isValidBranchName('feature_branch')).toBe(true);
		});

		test('rejects empty or invalid input', () => {
			expect(isValidBranchName('')).toBe(false);
			expect(isValidBranchName(null as any)).toBe(false);
			expect(isValidBranchName(undefined as any)).toBe(false);
			expect(isValidBranchName(123 as any)).toBe(false);
		});

		test('rejects branches starting with slash', () => {
			expect(isValidBranchName('/feature')).toBe(false);
		});

		test('rejects branches ending with slash', () => {
			expect(isValidBranchName('feature/')).toBe(false);
		});

		test('rejects branches ending with .lock', () => {
			expect(isValidBranchName('feature.lock')).toBe(false);
			expect(isValidBranchName('main.lock')).toBe(false);
		});

		test('rejects branches with consecutive slashes', () => {
			expect(isValidBranchName('feature//bug')).toBe(false);
			expect(isValidBranchName('feature///fix')).toBe(false);
		});

		test('rejects branches with ..', () => {
			expect(isValidBranchName('feature..bug')).toBe(false);
			expect(isValidBranchName('../feature')).toBe(false);
		});

		test('rejects branches with @{', () => {
			expect(isValidBranchName('feature@{1}')).toBe(false);
		});

		test('rejects branches with invalid characters', () => {
			expect(isValidBranchName('feature\\bug')).toBe(false);
			expect(isValidBranchName('feature^bug')).toBe(false);
			expect(isValidBranchName('feature~bug')).toBe(false);
			expect(isValidBranchName('feature:bug')).toBe(false);
			expect(isValidBranchName('feature?bug')).toBe(false);
			expect(isValidBranchName('feature*bug')).toBe(false);
			expect(isValidBranchName('feature[bug]')).toBe(false);
		});

		test('rejects branches starting with dot or dash', () => {
			expect(isValidBranchName('.feature')).toBe(false);
			expect(isValidBranchName('-feature')).toBe(false);
		});

		test('rejects branch named @', () => {
			expect(isValidBranchName('@')).toBe(false);
		});

		test('rejects branches with control characters', () => {
			expect(isValidBranchName('feature\x00bug')).toBe(false);
			expect(isValidBranchName('feature\nbug')).toBe(false);
			expect(isValidBranchName('feature\x7fbug')).toBe(false);
		});

		test('rejects branches with spaces', () => {
			expect(isValidBranchName('feature branch')).toBe(false);
			expect(isValidBranchName('my feature')).toBe(false);
			expect(isValidBranchName(' feature')).toBe(false);
			expect(isValidBranchName('feature ')).toBe(false);
		});

		test('rejects branches ending with dot', () => {
			expect(isValidBranchName('feature.')).toBe(false);
			expect(isValidBranchName('branch.')).toBe(false);
		});

		test('accepts branch names with only numbers', () => {
			expect(isValidBranchName('123')).toBe(true);
			expect(isValidBranchName('456789')).toBe(true);
		});

		test('accepts branches with @ in middle', () => {
			expect(isValidBranchName('feature@branch')).toBe(true);
			expect(isValidBranchName('test@123')).toBe(true);
		});

		test('rejects branches with shell injection attempts', () => {
			expect(isValidBranchName('feature; rm -rf /')).toBe(false);
			expect(isValidBranchName('feature$(whoami)')).toBe(false);
			expect(isValidBranchName('feature`id`')).toBe(false);
			expect(isValidBranchName('feature | cat /etc/passwd')).toBe(false);
			expect(isValidBranchName('feature && malicious')).toBe(false);
		});
	});

	describe('isSafePath', () => {
		test('accepts safe paths', () => {
			expect(isSafePath('path/to/file')).toBe(true);
			expect(isSafePath('simple')).toBe(true);
			expect(isSafePath('path/with/multiple/segments')).toBe(true);
		});

		test('rejects empty or invalid input', () => {
			expect(isSafePath('')).toBe(false);
			expect(isSafePath(null as any)).toBe(false);
			expect(isSafePath(undefined as any)).toBe(false);
		});

		test('rejects paths with .. traversal', () => {
			expect(isSafePath('../etc/passwd')).toBe(false);
			expect(isSafePath('path/../../../etc')).toBe(false);
			expect(isSafePath('valid/path/../../dangerous')).toBe(false);
		});

		test('rejects paths that differ after normalization', () => {
			expect(isSafePath('path/./file')).toBe(false);
			expect(isSafePath('./path')).toBe(false);
		});

		test('accepts absolute paths', () => {
			expect(isSafePath('/absolute/path')).toBe(true);
			expect(isSafePath('/usr/local/repo')).toBe(true);
		});

		test('accepts very long paths', () => {
			const longPath = `${'a'.repeat(250)}/file`;
			expect(isSafePath(longPath)).toBe(true);
		});
	});
});
