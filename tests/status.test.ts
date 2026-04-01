/**
 * Unit tests for the status command and extendedStatus function
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { $ } from 'bun';
import { extendedStatus } from '@/commands/status';
import * as worktree from '@/lib/worktree';

let testDir: string;
let originalCwd: string;
let defaultBranch: string;

beforeEach(async () => {
	originalCwd = process.cwd();
	testDir = await mkdtemp(join(tmpdir(), 'worktree-status-test-'));
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
	await $`git config commit.gpgsign false`.quiet();
	await $`git commit -m "Initial commit"`.quiet();

	// Get the default branch name
	const branchResult = await $`git branch --show-current`.quiet();
	defaultBranch = branchResult.stdout.toString().trim();

	// Push to populate bare repo
	try {
		await $`git push -u origin ${defaultBranch}`.quiet();
	} catch {
		// Push failed - manually set up bare repo HEAD ref
		await $`git --git-dir=${testDir}/.bare symbolic-ref HEAD refs/heads/${defaultBranch}`.quiet();
	}
});

afterEach(async () => {
	process.chdir(originalCwd);
	await rm(testDir, { recursive: true, force: true });
});

describe('extendedStatus()', () => {
	test('returns basic status info', async () => {
		const status = await extendedStatus();

		expect(status.enabled).toBe(false);
		expect(status.count).toBe(1);
		expect(status.worktrees).toBeArrayOfSize(1);
	});

	test('returns worktree list with branch and path', async () => {
		const status = await extendedStatus();

		expect(status.worktrees[0].branch).toBe(defaultBranch);
		expect(status.worktrees[0].path).toContain('main');
	});

	test('detects current worktree', async () => {
		const status = await extendedStatus();

		// We're in main, so it should be current
		expect(status.worktrees[0].isCurrent).toBe(true);
		expect(status.currentWorktree).toBeDefined();
		expect(status.currentWorktree?.branch).toBe(defaultBranch);
	});

	test('returns multiple worktrees after creation', async () => {
		await worktree.create('feature/test');
		const status = await extendedStatus();

		expect(status.enabled).toBe(true);
		expect(status.count).toBe(2);
		expect(status.worktrees).toBeArrayOfSize(2);
		expect(status.worktrees.some((wt) => wt.branch === 'feature/test')).toBe(true);
	});

	test('shows current worktree changes when switching directories', async () => {
		await worktree.create('feature/other');
		const featurePath = join(testDir, 'feature-other');

		// Check status from main - main is current
		let status = await extendedStatus();
		expect(status.currentWorktree?.branch).toBe(defaultBranch);

		// Switch to feature and check again
		process.chdir(featurePath);
		status = await extendedStatus();
		expect(status.currentWorktree?.branch).toBe('feature/other');
	});

	test('includes tracking status when upstream is set', async () => {
		// Push and set upstream for default branch
		try {
			await $`git push -u origin ${defaultBranch}`.quiet();
		} catch {
			// May already be pushed
		}

		const status = await extendedStatus();
		const mainWorktree = status.worktrees.find((wt) => wt.branch === defaultBranch);

		// Should have tracking info since upstream is set
		expect(mainWorktree?.tracking).toBeDefined();
		expect(mainWorktree?.tracking?.ahead).toBe(0);
		expect(mainWorktree?.tracking?.behind).toBe(0);
	});

	test('shows ahead commits when local is ahead', async () => {
		// Ensure upstream is set
		try {
			await $`git push -u origin ${defaultBranch}`.quiet();
		} catch {
			// May fail in CI
		}

		// Add a local commit
		await writeFile('new-file.txt', 'new content');
		await $`git add .`.quiet();
		await $`git commit -m "Local commit"`.quiet();

		const status = await extendedStatus();
		const mainWorktree = status.worktrees.find((wt) => wt.branch === defaultBranch);

		if (mainWorktree?.tracking) {
			expect(mainWorktree.tracking.ahead).toBeGreaterThan(0);
		}
	});

	test('returns defaultBranch in status', async () => {
		// After creating a worktree, defaultBranch should be set
		await worktree.create('feature/test');
		const statusAfter = await extendedStatus();

		expect(statusAfter.defaultBranch).toBeDefined();
	});

	test('handles detached HEAD worktree', async () => {
		// Get current commit hash
		const hashResult = await $`git rev-parse HEAD`.quiet();
		const commitHash = hashResult.stdout.toString().trim();

		// Create a detached worktree
		await $`git worktree add --detach ../detached ${commitHash}`.quiet();

		const status = await extendedStatus();
		// Detached worktrees show as 'detached' in the branch field
		const detachedWorktree = status.worktrees.find((wt) => wt.path.includes('detached'));

		expect(detachedWorktree).toBeDefined();
		// Detached worktrees should not have tracking info
		expect(detachedWorktree?.tracking).toBeUndefined();
	});

	test('non-current worktrees have isCurrent false', async () => {
		await worktree.create('feature/not-current');
		const status = await extendedStatus();

		const featureWorktree = status.worktrees.find((wt) => wt.branch === 'feature/not-current');
		expect(featureWorktree?.isCurrent).toBe(false);
	});
});
