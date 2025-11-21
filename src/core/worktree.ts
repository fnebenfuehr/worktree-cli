import { dirname, join } from 'node:path';
import { $ } from 'bun';
import {
	FileSystemError,
	GitError,
	UncommittedChangesError,
	UnmergedBranchError,
	ValidationError,
} from '@/utils/errors';
import { createDir, exists, getAllItems, move } from '@/utils/fs';
import {
	branchExists,
	createBranch,
	type WorktreeInfo as GitWorktreeInfo,
	getCurrentBranch,
	getDefaultBranch,
	getGitRoot,
	addWorktree as gitAddWorktree,
	getWorktrees as gitGetWorktrees,
	removeWorktree as gitRemoveWorktree,
	hasUncommittedChanges,
	hasWorktreeStructure,
	isBranchMerged,
	isWorktree,
} from '@/utils/git';
import { branchToDirName } from '@/utils/naming';
import { log } from '@/utils/prompts';
import { tryCatch } from '@/utils/try-catch';
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
	const gitRoot = await getGitRoot();
	const worktrees = await gitGetWorktrees(gitRoot);
	const defaultBranch = await getDefaultBranch(gitRoot);
	const enabled = await hasWorktreeStructure(gitRoot);

	return {
		enabled,
		count: worktrees.length,
		defaultBranch,
	};
}

export async function list(): Promise<GitWorktreeInfo[]> {
	const gitRoot = await getGitRoot();
	return gitGetWorktrees(gitRoot);
}

export async function create(branch: string, baseBranch?: string): Promise<CreateResult> {
	if (!isValidBranchName(branch)) {
		throw new ValidationError(
			`Invalid branch name: ${branch}\n${VALIDATION_ERRORS.BRANCH_NAME_INVALID}`
		);
	}

	const gitRoot = await getGitRoot();
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
	const gitRoot = await getGitRoot();
	const worktrees = await gitGetWorktrees(gitRoot);

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
	const gitRoot = await getGitRoot();
	const dirName = branchToDirName(identifier);
	const projectRoot = dirname(gitRoot);
	const worktreeDir = join(projectRoot, dirName);

	if (!(await exists(worktreeDir))) {
		throw new FileSystemError(
			`No such worktree directory: ${worktreeDir}. Check branch name or use "worktree list" to see active worktrees.`
		);
	}

	if (!force) {
		// Check for uncommitted changes (includes both tracked changes and untracked files)
		if (await hasUncommittedChanges(worktreeDir, { includeUntracked: true })) {
			throw new UncommittedChangesError(identifier);
		}

		// Check if branch is merged
		const defaultBranch = await getDefaultBranch(gitRoot);
		const merged = await isBranchMerged(identifier, defaultBranch, gitRoot);

		if (!merged) {
			throw new UnmergedBranchError(identifier, defaultBranch);
		}
	}

	await gitRemoveWorktree(worktreeDir, gitRoot, { force });

	return {
		path: worktreeDir,
	};
}

async function rollbackSetup(tempDir: string, itemsToRollback: readonly string[]): Promise<void> {
	const rollbackErrors: Error[] = [];

	for (const item of itemsToRollback) {
		const { error } = await tryCatch(move(`${tempDir}/${item}`, item));
		if (error) {
			rollbackErrors.push(error);
		}
	}

	const { error: cleanupError } = await tryCatch($`rm -rf ${tempDir}`.quiet());
	if (cleanupError) {
		rollbackErrors.push(cleanupError);
	}

	if (rollbackErrors.length > 0) {
		const errorMessages = rollbackErrors.map((e) => e.message).join('; ');
		throw new FileSystemError(
			`Setup rollback completed with ${rollbackErrors.length} error(s): ${errorMessages}`
		);
	}
}

export async function setup(targetDir?: string): Promise<SetupResult> {
	if (await isWorktree()) {
		throw new ValidationError(
			'Already in a worktree directory. Worktree structure already set up - no setup needed.'
		);
	}

	// Verify we're at the repository root (not a subdirectory)
	// isWorktree() only checks if in a worktree vs main repo, not if at root
	if (!(await exists('.git'))) {
		throw new ValidationError(
			'Not in a git repository root (no .git folder found). Run this command from the root of your cloned repository.'
		);
	}

	const currentBranch = await getCurrentBranch();

	if (await hasUncommittedChanges()) {
		throw new UncommittedChangesError(currentBranch);
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

		const { error: moveError } = await tryCatch(move(tempDir, targetDirName));
		if (moveError) {
			if ((moveError as { code?: string }).code === 'EEXIST') {
				throw new FileSystemError(
					`Directory '${targetDirName}' already exists. Cannot proceed with setup.`
				);
			}
			throw moveError;
		}

		return {
			repositoryPath: process.cwd(),
			worktreePath: join(process.cwd(), targetDirName),
		};
	} catch (error) {
		const { error: rollbackError } = await tryCatch(rollbackSetup(tempDir, itemsToRollback));
		if (rollbackError) {
			// Rollback failed but preserve original error
			log.error(`Rollback also failed: ${rollbackError.message}`);
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
