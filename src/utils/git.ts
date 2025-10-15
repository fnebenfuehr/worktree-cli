import { $ } from 'bun';
import { GitError, ValidationError } from '@/utils/errors';
import { findGitReposInSubdirs } from '@/utils/fs';

export interface GitCommandResult {
	success: boolean;
	stdout: string;
	stderr: string;
	exitCode: number;
}

export async function execGit(args: string[], cwd?: string): Promise<GitCommandResult> {
	try {
		const proc = cwd ? await $`git ${args}`.cwd(cwd).quiet() : await $`git ${args}`.quiet();

		return {
			success: proc.exitCode === 0,
			stdout: proc.stdout.toString().trim(),
			stderr: proc.stderr.toString().trim(),
			exitCode: proc.exitCode,
		};
	} catch (error) {
		return {
			success: false,
			stdout: '',
			stderr: error instanceof Error ? error.message : String(error),
			exitCode: 1,
		};
	}
}

export async function getGitRoot(cwd?: string): Promise<string | null> {
	const result = await execGit(['rev-parse', '--show-toplevel'], cwd);
	return result.success ? result.stdout : null;
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
	const result = await execGit(['rev-parse', '--abbrev-ref', 'HEAD'], cwd);
	return result.success ? result.stdout : null;
}

export async function getDefaultBranch(cwd?: string): Promise<string> {
	const result = await execGit(['remote', 'show', 'origin'], cwd);

	if (result.success) {
		const match = result.stdout.match(/HEAD branch:\s*(.+)/);
		if (match?.[1]) {
			return match[1].trim();
		}
	}

	return 'main';
}

export async function branchExists(branch: string, cwd?: string): Promise<boolean> {
	const result = await execGit(['show-ref', '--quiet', `refs/heads/${branch}`], cwd);
	return result.success;
}

export async function createBranch(
	branch: string,
	baseBranch: string,
	cwd?: string
): Promise<void> {
	const fetchResult = await execGit(['fetch', 'origin', baseBranch], cwd);
	if (!fetchResult.success) {
		throw new GitError(
			`Failed to fetch origin/${baseBranch}. Is the remote configured correctly?`,
			`git fetch origin ${baseBranch}`
		);
	}

	const branchResult = await execGit(['branch', branch, `origin/${baseBranch}`], cwd);
	if (!branchResult.success) {
		const errorMsg = branchResult.stderr.trim() || 'Unknown error';
		throw new GitError(
			`Failed to create branch '${branch}' from origin/${baseBranch}: ${errorMsg}`,
			`git branch ${branch} origin/${baseBranch}`
		);
	}
}

export interface WorktreeInfo {
	path: string;
	commit: string;
	branch: string;
}

export async function listWorktrees(cwd?: string): Promise<string> {
	const result = await execGit(['worktree', 'list'], cwd);
	return result.stdout;
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
	const result = await execGit(['worktree', 'add', path, branch], cwd);

	if (!result.success) {
		let message = `Failed to add worktree at '${path}' for branch '${branch}'`;
		const stderr = result.stderr.trim();

		if (stderr.includes('already exists')) {
			message += ': Directory already exists';
		} else if (stderr.includes('is already checked out')) {
			message += ': Branch is already checked out in another worktree';
		} else if (stderr) {
			message += `: ${stderr}`;
		}

		throw new GitError(message, `git worktree add ${path} ${branch}`);
	}
}

export async function removeWorktree(path: string, cwd?: string): Promise<void> {
	const result = await execGit(['worktree', 'remove', path], cwd);

	if (!result.success) {
		const errorMsg = result.stderr.trim() || 'Unknown error';
		throw new GitError(
			`Failed to remove worktree at '${path}': ${errorMsg}`,
			`git worktree remove ${path}`
		);
	}
}

export async function isGitRepository(cwd?: string): Promise<boolean> {
	const result = await execGit(['rev-parse', '--git-dir'], cwd);
	return result.success;
}
