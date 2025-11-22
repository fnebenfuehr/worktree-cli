/**
 * Low-level git command primitives
 */

import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { $ } from 'bun';
import type { GitCommandResult } from '@/lib/types';
import { GitError, ValidationError } from '@/utils/errors';
import { exists } from '@/utils/fs';
import { tryCatch } from '@/utils/try-catch';

/**
 * Execute a git command
 */
export async function execGit(args: string[], cwd?: string): Promise<GitCommandResult> {
	const { error, data } = await tryCatch(async () => {
		const proc = cwd ? await $`git ${args}`.cwd(cwd).quiet() : await $`git ${args}`.quiet();
		return {
			stdout: proc.stdout.toString().trim(),
			stderr: proc.stderr.toString().trim(),
			exitCode: proc.exitCode,
		};
	});

	if (error) {
		throw new GitError(error.message, `git ${args.join(' ')}`, { cause: error });
	}

	if (data.exitCode !== 0) {
		throw new GitError(data.stderr || 'Git command failed', `git ${args.join(' ')}`);
	}

	return data;
}

/**
 * Find git repositories in subdirectories
 */
export async function findReposInSubdirs(dir: string): Promise<string[]> {
	const entries = await readdir(dir, { withFileTypes: true });

	const repos: string[] = [];
	for (const entry of entries) {
		if (entry.isDirectory()) {
			const gitDir = join(dir, entry.name, '.git');
			if (await exists(gitDir)) {
				repos.push(join(dir, entry.name));
			}
		}
	}

	return repos;
}

/**
 * Get the git repository root directory
 */
export async function getGitRoot(cwd?: string): Promise<string> {
	const { error, data } = await tryCatch(execGit(['rev-parse', '--show-toplevel'], cwd));

	if (error || !data) {
		// Check if we can find a git repo in subdirectories
		const repos = await findReposInSubdirs(cwd || process.cwd());
		const firstRepo = repos[0];
		if (firstRepo) {
			return firstRepo;
		}

		throw new ValidationError(
			'Not inside a git repository and no git repository found in subfolders. Run this from a git repository or use "worktree clone" first.',
			{ cause: error }
		);
	}

	return data.stdout;
}

/**
 * Get the git directory path
 */
export async function getGitDir(cwd?: string): Promise<string> {
	const { error, data } = await tryCatch(execGit(['rev-parse', '--git-dir'], cwd));
	if (error) {
		throw new GitError(
			'Could not determine git directory. Are you in a git repository?',
			'git rev-parse --git-dir',
			{ cause: error }
		);
	}
	return data.stdout;
}

/**
 * Get the common git directory (shared across worktrees)
 */
export async function getGitCommonDir(cwd?: string): Promise<string> {
	const { error, data } = await tryCatch(execGit(['rev-parse', '--git-common-dir'], cwd));
	if (error) {
		const [firstRepo] = await findReposInSubdirs(cwd || process.cwd());
		if (firstRepo) {
			const { error: fallbackError, data: fallbackData } = await tryCatch(
				execGit(['rev-parse', '--git-common-dir'], firstRepo)
			);
			if (!fallbackError && fallbackData) {
				return fallbackData.stdout;
			}
		}

		throw new GitError(
			'Could not determine common git directory',
			'git rev-parse --git-common-dir',
			{ cause: error }
		);
	}
	return data.stdout;
}

/**
 * Get the current branch name
 */
export async function gitGetCurrentBranch(cwd?: string): Promise<string> {
	const { error, data } = await tryCatch(execGit(['rev-parse', '--abbrev-ref', 'HEAD'], cwd));
	if (error) {
		throw new GitError('Could not determine current branch', 'git rev-parse --abbrev-ref HEAD', {
			cause: error,
		});
	}
	return data.stdout;
}

/**
 * Check if a local branch exists
 */
export async function gitBranchExists(branch: string, cwd?: string): Promise<boolean> {
	const { error } = await tryCatch(execGit(['show-ref', '--quiet', `refs/heads/${branch}`], cwd));
	return error === null;
}

/**
 * Check if a remote branch exists
 */
export async function gitRemoteBranchExists(branch: string, cwd?: string): Promise<boolean> {
	const { error } = await tryCatch(
		execGit(['ls-remote', '--heads', 'origin', `refs/heads/${branch}`], cwd)
	);
	if (error) {
		return false;
	}
	// If the command succeeded, check if we got any output (branch exists)
	const { data } = await tryCatch(
		execGit(['ls-remote', '--heads', 'origin', `refs/heads/${branch}`], cwd)
	);
	return data ? data.stdout.trim().length > 0 : false;
}

/**
 * Fetch a branch from remote
 */
export async function gitFetchRemoteBranch(branch: string, cwd?: string): Promise<void> {
	const { error } = await tryCatch(execGit(['fetch', 'origin', branch], cwd));
	if (error) {
		throw new GitError(
			`Failed to fetch branch '${branch}' from origin. Ensure the branch exists on remote and you have network access.`,
			`git fetch origin ${branch}`,
			{ cause: error }
		);
	}
}

/**
 * Set upstream tracking for a branch
 */
export async function gitSetUpstreamTracking(
	branch: string,
	upstream: string,
	cwd?: string
): Promise<void> {
	const { error } = await tryCatch(execGit(['branch', '--set-upstream-to', upstream, branch], cwd));
	if (error) {
		throw new GitError(
			`Failed to set upstream tracking for branch '${branch}' to '${upstream}'`,
			`git branch --set-upstream-to ${upstream} ${branch}`,
			{ cause: error }
		);
	}
}

/**
 * Create a new branch from a base branch
 */
export async function gitCreateBranch(
	branch: string,
	baseBranch: string,
	cwd?: string
): Promise<void> {
	// Remote ref (e.g., origin/feature) - use directly
	if (baseBranch.startsWith('origin/')) {
		const { error: branchError } = await tryCatch(execGit(['branch', branch, baseBranch], cwd));
		if (branchError) {
			throw new GitError(
				`Failed to create branch '${branch}' from '${baseBranch}'`,
				`git branch ${branch} ${baseBranch}`,
				{ cause: branchError }
			);
		}
		return;
	}

	// Local branch exists - use directly
	if (await gitBranchExists(baseBranch, cwd)) {
		const { error: branchError } = await tryCatch(execGit(['branch', branch, baseBranch], cwd));
		if (branchError) {
			throw new GitError(
				`Failed to create branch '${branch}' from '${baseBranch}'`,
				`git branch ${branch} ${baseBranch}`,
				{ cause: branchError }
			);
		}
		return;
	}

	// Not local - fetch from origin and create
	await gitFetchRemoteBranch(baseBranch, cwd);

	const { error: branchError } = await tryCatch(
		execGit(['branch', branch, `origin/${baseBranch}`], cwd)
	);
	if (branchError) {
		throw new GitError(
			`Failed to create branch '${branch}' from 'origin/${baseBranch}'`,
			`git branch ${branch} origin/${baseBranch}`,
			{ cause: branchError }
		);
	}
}

/**
 * List worktrees (raw output)
 */
export async function gitListWorktrees(cwd?: string): Promise<string> {
	const { error, data } = await tryCatch(execGit(['worktree', 'list'], cwd));
	if (error) {
		throw new GitError('Failed to list worktrees', 'git worktree list', { cause: error });
	}
	return data.stdout;
}

/**
 * Add a new worktree
 */
export async function gitAddWorktree(path: string, branch: string, cwd?: string): Promise<void> {
	const { error } = await tryCatch(execGit(['worktree', 'add', path, branch], cwd));
	if (error) {
		throw new GitError(
			`Failed to add worktree at '${path}' for branch '${branch}'`,
			`git worktree add ${path} ${branch}`,
			{ cause: error }
		);
	}
}

/**
 * Remove a worktree
 */
export async function gitRemoveWorktree(
	path: string,
	cwd?: string,
	options?: { force?: boolean }
): Promise<void> {
	const args = ['worktree', 'remove'];
	if (options?.force) {
		args.push('--force');
	}
	args.push(path);

	const { error } = await tryCatch(execGit(args, cwd));
	if (error) {
		throw new GitError(
			`Failed to remove worktree at '${path}'`,
			`git worktree remove ${args.slice(2).join(' ')}`,
			{ cause: error }
		);
	}
}

/**
 * Check if currently in a worktree (vs main repo)
 */
export async function gitIsWorktree(cwd?: string): Promise<boolean> {
	const gitDir = await getGitDir(cwd);
	const commonDir = await getGitCommonDir(cwd);

	// In worktrees: --git-dir points to .git/worktrees/name, --git-common-dir points to .git
	// In main repo: both point to the same location (.git)
	return gitDir !== commonDir;
}

/**
 * Check if a branch is merged into target branch
 */
export async function gitIsBranchMerged(
	branch: string,
	targetBranch: string,
	cwd?: string
): Promise<boolean> {
	// Use merge-base --is-ancestor to check if branch is merged into target
	// This checks if all commits from 'branch' are reachable from 'targetBranch'
	const { error } = await tryCatch(
		execGit(['merge-base', '--is-ancestor', branch, targetBranch], cwd)
	);

	// Exit code 0 = ancestor (merged), exit code 1 = not ancestor (not merged)
	// Any other error should be propagated
	if (!error) {
		return true;
	}

	// Check if it's the expected "not merged" error (exit code 1)
	if (error instanceof GitError && error.message.includes('exit code')) {
		return false;
	}

	// For any other error, throw it
	throw new GitError(
		`Failed to check if branch '${branch}' is merged into '${targetBranch}'`,
		`git merge-base --is-ancestor ${branch} ${targetBranch}`,
		{ cause: error }
	);
}

/**
 * Detailed working directory status
 */
export interface WorkingDirectoryStatus {
	staged: string[];
	unstaged: string[];
	untracked: string[];
	hasChanges: boolean;
}

/**
 * Get detailed working directory status
 */
export async function gitGetWorkingDirectoryStatus(cwd?: string): Promise<WorkingDirectoryStatus> {
	// Use raw exec to preserve leading spaces (don't use execGit which trims)
	const { error, data } = await tryCatch(async () => {
		const proc = cwd
			? await $`git status --porcelain`.cwd(cwd).quiet()
			: await $`git status --porcelain`.quiet();
		return proc.stdout.toString();
	});

	if (error) {
		throw new GitError('Could not check git status', 'git status --porcelain', { cause: error });
	}

	const staged: string[] = [];
	const unstaged: string[] = [];
	const untracked: string[] = [];

	const lines = data.split('\n').filter((line) => line.length > 0);

	for (const line of lines) {
		// Porcelain format: XY filename (where XY is 2 chars, then space, then filename)
		// Use regex to properly parse the format
		const match = line.match(/^(.)(.) (.+)$/);
		if (!match || !match[1] || !match[2] || !match[3]) continue;

		const indexStatus = match[1];
		const workTreeStatus = match[2];
		const filename = match[3];

		// Untracked files
		if (indexStatus === '?' && workTreeStatus === '?') {
			untracked.push(filename);
			continue;
		}

		// Staged changes (index has changes)
		if (indexStatus !== ' ' && indexStatus !== '?') {
			staged.push(filename);
		}

		// Unstaged changes (worktree has changes)
		if (workTreeStatus !== ' ' && workTreeStatus !== '?') {
			unstaged.push(filename);
		}
	}

	return {
		staged,
		unstaged,
		untracked,
		hasChanges: staged.length > 0 || unstaged.length > 0 || untracked.length > 0,
	};
}

/**
 * Format working directory status for display
 */
export function formatWorkingDirectoryStatus(status: WorkingDirectoryStatus): string {
	const parts: string[] = [];

	if (status.staged.length > 0) {
		parts.push(`Staged changes (${status.staged.length}):`);
		for (const file of status.staged.slice(0, 5)) {
			parts.push(`  • ${file}`);
		}
		if (status.staged.length > 5) {
			parts.push(`  ... and ${status.staged.length - 5} more`);
		}
	}

	if (status.unstaged.length > 0) {
		if (parts.length > 0) parts.push('');
		parts.push(`Unstaged changes (${status.unstaged.length}):`);
		for (const file of status.unstaged.slice(0, 5)) {
			parts.push(`  • ${file}`);
		}
		if (status.unstaged.length > 5) {
			parts.push(`  ... and ${status.unstaged.length - 5} more`);
		}
	}

	if (status.untracked.length > 0) {
		if (parts.length > 0) parts.push('');
		parts.push(`Untracked files (${status.untracked.length}):`);
		for (const file of status.untracked.slice(0, 5)) {
			parts.push(`  • ${file}`);
		}
		if (status.untracked.length > 5) {
			parts.push(`  ... and ${status.untracked.length - 5} more`);
		}
	}

	return parts.join('\n');
}

/**
 * Check for uncommitted changes
 */
export async function gitHasUncommittedChanges(
	cwd?: string,
	options?: { includeUntracked?: boolean }
): Promise<boolean> {
	const status = await gitGetWorkingDirectoryStatus(cwd);

	if (options?.includeUntracked) {
		return status.hasChanges;
	}

	return status.staged.length > 0 || status.unstaged.length > 0;
}
