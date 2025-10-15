import { dirname, join } from 'node:path';
import { loadAndValidateConfig } from '@/config/loader';
import { executeHooks } from '@/hooks/executor';
import { FileSystemError, ValidationError } from '@/utils/errors';
import { copyConfigFiles } from '@/utils/file-operations';
import { branchToDirName, exists } from '@/utils/fs';
import {
	addWorktree,
	branchExists,
	createBranch,
	findGitRootOrThrow,
	getDefaultBranch,
} from '@/utils/git';
import { intro, isInteractive, log, note, outro, promptBranchName, spinner } from '@/utils/prompts';
import { isSafePath, isValidBranchName, VALIDATION_ERRORS } from '@/utils/validation';

export async function createCommand(
	branch?: string,
	options?: { skipHooks?: boolean; verbose?: boolean }
): Promise<number> {
	const shouldPrompt = !branch && isInteractive();

	if (shouldPrompt && !branch) {
		intro('Create Worktree');
		branch = await promptBranchName('Enter branch name', 'feature/my-feature');
	} else if (!branch) {
		throw new ValidationError('Branch name required. Usage: worktree create <branch-name>');
	} else if (!isValidBranchName(branch)) {
		throw new ValidationError(
			`Invalid branch name: ${branch}\n${VALIDATION_ERRORS.BRANCH_NAME_INVALID}`
		);
	}

	const gitRoot = await findGitRootOrThrow();

	const dirName = branchToDirName(branch);
	const projectRoot = dirname(gitRoot);
	const worktreeDir = join(projectRoot, dirName);

	// Validate path safety to prevent directory traversal
	if (!isSafePath(worktreeDir)) {
		throw new ValidationError('Invalid path detected - potential directory traversal');
	}

	if (await exists(worktreeDir)) {
		throw new FileSystemError(
			`Worktree directory already exists: ${worktreeDir}. Choose a different branch name or remove the existing worktree.`
		);
	}

	const s = spinner();
	s.start('Detecting default branch');

	const defaultBranch = await getDefaultBranch(gitRoot);

	const branchAlreadyExists = await branchExists(branch, gitRoot);

	if (!branchAlreadyExists) {
		s.message(`Creating branch '${branch}' from origin/${defaultBranch}`);
		await createBranch(branch, defaultBranch, gitRoot);
	}

	s.message('Creating worktree');
	await addWorktree(worktreeDir, branch, gitRoot);
	s.stop('Worktree created successfully');

	const config = await loadAndValidateConfig(gitRoot);

	if (config) {
		const copyResult = await copyConfigFiles({
			config,
			gitRoot,
			destDir: worktreeDir,
			verbose: options?.verbose,
		});

		if (copyResult.failed > 0 || (copyResult.skipped > 0 && options?.verbose)) {
			log.step(
				`File copy: ${copyResult.success}/${copyResult.total} succeeded, ${copyResult.failed} failed, ${copyResult.skipped} skipped`
			);
		}

		await executeHooks(config, 'post_create', {
			cwd: worktreeDir,
			skipHooks: options?.skipHooks,
			verbose: options?.verbose,
		});
	}

	outro(`Created worktree for branch: ${branch}`);
	note(`cd ${worktreeDir}`, 'To switch to this worktree, run:');

	return 0;
}
