import { $ } from 'bun';
import { GitError, ValidationError } from '@/utils/errors';
import { findGitReposInSubdirs } from '@/utils/fs';
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

export async function getGitRoot(cwd?: string): Promise<string | null> {
	const { error, data } = await execGit(['rev-parse', '--show-toplevel'], cwd);
	if (error) return null;
	return data.stdout;
}

export async function findGitRootOrThrow(): Promise<string> {
	let gitRoot = await getGitRoot();

	if (!gitRoot) {
		const repos = await findGitReposInSubdirs(process.cwd());
		if (repos.length > 0) {
			gitRoot = repos[0] ?? null;
		}
	}

	if (!gitRoot) {
		throw new ValidationError(
			'Not inside a git repository and no git repository found in subfolders. Run this from a git repository or use "worktree clone" first.'
		);
	}

	return gitRoot;
}

export async function getCurrentBranch(cwd?: string): Promise<string | null> {
	const { error, data } = await execGit(['rev-parse', '--abbrev-ref', 'HEAD'], cwd);
	if (error) return null;
	return data.stdout;
}

export async function getDefaultBranch(cwd?: string): Promise<string | undefined> {
	const { error, data } = await execGit(['remote', 'show', 'origin'], cwd);

	if (!error) {
		const match = data.stdout.match(/HEAD branch:\s*(.+)/);
		if (match?.[1]) {
			return match[1].trim();
		}
	}

	return undefined;
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

export async function getWorktreeList(cwd?: string): Promise<WorktreeInfo[]> {
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

export async function isGitRepository(cwd?: string): Promise<boolean> {
	const { error } = await execGit(['rev-parse', '--git-dir'], cwd);
	return error === null;
}

export async function isBranchMerged(branch: string, targetBranch: string, cwd?: string): Promise<boolean> {
	// git branch --merged <targetBranch> lists all branches merged into targetBranch
	const result = await execGit(['branch', '--merged', targetBranch], cwd);

	if (!result.success) {
		return false;
	}

	// Parse output - format is "  branch-name" or "* current-branch"
	const mergedBranches = result.stdout
		.split('\n')
		.map(line => line.trim().replace(/^\*\s+/, ''))
		.filter(line => line.length > 0);

	return mergedBranches.includes(branch);
}
