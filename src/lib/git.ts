/**
 * High-level git operations for worktree management
 */

import { readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { WorktreeInfo } from '@/lib/types';
import { GitError } from '@/utils/errors';
import { execGit, getGitCommonDir, gitBranchExists, gitListWorktrees } from '@/utils/git';
import { tryCatch } from '@/utils/try-catch';

/**
 * Get the path to the main worktree
 */
export async function getMainWorktreePath(cwd?: string): Promise<string> {
	const commonDir = await getGitCommonDir(cwd);
	return dirname(commonDir);
}

/**
 * Check if the repository has worktree structure enabled
 */
export async function hasWorktreeStructure(cwd?: string): Promise<boolean> {
	const commonDir = await getGitCommonDir(cwd);
	const worktreesDir = join(commonDir, 'worktrees');

	const { error, data } = await tryCatch(readdir(worktreesDir));
	if (error) {
		return false;
	}

	return data.length > 0;
}

/**
 * Get the default branch for the repository
 */
export async function getDefaultBranch(cwd?: string): Promise<string> {
	// Get default branch from remote
	const { error, data } = await tryCatch(execGit(['remote', 'show', 'origin'], cwd));

	if (!error) {
		const match = data.stdout.match(/HEAD branch:\s*(.+)/);
		const branch = match?.[1]?.trim();
		if (branch && branch !== '(unknown)') {
			return branch;
		}
	}

	// Check if 'main' branch exists locally
	if (await gitBranchExists('main', cwd)) {
		return 'main';
	}

	// Check if 'master' branch exists locally
	if (await gitBranchExists('master', cwd)) {
		return 'master';
	}

	// Use current branch as fallback
	const { error: currentError, data: currentData } = await tryCatch(
		execGit(['rev-parse', '--abbrev-ref', 'HEAD'], cwd)
	);

	if (!currentError && currentData.stdout) {
		return currentData.stdout;
	}

	throw new GitError(
		'Could not determine default branch. No remote configured, and neither main nor master branches exist locally.',
		'git remote show origin'
	);
}

// Pattern for parsing worktree list output
const WORKTREE_LINE_PATTERN = /^(.+?)\s+([a-f0-9]+)(?:\s+[[(](.+?)[\])])?$/;

/**
 * Get parsed list of worktrees
 */
export async function getWorktrees(cwd?: string): Promise<WorktreeInfo[]> {
	const output = await gitListWorktrees(cwd);

	if (!output) {
		return [];
	}

	const worktrees: WorktreeInfo[] = [];
	const lines = output.split('\n').filter((line) => line.trim());

	for (const line of lines) {
		const match = line.match(WORKTREE_LINE_PATTERN);

		if (!match) continue;

		const [, path, commit, branch] = match;
		if (!path || !commit) continue;

		worktrees.push({
			path: path.trim(),
			commit: commit.trim(),
			branch: branch?.trim() || 'detached',
		});
	}

	return worktrees;
}
