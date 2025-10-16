import { dirname, join } from 'node:path';
import { $ } from 'bun';
import { FileSystemError, GitError, ValidationError } from '@/utils/errors';
import { branchToDirName, createDir, exists, getAllItems, move } from '@/utils/fs';
import {
	branchExists,
	createBranch,
	execGit,
	findGitRootOrThrow,
	type WorktreeInfo as GitWorktreeInfo,
	getCurrentBranch,
	getDefaultBranch,
	getGitRoot,
	addWorktree as gitAddWorktree,
	getWorktreeList as gitGetWorktreeList,
	removeWorktree as gitRemoveWorktree,
} from '@/utils/git';
import { isSafePath, isValidBranchName, VALIDATION_ERRORS } from '@/utils/validation';

export type WorktreeInfo = GitWorktreeInfo;

export interface StatusResult {
	enabled: boolean;
	count: number;
	defaultBranch?: string;
}

export interface CreateResult {
	path: string;
	branch: string;
	created: boolean;
}

export interface SwitchResult {
	path: string;
	branch: string;
}

export interface RemoveResult {
	path: string;
}

export interface SetupResult {
	repositoryPath: string;
	worktreePath: string;
}

export async function status(): Promise<StatusResult> {
	const gitRoot = await findGitRootOrThrow();
	const gitDirResult = await execGit(['rev-parse', '--git-dir'], gitRoot);

	if (!gitDirResult.success) {
		return { enabled: false, count: 0 };
	}

	const gitDir = gitDirResult.stdout;
	const worktreesPath = join(gitRoot, gitDir, 'worktrees');
	const hasWorktrees = await exists(worktreesPath);
	const isBare = gitDir.endsWith('.git') || gitDir.includes('.bare');

	const worktrees = await gitGetWorktreeList(gitRoot);
	const defaultBranch = worktrees.length > 0 ? worktrees[0]?.branch : undefined;

	return {
		enabled: hasWorktrees || isBare,
		count: worktrees.length,
		defaultBranch,
	};
}

export async function list(): Promise<GitWorktreeInfo[]> {
	const gitRoot = await findGitRootOrThrow();
	return gitGetWorktreeList(gitRoot);
}

export async function create(branch: string, baseBranch?: string): Promise<CreateResult> {
	if (!isValidBranchName(branch)) {
		throw new ValidationError(
			`Invalid branch name: ${branch}\n${VALIDATION_ERRORS.BRANCH_NAME_INVALID}`
		);
	}

	const gitRoot = await findGitRootOrThrow();
	const dirName = branchToDirName(branch);
	const projectRoot = dirname(gitRoot);
	const worktreeDir = join(projectRoot, dirName);

	if (!isSafePath(worktreeDir)) {
		throw new ValidationError('Invalid path detected - potential directory traversal');
	}

	if (await exists(worktreeDir)) {
		throw new FileSystemError(
			`Worktree directory already exists: ${worktreeDir}. Choose a different branch name or remove the existing worktree.`
		);
	}

	const base = baseBranch || (await getDefaultBranch(gitRoot));
	const branchAlreadyExists = await branchExists(branch, gitRoot);

	if (!branchAlreadyExists) {
		await createBranch(branch, base, gitRoot);
	}

	await gitAddWorktree(worktreeDir, branch, gitRoot);

	return {
		path: worktreeDir,
		branch,
		created: !branchAlreadyExists,
	};
}

export async function switchTo(branch: string): Promise<SwitchResult> {
	const gitRoot = await findGitRootOrThrow();
	const worktrees = await gitGetWorktreeList(gitRoot);

	if (worktrees.length === 0) {
		throw new FileSystemError('No worktrees found');
	}

	const targetWorktree = worktrees.find((wt) => wt.branch === branch);

	if (!targetWorktree) {
		throw new FileSystemError(
			`No worktree found for branch '${branch}'. Use "worktree list" to see active worktrees.`
		);
	}

	return {
		path: targetWorktree.path,
		branch: targetWorktree.branch,
	};
}

export async function remove(identifier: string, force = false): Promise<RemoveResult> {
	const gitRoot = await findGitRootOrThrow();
	const dirName = branchToDirName(identifier);
	const projectRoot = dirname(gitRoot);
	const worktreeDir = join(projectRoot, dirName);

	if (!(await exists(worktreeDir))) {
		throw new FileSystemError(
			`No such worktree directory: ${worktreeDir}. Check branch name or use "worktree list" to see active worktrees.`
		);
	}

	if (force) {
		await gitRemoveWorktree(`${worktreeDir} --force`, gitRoot);
	} else {
		await gitRemoveWorktree(worktreeDir, gitRoot);
	}

	return {
		path: worktreeDir,
	};
}

export async function setup(targetDir?: string): Promise<SetupResult> {
	if (!(await exists('.git'))) {
		throw new ValidationError(
			'Not in a git repository root (no .git folder found). Run this command from the root of your cloned repository.'
		);
	}

	const currentBranch = await getCurrentBranch();

	if (!currentBranch) {
		throw new GitError('Could not determine current branch', 'git branch --show-current');
	}

	const statusResult = await execGit(['status', '--porcelain', '--untracked-files=no']);
	if (statusResult.stdout.trim()) {
		throw new GitError(
			'Uncommitted changes detected. Commit or stash changes before setup.',
			'git status --porcelain --untracked-files=no'
		);
	}

	const gitRoot = await getGitRoot('..');
	if (gitRoot) {
		throw new ValidationError('Already appears to be in a worktree structure. No setup needed.');
	}

	const tempDir = `.tmp-worktree-setup-${process.pid}`;
	const targetDirName = targetDir || currentBranch;

	const itemsToRollback: string[] = [];
	let interrupted = false;

	const signalHandler = () => {
		interrupted = true;
	};

	process.on('SIGINT', signalHandler);
	process.on('SIGTERM', signalHandler);

	try {
		await createDir(tempDir);

		const items = await getAllItems('.');

		for (const item of items) {
			if (interrupted) {
				throw new Error('Operation interrupted by user');
			}
			if (item !== tempDir && item !== '.' && item !== '..') {
				await move(item, `${tempDir}/${item}`);
				itemsToRollback.push(item);
			}
		}

		try {
			await move(tempDir, targetDirName);
		} catch (error) {
			if ((error as { code?: string }).code === 'EEXIST') {
				throw new FileSystemError(
					`Directory '${targetDirName}' already exists. Cannot proceed with setup.`
				);
			}
			throw error;
		}

		return {
			repositoryPath: process.cwd(),
			worktreePath: join(process.cwd(), targetDirName),
		};
	} catch (error) {
		for (const item of itemsToRollback) {
			try {
				await move(`${tempDir}/${item}`, item);
			} catch {
				// Continue rollback
			}
		}

		try {
			await $`rm -rf ${tempDir}`.quiet();
		} catch {
			// Ignore cleanup errors
		}

		if (
			error instanceof ValidationError ||
			error instanceof FileSystemError ||
			error instanceof GitError
		) {
			throw error;
		}
		throw new FileSystemError(
			`Setup failed: ${error instanceof Error ? error.message : String(error)}`
		);
	} finally {
		process.off('SIGINT', signalHandler);
		process.off('SIGTERM', signalHandler);
	}
}
