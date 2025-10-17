/**
 * Integration tests for remove command safety checks
 */

import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { $ } from 'bun';
import { removeCommand } from '@/commands/remove';
import {
	MergeStatusUnknownError,
	UncommittedChangesError,
	UnmergedBranchError,
} from '@/utils/errors';

let testDir: string;
let originalCwd: string;

beforeEach(async () => {
	originalCwd = process.cwd();
	testDir = await mkdtemp(join(tmpdir(), 'worktree-remove-safety-test-'));
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
	await $`git push -u origin main`.quiet();

	// Mock non-interactive mode
	mock.module('@/utils/prompts', () => ({
		isInteractive: () => false,
	}));
});

afterEach(async () => {
	process.chdir(originalCwd);
	await rm(testDir, { recursive: true, force: true });
	mock.restore();
});

describe('Remove Command Safety Checks', () => {
	test('throws UnmergedBranchError when branch is not merged', async () => {
		// Create a feature branch with commits
		await $`git checkout -b feature-unmerged`.quiet();
		await writeFile('feature.txt', 'feature work');
		await $`git add .`.quiet();
		await $`git commit -m "Add feature"`.quiet();
		await $`git checkout main`.quiet();

		// Create worktree from the unmerged branch
		await $`git worktree add ../feature-unmerged feature-unmerged`.quiet();

		// Try to remove the unmerged worktree
		await expect(removeCommand('feature-unmerged')).rejects.toThrow(UnmergedBranchError);
		await expect(removeCommand('feature-unmerged')).rejects.toThrow('not merged');
	});

	test('force flag bypasses all safety checks', async () => {
		// Create a feature branch with uncommitted changes
		await $`git checkout -b feature-force`.quiet();
		await writeFile('feature.txt', 'feature work');
		await $`git add .`.quiet();
		await $`git commit -m "Add feature"`.quiet();
		await $`git checkout main`.quiet();

		// Create worktree from the unmerged branch
		await $`git worktree add ../feature-force feature-force`.quiet();

		// Add uncommitted changes
		const featureDir = join(testDir, 'feature-force');
		await writeFile(join(featureDir, 'uncommitted.txt'), 'uncommitted');

		// Remove with force should succeed despite uncommitted changes and unmerged branch
		const exitCode = await removeCommand('feature-force', { force: true });
		expect(exitCode).toBe(0);
	});
});
