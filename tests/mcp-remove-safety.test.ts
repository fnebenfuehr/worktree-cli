/**
 * Integration tests for MCP worktree_remove safety checks
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { $ } from 'bun';
import { worktreeRemove } from '@/mcp/tools';

let testDir: string;
let originalCwd: string;

beforeEach(async () => {
	originalCwd = process.cwd();
	testDir = await mkdtemp(join(tmpdir(), 'mcp-remove-safety-test-'));
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
});

afterEach(async () => {
	process.chdir(originalCwd);
	await rm(testDir, { recursive: true, force: true });
});

describe('MCP worktree_remove Safety Checks', () => {
	test('returns git_error for unmerged branch', async () => {
		// Create a feature branch with commits
		await $`git checkout -b feature-unmerged`.quiet();
		await writeFile('feature.txt', 'feature work');
		await $`git add .`.quiet();
		await $`git commit -m "Add feature"`.quiet();
		await $`git checkout main`.quiet();

		// Create worktree from the unmerged branch
		await $`git worktree add ../feature-unmerged feature-unmerged`.quiet();

		// Try to remove via MCP
		const result = await worktreeRemove('feature-unmerged', false);

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.type).toBe('git_error');
			expect(result.error).toContain('not merged');
			expect(result.suggestion).toContain('force: true');
			expect(result.suggestion).toContain('only if explicitly requested by user');
		}
	});

	test('force: true bypasses all safety checks', async () => {
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

		// Remove with force via MCP should succeed
		const result = await worktreeRemove('feature-force', true);

		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.path).toContain('feature-force');
		}
	});

	test('returns appropriate error types and suggestions', async () => {
		// Create a feature branch
		await $`git checkout -b feature-test`.quiet();
		await writeFile('feature.txt', 'work');
		await $`git add .`.quiet();
		await $`git commit -m "Add feature"`.quiet();
		await $`git checkout main`.quiet();

		// Create worktree from unmerged branch
		await $`git worktree add ../feature-test feature-test`.quiet();

		// Try to remove via MCP - should get unmerged error
		const result = await worktreeRemove('feature-test', false);

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.type).toBe('git_error');
			expect(result.recoverable).toBe(true);
			expect(result.suggestion).toContain('force: true');
			expect(result.suggestion).toContain('explicitly requested by user');
		}
	});
});
