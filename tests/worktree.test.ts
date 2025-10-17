/**
 * Unit tests for core worktree business logic (src/core/worktree.ts)
 * Tests business logic without UI/command layer concerns
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { $ } from 'bun';
import * as worktree from '@/core/worktree';
import {
	FileSystemError,
	GitError,
	UncommittedChangesError,
	UnmergedBranchError,
	ValidationError,
} from '@/utils/errors';

let testDir: string;
let originalCwd: string;

beforeEach(async () => {
	originalCwd = process.cwd();
	testDir = await mkdtemp(join(tmpdir(), 'worktree-test-'));
	process.chdir(testDir);

	// Initialize a bare repo structure with main worktree
	await $`git init --bare .bare`.quiet();
	await $`git clone ${testDir}/.bare main`.quiet();
	process.chdir(join(testDir, 'main'));

	// Create initial commit
	await writeFile('README.md', '# Test Repo');
	await $`git add .`.quiet();
	await $`git config user.email "test@example.com"`.quiet();
	await $`git config user.name "Test User"`.quiet();
	await $`git commit -m "Initial commit"`.quiet();

	// Push to origin using try-catch to handle CI environment differences
	try {
		await $`git push -u origin main`.quiet();
	} catch (error) {
		// In CI, push might fail due to shell differences, but tests can continue
		// The commit exists locally which is enough for most tests
		console.warn('Failed to push to origin (OK in CI):', error);
	}
});

afterEach(async () => {
	process.chdir(originalCwd);
	await rm(testDir, { recursive: true, force: true });
});

describe('worktree.status()', () => {
	test('detects worktree-enabled repository', async () => {
		const result = await worktree.status();

		expect(result.enabled).toBe(true);
		expect(result.count).toBeGreaterThan(0);
		expect(result.defaultBranch).toBe('main');
	});

	test('returns correct worktree count', async () => {
		const result = await worktree.status();
		expect(result.count).toBe(1); // Only main worktree

		// Create another worktree
		await worktree.create('feature/test');
		const afterCreate = await worktree.status();
		expect(afterCreate.count).toBe(2);
	});
});

describe('worktree.list()', () => {
	test('returns list of worktrees', async () => {
		const worktrees = await worktree.list();

		expect(worktrees.length).toBe(1);
		expect(worktrees[0].branch).toBe('main');
		expect(worktrees[0].path).toContain('main');
	});

	test('includes newly created worktrees', async () => {
		await worktree.create('feature/new');
		const worktrees = await worktree.list();

		expect(worktrees.length).toBe(2);
		expect(worktrees.some((wt) => wt.branch === 'feature/new')).toBe(true);
	});
});

describe('worktree.create()', () => {
	test('creates new worktree and branch', async () => {
		const result = await worktree.create('feature/login');

		expect(result.branch).toBe('feature/login');
		expect(result.created).toBe(true); // New branch created
		expect(result.path).toContain('feature-login');

		// Verify worktree exists
		const worktrees = await worktree.list();
		expect(worktrees.some((wt) => wt.branch === 'feature/login')).toBe(true);
	});

	test('creates worktree from existing branch', async () => {
		// Create branch first
		await $`git branch feature/existing`.quiet();

		const result = await worktree.create('feature/existing');

		expect(result.branch).toBe('feature/existing');
		expect(result.created).toBe(false); // Branch already existed
		expect(result.path).toContain('feature-existing');
	});

	test('creates worktree with custom base branch', async () => {
		// Create a different base branch
		await $`git checkout -b develop`.quiet();
		await writeFile('develop.txt', 'develop');
		await $`git add .`.quiet();
		await $`git commit -m "Develop commit"`.quiet();
		await $`git push -u origin develop`.quiet();
		await $`git checkout main`.quiet();

		const result = await worktree.create('feature/from-develop', 'develop');

		expect(result.branch).toBe('feature/from-develop');
		expect(result.created).toBe(true);
	});

	test('throws ValidationError for invalid branch name', async () => {
		await expect(worktree.create('feature..invalid')).rejects.toThrow(ValidationError);
		await expect(worktree.create('feature..invalid')).rejects.toThrow('Invalid branch name');
	});

	test('throws ValidationError for branch starting with slash', async () => {
		await expect(worktree.create('/feature')).rejects.toThrow(ValidationError);
	});

	test('throws ValidationError for branch ending with .lock', async () => {
		await expect(worktree.create('feature.lock')).rejects.toThrow(ValidationError);
	});

	test('throws FileSystemError if directory already exists', async () => {
		await worktree.create('feature/test');

		// Try to create again
		await expect(worktree.create('feature/test')).rejects.toThrow(FileSystemError);
		await expect(worktree.create('feature/test')).rejects.toThrow(
			'Worktree directory already exists'
		);
	});

	test('converts slash in branch name to dash in directory name', async () => {
		const result = await worktree.create('feature/login-page');

		expect(result.path).toContain('feature-login-page');
		expect(result.path).not.toContain('feature/login-page');
	});
});

describe('worktree.switchTo()', () => {
	test('returns path to existing worktree', async () => {
		const result = await worktree.switchTo('main');

		expect(result.branch).toBe('main');
		expect(result.path).toContain('main');
	});

	test('finds worktree by branch name', async () => {
		await worktree.create('feature/switch-test');

		const result = await worktree.switchTo('feature/switch-test');

		expect(result.branch).toBe('feature/switch-test');
		expect(result.path).toContain('feature-switch-test');
	});

	test('throws FileSystemError for non-existent worktree', async () => {
		await expect(worktree.switchTo('nonexistent')).rejects.toThrow(FileSystemError);
		await expect(worktree.switchTo('nonexistent')).rejects.toThrow('No worktree found for branch');
	});
});

describe('worktree.remove() - safety checks', () => {
	test('throws UnmergedBranchError when branch is not merged', async () => {
		// Create branch with unmerged commits
		await $`git checkout -b feature/unmerged`.quiet();
		await writeFile('feature.txt', 'feature work');
		await $`git add .`.quiet();
		await $`git commit -m "Add feature"`.quiet();
		await $`git checkout main`.quiet();

		// Create worktree from unmerged branch
		await $`git worktree add ../feature-unmerged feature/unmerged`.quiet();

		await expect(worktree.remove('feature/unmerged')).rejects.toThrow(UnmergedBranchError);
		await expect(worktree.remove('feature/unmerged')).rejects.toThrow('not merged');
	});

	test('throws UncommittedChangesError when worktree has uncommitted changes', async () => {
		// Create unmerged branch with uncommitted changes
		await $`git checkout -b feature/dirty`.quiet();
		await writeFile('feature.txt', 'work');
		await $`git add .`.quiet();
		await $`git commit -m "Add feature"`.quiet();
		await $`git checkout main`.quiet();
		await $`git worktree add ../feature-dirty feature/dirty`.quiet();

		// Add uncommitted change (will fail on uncommitted check before merge check)
		const featurePath = join(testDir, 'feature-dirty');
		await writeFile(join(featurePath, 'uncommitted.txt'), 'uncommitted');

		await expect(worktree.remove('feature/dirty')).rejects.toThrow(UncommittedChangesError);
		await expect(worktree.remove('feature/dirty')).rejects.toThrow('uncommitted changes');
	});

	test('force flag bypasses all safety checks', async () => {
		// Create unmerged branch with uncommitted changes
		await $`git checkout -b feature/force-test`.quiet();
		await writeFile('feature.txt', 'work');
		await $`git add .`.quiet();
		await $`git commit -m "Add feature"`.quiet();
		await $`git checkout main`.quiet();
		await $`git worktree add ../feature-force-test feature/force-test`.quiet();

		// Add uncommitted change
		const featurePath = join(testDir, 'feature-force-test');
		await writeFile(join(featurePath, 'uncommitted.txt'), 'uncommitted');

		// Should succeed with force (bypasses both uncommitted and unmerged checks)
		const result = await worktree.remove('feature/force-test', true);
		expect(result.path).toContain('feature-force-test');
	});

	test('throws FileSystemError for non-existent worktree', async () => {
		await expect(worktree.remove('nonexistent')).rejects.toThrow(FileSystemError);
		await expect(worktree.remove('nonexistent')).rejects.toThrow('No such worktree directory');
	});
});

describe('worktree.setup()', () => {
	test('throws GitError when not in git repository', async () => {
		process.chdir(testDir);
		await expect(worktree.setup()).rejects.toThrow(GitError);
		await expect(worktree.setup()).rejects.toThrow('Could not determine git directory');
	});

	test('throws ValidationError when already in worktree directory', async () => {
		// Create a real worktree and try to run setup from it
		await worktree.create('feature/test-setup');
		const featurePath = join(testDir, 'feature-test-setup');
		process.chdir(featurePath);

		await expect(worktree.setup()).rejects.toThrow(ValidationError);
		await expect(worktree.setup()).rejects.toThrow('Already in a worktree directory');

		// Restore
		process.chdir(join(testDir, 'main'));
	});
});
