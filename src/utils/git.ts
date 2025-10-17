import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { $ } from 'bun';
import { GitError, ValidationError } from '@/utils/errors';
import { exists } from '@/utils/fs';
import { type Result, tryCatch } from '@/utils/try-catch';

export interface GitCommandResult {
	stdout: string;
	stderr: string;
	exitCode: number;
}

export async function execGit(
	args: string[],
	cwd?: string
): Promise<Result<GitCommandResult, GitError>> {
	const { error, data } = await tryCatch(async () => {
		const proc = cwd ? await $`git ${args}`.cwd(cwd).quiet() : await $`git ${args}`.quiet();
		return {
			stdout: proc.stdout.toString().trim(),
			stderr: proc.stderr.toString().trim(),
			exitCode: proc.exitCode,
		};
	});

	if (error) {
		return {
			error: new GitError(error.message, `git ${args.join(' ')}`, { cause: error }),
			data: null,
		};
	}

	if (data.exitCode !== 0) {
		return {
			error: new GitError(data.stderr || 'Git command failed', `git ${args.join(' ')}`),
			data: null,
		};
	}

	return { error: null, data };
}

export async function findGitReposInSubdirs(dir: string): Promise<string[]> {
	const { error, data: entries } = await tryCatch(readdir(dir, { withFileTypes: true }));
	if (error) return [];

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
	const { error, data } = await execGit(['rev-parse', '--show-toplevel'], cwd);

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
	const { error, data } = await execGit(['rev-parse', '--abbrev-ref', 'HEAD'], cwd);

	if (error) {
		throw new GitError('Could not determine current branch', 'git rev-parse --abbrev-ref HEAD', {
			cause: error,
		});
	}

	return data.stdout;
}

export async function getDefaultBranch(cwd?: string): Promise<string> {
	// Try 1: Get default branch from remote
	const { error, data } = await execGit(['remote', 'show', 'origin'], cwd);

	if (!error) {
		const match = data.stdout.match(/HEAD branch:\s*(.+)/);
		if (match?.[1]) {
			return match[1].trim();
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
	const { error: currentError, data: currentData } = await execGit(
		['rev-parse', '--abbrev-ref', 'HEAD'],
		cwd
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
	const { error } = await execGit(['show-ref', '--quiet', `refs/heads/${branch}`], cwd);
	return error === null;
}

export async function createBranch(
	branch: string,
	baseBranch: string,
	cwd?: string
): Promise<void> {
	const fetchResult = await execGit(['fetch', 'origin', baseBranch], cwd);
	if (fetchResult.error) {
		throw fetchResult.error;
	}

	const branchResult = await execGit(['branch', branch, `origin/${baseBranch}`], cwd);
	if (branchResult.error) {
		throw branchResult.error;
	}
}

export interface WorktreeInfo {
	path: string;
	commit: string;
	branch: string;
}

export async function listWorktrees(cwd?: string): Promise<string> {
	const result = await execGit(['worktree', 'list'], cwd);
	if (result.error) throw result.error;
	return result.data.stdout;
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
	const { error } = await execGit(['worktree', 'add', path, branch], cwd);
	if (error) throw error;
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

	const { error } = await execGit(args, cwd);
	if (error) throw error;
}

export async function isWorktree(cwd?: string): Promise<boolean> {
	const gitDirResult = await execGit(['rev-parse', '--git-dir'], cwd);
	const commonDirResult = await execGit(['rev-parse', '--git-common-dir'], cwd);

	if (gitDirResult.error) {
		throw new GitError(
			'Could not determine git directory. Are you in a git repository?',
			'git rev-parse --git-dir',
			{ cause: gitDirResult.error }
		);
	}

	if (commonDirResult.error) {
		throw new GitError(
			'Could not determine common git directory',
			'git rev-parse --git-common-dir',
			{ cause: commonDirResult.error }
		);
	}

	// In worktrees: --git-dir points to .git/worktrees/name, --git-common-dir points to .git
	// In main repo: both point to the same location (.git)
	return gitDirResult.data.stdout !== commonDirResult.data.stdout;
}

export async function isBranchMerged(
	branch: string,
	targetBranch: string,
	cwd?: string
): Promise<boolean | null> {
	const result = await execGit(['branch', '--merged', targetBranch], cwd);

	if (result.error) {
		return null;
	}

	const mergedBranches = result.data.stdout
		.split('\n')
		.map((line: string) => line.trim().replace(/^\*\s+/, ''))
		.filter((line: string) => line.length > 0);

	return mergedBranches.includes(branch);
}
