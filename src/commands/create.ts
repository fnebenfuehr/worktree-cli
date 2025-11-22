import * as p from '@clack/prompts';
import { copyConfigFiles, loadAndValidateConfig } from '@/lib/config';
import { getDefaultBranch, hasWorktreeStructure } from '@/lib/git';
import { executeHooks } from '@/lib/hooks';
import * as worktree from '@/lib/worktree';
import { ValidationError } from '@/utils/errors';
import { getGitRoot, gitGetCurrentBranch } from '@/utils/git';
import {
	cancel,
	intro,
	isInteractive,
	log,
	note,
	outro,
	promptBranchName,
	spinner,
} from '@/utils/prompts';
import { isValidBranchName, VALIDATION_ERRORS } from '@/utils/validation';

export async function createCommand(
	branch?: string,
	options?: { skipHooks?: boolean; verbose?: boolean; from?: string; trustHooks?: boolean }
): Promise<number> {
	const shouldPrompt = !branch && isInteractive();

	if (shouldPrompt && !branch) {
		intro('Create Worktree');
		branch = await promptBranchName('Enter branch name', 'feat/my-feature');
	} else if (!branch) {
		throw new ValidationError('Branch name required. Usage: worktree create <branch-name>');
	} else if (!isValidBranchName(branch)) {
		throw new ValidationError(
			`Invalid branch name: ${branch}\n${VALIDATION_ERRORS.BRANCH_NAME_INVALID}`
		);
	}

	const gitRoot = await getGitRoot();

	const enabled = await hasWorktreeStructure(gitRoot);
	if (!enabled) {
		throw new ValidationError('Repository not set up for worktrees. Run `worktree setup` first.');
	}

	const defaultBranch = await getDefaultBranch(gitRoot);
	const currentBranch = await gitGetCurrentBranch(gitRoot);

	// Determine base branch for creating new worktree
	let baseBranch = options?.from;

	// If no --from flag and user is not on default branch, prompt for base branch
	if (!baseBranch && currentBranch !== defaultBranch && isInteractive()) {
		const result = await p.select({
			message: 'Create new branch from:',
			options: [
				{ value: currentBranch, label: currentBranch, hint: 'Current branch' },
				{ value: defaultBranch, label: defaultBranch, hint: 'Default branch' },
			],
		});

		if (p.isCancel(result)) {
			cancel('Operation cancelled');
		}

		baseBranch = result as string;
	}

	const s = spinner();
	s.start('Creating worktree');

	const result = await worktree.create(branch, baseBranch);

	s.stop('Worktree created successfully');

	const config = await loadAndValidateConfig(gitRoot);

	if (config) {
		const copyResult = await copyConfigFiles({
			config,
			gitRoot,
			destDir: result.path,
			verbose: options?.verbose,
		});

		if (copyResult.failed > 0 || (copyResult.skipped > 0 && options?.verbose)) {
			log.step(
				`File copy: ${copyResult.success}/${copyResult.total} succeeded, ${copyResult.failed} failed, ${copyResult.skipped} skipped`
			);
		}

		await executeHooks(config, 'post_create', {
			cwd: result.path,
			skipHooks: options?.skipHooks,
			verbose: options?.verbose,
			trustHooks: options?.trustHooks,
			env: {
				worktreePath: result.path,
				branch: result.branch,
				mainPath: gitRoot,
			},
		});
	}

	const effectiveBaseBranch = baseBranch || defaultBranch;
	outro(`Created worktree for branch: ${result.branch} (from ${effectiveBaseBranch})`);
	note(`cd ${result.path}`, 'To switch to this worktree, run:');

	return 0;
}
