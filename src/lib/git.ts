/**
 * High-level git operations for worktree management
 */

import { dirname } from 'node:path';
import { configExists, loadConfig } from '@/lib/config';
import type { WorktreeInfo } from '@/lib/types';
import { GitError } from '@/utils/errors';
import { execGit, getGitRoot, gitBranchExists, gitListWorktrees } from '@/utils/git';
import { tryCatch } from '@/utils/try-catch';

/**
 * Get the project root directory (parent of all worktrees)
 */
export async function getProjectRoot(cwd?: string): Promise<string> {
	const gitRoot = await getGitRoot(cwd);
	return dirname(gitRoot);
}

/**
 * Check if the repository has worktree structure enabled
 * Detects by checking for config file
 */
export async function hasWorktreeStructure(cwd?: string): Promise<boolean> {
	const gitRoot = await getGitRoot(cwd);
	return configExists(gitRoot);
}

/**
 * Get the default branch for the repository
 * Reads from config first, falls back to detection
 */
export async function getDefaultBranch(cwd?: string): Promise<string> {
	const gitRoot = await getGitRoot(cwd);
	const config = await loadConfig(gitRoot);
	if (config?.defaultBranch) {
		return config.defaultBranch;
	}

	const { error, data } = await tryCatch(execGit(['remote', 'show', 'origin'], cwd));

	if (!error) {
		const match = data.stdout.match(/HEAD branch:\s*(.+)/);
		const branch = match?.[1]?.trim();
		if (branch && branch !== '(unknown)') {
			return branch;
		}
	}

	if (await gitBranchExists('main', cwd)) {
		return 'main';
	}

	if (await gitBranchExists('master', cwd)) {
		return 'master';
	}

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
