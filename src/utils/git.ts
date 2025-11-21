import { readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { $ } from 'bun';
import { GitError, ValidationError } from '@/utils/errors';
import { exists } from '@/utils/fs';
import { tryCatch } from '@/utils/try-catch';

export interface GitCommandResult {
	stdout: string;
	stderr: string;
	exitCode: number;
}

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

export async function findGitReposInSubdirs(dir: string): Promise<string[]> {
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

	if (repos.length === 0) {
		return repos;
	}

	// Prioritize default branch worktree
	const firstRepo = repos[0];
	const { error, data } = await tryCatch(getDefaultBranch(firstRepo));
	if (!error && data) {
		const defaultBranchPath = join(dir, data);
		if (repos.includes(defaultBranchPath)) {
			// Move default branch to front
			return [defaultBranchPath, ...repos.filter((r) => r !== defaultBranchPath)];
		}
	}

	return repos;
}

export async function getGitRoot(cwd?: string): Promise<string> {
	const { error, data } = await tryCatch(execGit(['rev-parse', '--show-toplevel'], cwd));

	if (error || !data) {
		// Check if we can find a git repo in subdirectories
		const repos = await findGitReposInSubdirs(cwd || process.cwd());
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

export async function getGitCommonDir(cwd?: string): Promise<string> {
	const { error, data } = await tryCatch(execGit(['rev-parse', '--git-common-dir'], cwd));
	if (error) {
		const [firstRepo] = await findGitReposInSubdirs(cwd || process.cwd());
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

export async function getMainWorktreePath(cwd?: string): Promise<string> {
	const commonDir = await getGitCommonDir(cwd);
	return dirname(commonDir);
}

export async function hasWorktreeStructure(cwd?: string): Promise<boolean> {
	const commonDir = await getGitCommonDir(cwd);
	const worktreesDir = join(commonDir, 'worktrees');

	// Check if worktrees directory exists and has entries
	const { error, data } = await tryCatch(readdir(worktreesDir));
	if (error) {
		return false;
	}

	return data.length > 0;
}

export async function getCurrentBranch(cwd?: string): Promise<string> {
	const { error, data } = await tryCatch(execGit(['rev-parse', '--abbrev-ref', 'HEAD'], cwd));
	if (error) {
		throw new GitError('Could not determine current branch', 'git rev-parse --abbrev-ref HEAD', {
			cause: error,
		});
	}
	return data.stdout;
}

export async function getDefaultBranch(cwd?: string): Promise<string> {
	// Try 1: Get default branch from remote
	const { error, data } = await tryCatch(execGit(['remote', 'show', 'origin'], cwd));

	if (!error) {
		const match = data.stdout.match(/HEAD branch:\s*(.+)/);
		const branch = match?.[1]?.trim();
		// Filter out git's "(unknown)" placeholder (happens with empty bare repos)
		if (branch && branch !== '(unknown)') {
			return branch;
		}
	}

	// Try 2: Check if 'main' branch exists locally
	if (await branchExists('main', cwd)) {
		return 'main';
	}

	// Try 3: Check if 'master' branch exists locally
	if (await branchExists('master', cwd)) {
		return 'master';
	}

	// Try 4: Use current branch as fallback
	const { error: currentError, data: currentData } = await tryCatch(
		execGit(['rev-parse', '--abbrev-ref', 'HEAD'], cwd)
	);

	if (!currentError && currentData.stdout) {
		return currentData.stdout;
	}

	// If all strategies fail, throw
	throw new GitError(
		'Could not determine default branch. No remote configured, and neither main nor master branches exist locally.',
		'git remote show origin'
	);
}

export async function branchExists(branch: string, cwd?: string): Promise<boolean> {
	const { error } = await tryCatch(execGit(['show-ref', '--quiet', `refs/heads/${branch}`], cwd));
	return error === null;
}

export async function remoteBranchExists(branch: string, cwd?: string): Promise<boolean> {
	// Fetch the remote branch info without downloading all objects
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

export async function fetchRemoteBranch(branch: string, cwd?: string): Promise<void> {
	const { error } = await tryCatch(execGit(['fetch', 'origin', branch], cwd));
	if (error) {
		throw new GitError(
			`Failed to fetch branch '${branch}' from origin. Ensure the branch exists on remote and you have network access.`,
			`git fetch origin ${branch}`,
			{ cause: error }
		);
	}
}

export async function setUpstreamTracking(
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

export async function createBranch(
	branch: string,
	baseBranch: string,
	cwd?: string
): Promise<void> {
	// Case 1: Remote ref (e.g., origin/feature) - use directly
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

	// Case 2: Local branch exists - use directly
	if (await branchExists(baseBranch, cwd)) {
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

	// Case 3: Not local - fetch from origin and create
	await fetchRemoteBranch(baseBranch, cwd);

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

export interface WorktreeInfo {
	path: string;
	commit: string;
	branch: string;
}

export async function listWorktrees(cwd?: string): Promise<string> {
	const { error, data } = await tryCatch(execGit(['worktree', 'list'], cwd));
	if (error) {
		throw new GitError('Failed to list worktrees', 'git worktree list', { cause: error });
	}
	return data.stdout;
}

// Example input:
// /path/to/main  abc1234 [main]
// /path/to/feature  def5678 [feature/my-feature]
const WORKTREE_LINE_PATTERN = /^(.+?)\s+([a-f0-9]+)(?:\s+[[(](.+?)[\])])?$/;

export async function getWorktrees(cwd?: string): Promise<WorktreeInfo[]> {
	const output = await listWorktrees(cwd);

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

export async function addWorktree(path: string, branch: string, cwd?: string): Promise<void> {
	const { error } = await tryCatch(execGit(['worktree', 'add', path, branch], cwd));
	if (error) {
		throw new GitError(
			`Failed to add worktree at '${path}' for branch '${branch}'`,
			`git worktree add ${path} ${branch}`,
			{ cause: error }
		);
	}
}

export async function removeWorktree(
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

export async function isWorktree(cwd?: string): Promise<boolean> {
	const gitDir = await getGitDir(cwd);
	const commonDir = await getGitCommonDir(cwd);

	// In worktrees: --git-dir points to .git/worktrees/name, --git-common-dir points to .git
	// In main repo: both point to the same location (.git)
	return gitDir !== commonDir;
}

export async function isBranchMerged(
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

export async function hasUncommittedChanges(
	cwd?: string,
	options?: { includeUntracked?: boolean }
): Promise<boolean> {
	const args = ['status', '--porcelain'];
	if (!options?.includeUntracked) {
		args.push('--untracked-files=no');
	}

	const { error, data } = await tryCatch(execGit(args, cwd));
	if (error) {
		throw new GitError('Could not check git status', `git ${args.join(' ')}`, { cause: error });
	}

	return data.stdout.trim().length > 0;
}
