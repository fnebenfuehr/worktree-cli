/**
 * Integration tests for MCP tool entry points (src/mcp/tools.ts)
 * Tests error classification and Result type handling
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { $ } from 'bun';
import {
	worktreeCreate,
	worktreeList,
	worktreeRemove,
	worktreeSetup,
	worktreeStatus,
	worktreeSwitch,
} from '@/mcp/tools';

let testDir: string;
let originalCwd: string;

beforeEach(async () => {
	originalCwd = process.cwd();
	testDir = await mkdtemp(join(tmpdir(), 'mcp-test-'));
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

	// Set bare repo HEAD (worktrees work fine without pushing)
	await $`git --git-dir=${testDir}/.bare symbolic-ref HEAD refs/heads/main`.quiet();
});

afterEach(async () => {
	process.chdir(originalCwd);
	await rm(testDir, { recursive: true, force: true });
});

describe('MCP worktreeStatus', () => {
	test('returns success with status data', async () => {
		const result = await worktreeStatus();

		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.enabled).toBe(true);
			expect(result.data.count).toBeGreaterThan(0);
			expect(result.data.defaultBranch).toBe('main');
		}
	});

	test('returns validation_error when not in git repo', async () => {
		// Go to temp dir without any git repo
		const nonGitDir = await mkdtemp(join(tmpdir(), 'non-git-'));
		process.chdir(nonGitDir);

		const result = await worktreeStatus();

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.type).toBe('validation_error');
			expect(result.recoverable).toBe(true);
			expect(result.error).toContain('Not inside a git repository');
		}

		// Cleanup
		process.chdir(testDir);
		await rm(nonGitDir, { recursive: true, force: true });
	});
});

describe('MCP worktreeList', () => {
	test('returns success with worktree list', async () => {
		const result = await worktreeList();

		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.length).toBe(1);
			expect(result.data[0].branch).toBe('main');
		}
	});

	test('includes all worktrees', async () => {
		// Create additional worktree
		await worktreeCreate('feature/test');

		const result = await worktreeList();

		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.length).toBe(2);
			expect(result.data.some((wt) => wt.branch === 'feature/test')).toBe(true);
		}
	});
});

describe('MCP worktreeCreate', () => {
	test('returns success with created worktree data', async () => {
		const result = await worktreeCreate('feature/new');

		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.branch).toBe('feature/new');
			expect(result.data.created).toBe(true);
			expect(result.data.path).toContain('feature-new');
		}
	});

	test('returns success when creating from existing branch', async () => {
		await $`git branch feature/existing`.quiet();

		const result = await worktreeCreate('feature/existing');

		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.branch).toBe('feature/existing');
			expect(result.data.created).toBe(false);
		}
	});

	test('accepts custom base branch', async () => {
		// Create develop branch locally
		await $`git checkout -b develop`.quiet();
		await writeFile('develop.txt', 'develop');
		await $`git add .`.quiet();
		await $`git commit -m "Develop"`.quiet();
		await $`git checkout main`.quiet();

		const result = await worktreeCreate('feature/from-develop', 'develop');

		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.branch).toBe('feature/from-develop');
		}
	});

	test('returns validation_error for invalid branch name', async () => {
		const result = await worktreeCreate('feature..invalid');

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.type).toBe('validation_error');
			expect(result.error).toContain('Invalid branch name');
			expect(result.recoverable).toBe(true);
		}
	});

	test('returns filesystem_error when directory exists', async () => {
		await worktreeCreate('feature/duplicate');

		const result = await worktreeCreate('feature/duplicate');

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.type).toBe('filesystem_error');
			expect(result.error).toContain('already exists');
			expect(result.recoverable).toBe(true);
		}
	});
});

describe('MCP worktreeSwitch', () => {
	test('returns success with worktree path', async () => {
		const result = await worktreeSwitch('main');

		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.branch).toBe('main');
			expect(result.data.path).toContain('main');
		}
	});

	test('finds created worktree', async () => {
		await worktreeCreate('feature/switch-test');

		const result = await worktreeSwitch('feature/switch-test');

		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.branch).toBe('feature/switch-test');
			expect(result.data.path).toContain('feature-switch-test');
		}
	});

	test('returns filesystem_error for non-existent worktree', async () => {
		const result = await worktreeSwitch('nonexistent');

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.type).toBe('filesystem_error');
			expect(result.error).toContain('No worktree found for branch');
			expect(result.recoverable).toBe(true);
		}
	});
});

describe('MCP worktreeRemove - safety checks', () => {
	test('returns git_error for unmerged branch (without force)', async () => {
		// Create unmerged branch
		await $`git checkout -b feature/unmerged`.quiet();
		await writeFile('feature.txt', 'work');
		await $`git add .`.quiet();
		await $`git commit -m "Add feature"`.quiet();
		await $`git checkout main`.quiet();
		await $`git worktree add ../feature-unmerged feature/unmerged`.quiet();

		const result = await worktreeRemove('feature/unmerged', false);

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.type).toBe('git_error');
			expect(result.error).toContain('not merged');
			expect(result.suggestion).toContain('force: true');
			expect(result.suggestion).toContain('only if explicitly requested by user');
		}
	});

	test('returns git_error for uncommitted changes (without force)', async () => {
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

		const result = await worktreeRemove('feature/dirty', false);

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.type).toBe('git_error');
			// Will error on uncommitted changes first (checked before merge status)
			expect(result.error).toContain('uncommitted changes');
			expect(result.recoverable).toBe(true);
			expect(result.suggestion).toContain('force: true');
		}
	});

	test('force: true bypasses all safety checks', async () => {
		// Create unmerged branch with uncommitted changes
		await $`git checkout -b feature/force`.quiet();
		await writeFile('feature.txt', 'work');
		await $`git add .`.quiet();
		await $`git commit -m "Add feature"`.quiet();
		await $`git checkout main`.quiet();
		await $`git worktree add ../feature-force feature/force`.quiet();

		// Add uncommitted change
		const featurePath = join(testDir, 'feature-force');
		await writeFile(join(featurePath, 'uncommitted.txt'), 'uncommitted');

		// Should succeed with force
		const result = await worktreeRemove('feature/force', true);

		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.path).toContain('feature-force');
		}
	});

	test('returns filesystem_error for non-existent worktree', async () => {
		const result = await worktreeRemove('nonexistent', false);

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.type).toBe('filesystem_error');
			expect(result.error).toContain('No such worktree directory');
		}
	});
});

describe('MCP worktreeSetup', () => {
	test('returns git_error when not in git repo root', async () => {
		process.chdir(testDir);
		const result = await worktreeSetup();

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.type).toBe('git_error');
			expect(result.error).toContain('Could not determine git directory');
		}
	});

	test('returns validation_error when already in worktree directory', async () => {
		// Create a real worktree and try to run setup from it
		await worktreeCreate('feature/test-setup');
		const featurePath = join(testDir, 'feature-test-setup');
		process.chdir(featurePath);

		const result = await worktreeSetup();

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.type).toBe('validation_error');
			expect(result.error).toContain('Already in a worktree directory');
		}

		// Restore
		process.chdir(join(testDir, 'main'));
	});
});

describe('MCP error classification', () => {
	test('classifies UncommittedChangesError as git_error', async () => {
		// Create unmerged branch with uncommitted changes
		await $`git checkout -b feature/test`.quiet();
		await writeFile('feature.txt', 'work');
		await $`git add .`.quiet();
		await $`git commit -m "Add feature"`.quiet();
		await $`git checkout main`.quiet();
		await $`git worktree add ../feature-test feature/test`.quiet();

		// Add uncommitted change
		const featurePath = join(testDir, 'feature-test');
		await writeFile(join(featurePath, 'uncommitted.txt'), 'uncommitted');

		const result = await worktreeRemove('feature/test', false);

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.type).toBe('git_error');
			expect(result.recoverable).toBe(true);
		}
	});

	test('classifies UnmergedBranchError as git_error', async () => {
		await $`git checkout -b feature/unmerged`.quiet();
		await writeFile('feature.txt', 'work');
		await $`git add .`.quiet();
		await $`git commit -m "Add feature"`.quiet();
		await $`git checkout main`.quiet();
		await $`git worktree add ../feature-unmerged feature/unmerged`.quiet();

		const result = await worktreeRemove('feature/unmerged', false);

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.type).toBe('git_error');
			expect(result.recoverable).toBe(true);
		}
	});

	test('provides helpful suggestions for recoverable errors', async () => {
		const result = await worktreeCreate('invalid..branch');

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.recoverable).toBe(true);
			expect(result.suggestion).toBeDefined();
			expect(result.suggestion).toContain('Verify input parameters');
		}
	});
});
