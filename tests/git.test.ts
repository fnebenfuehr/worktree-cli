import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { $ } from 'bun';
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

describe('gitGetWorkingDirectoryStatus', () => {
	let testDir: string;
	let originalCwd: string;

	beforeEach(async () => {
		originalCwd = process.cwd();
		testDir = await mkdtemp(join(tmpdir(), 'git-status-test-'));
		process.chdir(testDir);

		await $`git init`.quiet();
		await $`git config user.email "test@example.com"`.quiet();
		await $`git config user.name "Test User"`.quiet();
		await $`git config commit.gpgsign false`.quiet();
		await writeFile('README.md', '# Test');
		await $`git add .`.quiet();
		await $`git commit -m "Initial commit"`.quiet();
	});

	afterEach(async () => {
		process.chdir(originalCwd);
		await rm(testDir, { recursive: true, force: true });
	});

	test('returns empty status for clean repo', async () => {
		const status = await git.gitGetWorkingDirectoryStatus();

		expect(status.staged).toEqual([]);
		expect(status.unstaged).toEqual([]);
		expect(status.untracked).toEqual([]);
		expect(status.hasChanges).toBe(false);
	});

	test('detects staged changes', async () => {
		await writeFile('new.txt', 'content');
		await $`git add new.txt`.quiet();

		const status = await git.gitGetWorkingDirectoryStatus();

		expect(status.staged).toContain('new.txt');
		expect(status.unstaged).toEqual([]);
		expect(status.untracked).toEqual([]);
		expect(status.hasChanges).toBe(true);
	});

	test('detects unstaged changes', async () => {
		await writeFile('README.md', 'modified content');

		const status = await git.gitGetWorkingDirectoryStatus();

		expect(status.staged).toEqual([]);
		expect(status.unstaged).toContain('README.md');
		expect(status.untracked).toEqual([]);
		expect(status.hasChanges).toBe(true);
	});

	test('detects untracked files', async () => {
		await writeFile('untracked.txt', 'content');

		const status = await git.gitGetWorkingDirectoryStatus();

		expect(status.staged).toEqual([]);
		expect(status.unstaged).toEqual([]);
		expect(status.untracked).toContain('untracked.txt');
		expect(status.hasChanges).toBe(true);
	});

	test('detects mixed changes', async () => {
		// Staged change
		await writeFile('staged.txt', 'staged');
		await $`git add staged.txt`.quiet();

		// Unstaged change
		await writeFile('README.md', 'modified');

		// Untracked file
		await writeFile('untracked.txt', 'untracked');

		const status = await git.gitGetWorkingDirectoryStatus();

		expect(status.staged).toContain('staged.txt');
		expect(status.unstaged).toContain('README.md');
		expect(status.untracked).toContain('untracked.txt');
		expect(status.hasChanges).toBe(true);
	});

	test('detects file with both staged and unstaged changes', async () => {
		// Stage a change
		await writeFile('README.md', 'staged version');
		await $`git add README.md`.quiet();

		// Make additional unstaged change
		await writeFile('README.md', 'unstaged version');

		const status = await git.gitGetWorkingDirectoryStatus();

		expect(status.staged).toContain('README.md');
		expect(status.unstaged).toContain('README.md');
		expect(status.hasChanges).toBe(true);
	});
});

describe('formatWorkingDirectoryStatus', () => {
	test('formats staged changes', () => {
		const status: git.WorkingDirectoryStatus = {
			staged: ['file1.ts', 'file2.ts'],
			unstaged: [],
			untracked: [],
			hasChanges: true,
		};

		const output = git.formatWorkingDirectoryStatus(status);

		expect(output).toContain('Staged changes (2):');
		expect(output).toContain('file1.ts');
		expect(output).toContain('file2.ts');
	});

	test('formats unstaged changes', () => {
		const status: git.WorkingDirectoryStatus = {
			staged: [],
			unstaged: ['modified.ts'],
			untracked: [],
			hasChanges: true,
		};

		const output = git.formatWorkingDirectoryStatus(status);

		expect(output).toContain('Unstaged changes (1):');
		expect(output).toContain('modified.ts');
	});

	test('formats untracked files', () => {
		const status: git.WorkingDirectoryStatus = {
			staged: [],
			unstaged: [],
			untracked: ['new.ts'],
			hasChanges: true,
		};

		const output = git.formatWorkingDirectoryStatus(status);

		expect(output).toContain('Untracked files (1):');
		expect(output).toContain('new.ts');
	});

	test('truncates long lists', () => {
		const status: git.WorkingDirectoryStatus = {
			staged: ['f1.ts', 'f2.ts', 'f3.ts', 'f4.ts', 'f5.ts', 'f6.ts', 'f7.ts'],
			unstaged: [],
			untracked: [],
			hasChanges: true,
		};

		const output = git.formatWorkingDirectoryStatus(status);

		expect(output).toContain('Staged changes (7):');
		expect(output).toContain('... and 2 more');
	});

	test('returns empty string for no changes', () => {
		const status: git.WorkingDirectoryStatus = {
			staged: [],
			unstaged: [],
			untracked: [],
			hasChanges: false,
		};

		const output = git.formatWorkingDirectoryStatus(status);

		expect(output).toBe('');
	});
});

describe('gitHasUncommittedChanges', () => {
	let testDir: string;
	let originalCwd: string;

	beforeEach(async () => {
		originalCwd = process.cwd();
		testDir = await mkdtemp(join(tmpdir(), 'git-changes-test-'));
		process.chdir(testDir);

		await $`git init`.quiet();
		await $`git config user.email "test@example.com"`.quiet();
		await $`git config user.name "Test User"`.quiet();
		await $`git config commit.gpgsign false`.quiet();
		await writeFile('README.md', '# Test');
		await $`git add .`.quiet();
		await $`git commit -m "Initial commit"`.quiet();
	});

	afterEach(async () => {
		process.chdir(originalCwd);
		await rm(testDir, { recursive: true, force: true });
	});

	test('returns false for clean repo', async () => {
		const hasChanges = await git.gitHasUncommittedChanges();
		expect(hasChanges).toBe(false);
	});

	test('returns true for staged changes', async () => {
		await writeFile('new.txt', 'content');
		await $`git add new.txt`.quiet();

		const hasChanges = await git.gitHasUncommittedChanges();
		expect(hasChanges).toBe(true);
	});

	test('returns true for unstaged changes', async () => {
		await writeFile('README.md', 'modified');

		const hasChanges = await git.gitHasUncommittedChanges();
		expect(hasChanges).toBe(true);
	});

	test('ignores untracked files by default', async () => {
		await writeFile('untracked.txt', 'content');

		const hasChanges = await git.gitHasUncommittedChanges();
		expect(hasChanges).toBe(false);
	});

	test('includes untracked files when option is set', async () => {
		await writeFile('untracked.txt', 'content');

		const hasChanges = await git.gitHasUncommittedChanges(undefined, { includeUntracked: true });
		expect(hasChanges).toBe(true);
	});
});
