import { dirname, join } from 'node:path';
import { $ } from 'bun';
import { getDefaultBranch, getWorktrees, hasWorktreeStructure } from '@/lib/git';
import type {
	CheckoutResult,
	CreateResult,
	PrCheckoutResult,
	RemoveResult,
	SetupResult,
	StatusResult,
	SwitchResult,
	WorktreeInfo,
} from '@/lib/types';
import {
	FileSystemError,
	GhCliError,
	GitError,
	UncommittedChangesError,
	UnmergedBranchError,
	ValidationError,
} from '@/utils/errors';
import { createDir, exists, getAllItems, move } from '@/utils/fs';
import {
	getGitRoot,
	gitAddWorktree,
	gitBranchExists,
	gitCreateBranch,
	gitFetchRemoteBranch,
	gitGetCurrentBranch,
	gitHasUncommittedChanges,
	gitIsBranchMerged,
	gitIsWorktree,
	gitRemoteBranchExists,
	gitRemoveWorktree,
	gitSetUpstreamTracking,
} from '@/utils/git';
import { branchToDirName } from '@/utils/naming';
import { log } from '@/utils/prompts';
import { tryCatch } from '@/utils/try-catch';
import { isSafePath, isValidBranchName, VALIDATION_ERRORS } from '@/utils/validation';

export async function status(): Promise<StatusResult> {
	const gitRoot = await getGitRoot();
	const worktrees = await getWorktrees(gitRoot);
	const defaultBranch = await getDefaultBranch(gitRoot);
	const enabled = await hasWorktreeStructure(gitRoot);

	return {
		enabled,
		count: worktrees.length,
		defaultBranch,
	};
}

export async function list(): Promise<WorktreeInfo[]> {
	const gitRoot = await getGitRoot();
	return getWorktrees(gitRoot);
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
			`Worktree directory already exists: ${worktreeDir}. Run \`worktree switch ${branch}\` or remove the existing worktree.`
		);
	}

	const base = baseBranch || (await getDefaultBranch(gitRoot));
	const branchAlreadyExists = await gitBranchExists(branch, gitRoot);

	if (!branchAlreadyExists) {
		await gitCreateBranch(branch, base, gitRoot);
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
	const worktrees = await getWorktrees(gitRoot);

	if (worktrees.length === 0) {
		throw new FileSystemError(
			'No worktrees found. Run `worktree setup` to initialize worktree structure.'
		);
	}

	const targetWorktree = worktrees.find((wt) => wt.branch === branch);

	if (!targetWorktree) {
		throw new FileSystemError(
			`No worktree found for branch '${branch}'. Run \`worktree list\` to see active worktrees.`
		);
	}

	return {
		path: targetWorktree.path,
		branch: targetWorktree.branch,
	};
}

export async function checkout(branch: string): Promise<CheckoutResult> {
	if (!isValidBranchName(branch)) {
		throw new ValidationError(
			`Invalid branch name: ${branch}\n${VALIDATION_ERRORS.BRANCH_NAME_INVALID}`
		);
	}

	const gitRoot = await getGitRoot();
	const worktrees = await getWorktrees(gitRoot);

	// Existing worktree → switch
	const existingWorktree = worktrees.find((wt) => wt.branch === branch);
	if (existingWorktree) {
		return {
			path: existingWorktree.path,
			branch: existingWorktree.branch,
			action: 'switched',
		};
	}

	// Local branch → create worktree
	const localExists = await gitBranchExists(branch, gitRoot);
	if (localExists) {
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

		await gitAddWorktree(worktreeDir, branch, gitRoot);

		return {
			path: worktreeDir,
			branch,
			action: 'created',
			created: false,
			source: 'local',
		};
	}

	// Remote branch → fetch and create worktree
	// TODO: Support non-origin remotes
	const remoteExists = await gitRemoteBranchExists(branch, gitRoot);
	if (remoteExists) {
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

		await gitFetchRemoteBranch(branch, gitRoot);
		await gitCreateBranch(branch, `origin/${branch}`, gitRoot);
		await gitAddWorktree(worktreeDir, branch, gitRoot);
		await gitSetUpstreamTracking(branch, `origin/${branch}`, gitRoot);

		return {
			path: worktreeDir,
			branch,
			action: 'created',
			created: false,
			source: 'remote',
		};
	}

	// Not found → error with suggestions
	const availableBranches = worktrees.map((wt) => wt.branch).filter((b) => b !== 'detached');

	let errorMessage = `Branch '${branch}' not found locally or on remote.\n\n`;
	errorMessage += `Available worktrees:\n`;
	if (availableBranches.length > 0) {
		for (const b of availableBranches) {
			errorMessage += `  - ${b}\n`;
		}
	} else {
		errorMessage += `  (none)\n`;
	}
	errorMessage += `\nTo create a new branch, use: worktree create ${branch}`;

	throw new ValidationError(errorMessage);
}

/**
 * Parse PR number from input (number or GitHub URL)
 */
function parsePrInput(input: string): number {
	const num = Number.parseInt(input, 10);
	if (!Number.isNaN(num) && num > 0) {
		return num;
	}

	const match = input.match(/github\.com\/[^/]+\/[^/]+\/pull\/(\d+)/);
	if (match?.[1]) {
		return Number.parseInt(match[1], 10);
	}

	throw new ValidationError(`Invalid PR identifier: ${input}. Provide a PR number or GitHub URL.`);
}

interface GhPrInfo {
	headRefName: string;
	title: string;
	url: string;
	headRepositoryOwner: { login: string };
	baseRepository: { owner: { login: string } };
}

export async function checkoutPr(prInput: string): Promise<PrCheckoutResult> {
	const prNumber = parsePrInput(prInput);

	const { error: whichError } = await tryCatch(async () => {
		await $`which gh`.quiet();
	});

	if (whichError) {
		throw new GhCliError('GitHub CLI (gh) not found. Install from https://cli.github.com');
	}

	const { data: prData, error: prError } = await tryCatch(async () => {
		const result =
			await $`gh pr view ${prNumber} --json headRefName,title,url,headRepositoryOwner,baseRepository`.quiet();
		return JSON.parse(result.stdout.toString()) as GhPrInfo;
	});

	if (prError) {
		const errorMsg = prError instanceof Error ? prError.message : String(prError);

		if (errorMsg.includes('not logged in') || errorMsg.includes('authentication')) {
			throw new GhCliError('GitHub CLI not authenticated. Run: gh auth login');
		}

		if (errorMsg.includes('Could not resolve') || errorMsg.includes('not found')) {
			throw new ValidationError(`PR #${prNumber} not found. Check the PR number and repository.`);
		}

		throw new GhCliError(`Failed to get PR info: ${errorMsg}`);
	}

	const headOwner = prData.headRepositoryOwner.login;
	const baseOwner = prData.baseRepository.owner.login;

	if (headOwner !== baseOwner) {
		throw new ValidationError(
			`PR #${prNumber} is from fork '${headOwner}/${prData.headRefName}'.\n` +
				`Add the fork as a remote and retry:\n` +
				`  git remote add ${headOwner} https://github.com/${headOwner}/<repo>.git\n` +
				`  git fetch ${headOwner}\n` +
				`  worktree checkout ${headOwner}/${prData.headRefName}`
		);
	}

	const checkoutResult = await checkout(prData.headRefName);

	return {
		...checkoutResult,
		prNumber,
		prTitle: prData.title,
		prUrl: prData.url,
	};
}

export async function remove(identifier: string, force = false): Promise<RemoveResult> {
	const gitRoot = await getGitRoot();
	const dirName = branchToDirName(identifier);
	const projectRoot = dirname(gitRoot);
	const worktreeDir = join(projectRoot, dirName);

	if (!(await exists(worktreeDir))) {
		throw new FileSystemError(
			`No such worktree directory: ${worktreeDir}. Run \`worktree list\` to see active worktrees.`
		);
	}

	if (!force) {
		// Check for uncommitted changes (includes both tracked changes and untracked files)
		if (await gitHasUncommittedChanges(worktreeDir, { includeUntracked: true })) {
			throw new UncommittedChangesError(identifier);
		}

		// Check if branch is merged
		const defaultBranch = await getDefaultBranch(gitRoot);
		const merged = await gitIsBranchMerged(identifier, defaultBranch, gitRoot);

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
	if (await gitIsWorktree()) {
		throw new ValidationError(
			'Already in a worktree directory. Worktree structure already set up - no setup needed.'
		);
	}

	// Verify we're at the repository root (not a subdirectory)
	// gitIsWorktree() only checks if in a worktree vs main repo, not if at root
	if (!(await exists('.git'))) {
		throw new ValidationError(
			'Not in a git repository root (no .git folder found). Run this command from the root of your cloned repository.'
		);
	}

	const currentBranch = await gitGetCurrentBranch();

	if (await gitHasUncommittedChanges()) {
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
