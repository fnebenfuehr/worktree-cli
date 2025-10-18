import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
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

export async function createBranch(
	branch: string,
	baseBranch: string,
	cwd?: string
): Promise<void> {
	const { error: fetchError } = await tryCatch(execGit(['fetch', 'origin', baseBranch], cwd));
	if (fetchError) {
		throw new GitError(
			`Failed to fetch branch '${baseBranch}' from origin`,
			`git fetch origin ${baseBranch}`,
			{ cause: fetchError }
		);
	}

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
	const { error: gitDirError, data: gitDirData } = await tryCatch(
		execGit(['rev-parse', '--git-dir'], cwd)
	);
	if (gitDirError) {
		throw new GitError(
			'Could not determine git directory. Are you in a git repository?',
			'git rev-parse --git-dir',
			{ cause: gitDirError }
		);
	}

	const { error: commonDirError, data: commonDirData } = await tryCatch(
		execGit(['rev-parse', '--git-common-dir'], cwd)
	);
	if (commonDirError) {
		throw new GitError(
			'Could not determine common git directory',
			'git rev-parse --git-common-dir',
			{ cause: commonDirError }
		);
	}

	// In worktrees: --git-dir points to .git/worktrees/name, --git-common-dir points to .git
	// In main repo: both point to the same location (.git)
	return gitDirData.stdout !== commonDirData.stdout;
}

export async function isBranchMerged(
	branch: string,
	targetBranch: string,
	cwd?: string
): Promise<boolean> {
	const { error, data } = await tryCatch(execGit(['branch', '--merged', targetBranch], cwd));

	if (error) {
		throw new GitError(
			`Failed to check if branch '${branch}' is merged into '${targetBranch}'`,
			`git branch --merged ${targetBranch}`,
			{ cause: error }
		);
	}

	const mergedBranches = data.stdout
		.split('\n')
		.map((line: string) => line.trim().replace(/^\*\s+/, ''))
		.filter((line: string) => line.length > 0);

	return mergedBranches.includes(branch);
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
