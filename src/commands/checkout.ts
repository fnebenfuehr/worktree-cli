import { loadAndValidateConfig } from '@/config/loader';
import * as worktree from '@/core/worktree';
import { executeHooks } from '@/hooks/executor';
import { ValidationError } from '@/utils/errors';
import { copyConfigFiles } from '@/utils/file-operations';
import { getGitRoot } from '@/utils/git';
import {
	cancel,
	intro,
	isInteractive,
	log,
	note,
	outro,
	printWorktreeList,
	promptBranchName,
	spinner,
} from '@/utils/prompts';
import { isValidBranchName, VALIDATION_ERRORS } from '@/utils/validation';

export async function checkoutCommand(
	branch?: string,
	options?: { skipHooks?: boolean; verbose?: boolean }
): Promise<number> {
	const shouldPrompt = !branch && isInteractive();

	if (shouldPrompt && !branch) {
		intro('Checkout Worktree');
		branch = await promptBranchName('Enter branch name', 'feat/my-feature');
	} else if (!branch) {
		throw new ValidationError('Branch name required. Usage: worktree checkout <branch-name>');
	} else if (!isValidBranchName(branch)) {
		throw new ValidationError(
			`Invalid branch name: ${branch}\n${VALIDATION_ERRORS.BRANCH_NAME_INVALID}`
		);
	}

	const gitRoot = await getGitRoot();
	const s = spinner();
	s.start('Checking out worktree');

	const result = await worktree.checkout(branch);

	s.stop('Checkout completed successfully');

	// If we created a new worktree (not just switched), run hooks and copy files
	if (result.action === 'created') {
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
			});
		}
	}

	// Display appropriate message based on action
	if (result.action === 'switched') {
		outro(`Switched to existing worktree: ${result.branch}`);
	} else if (result.source === 'local') {
		outro(`Created worktree from local branch: ${result.branch}`);
	} else if (result.source === 'remote') {
		outro(`Created worktree from remote branch: ${result.branch}`);
	} else {
		outro(`Checked out worktree: ${result.branch}`);
	}

	note(`cd ${result.path}`, 'To switch to this worktree, run:');

	return 0;
}
