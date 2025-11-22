import { copyConfigFiles, loadAndValidateConfig } from '@/lib/config';
import { executeHooks } from '@/lib/hooks';
import * as worktree from '@/lib/worktree';
import { ValidationError } from '@/utils/errors';
import { getGitRoot } from '@/utils/git';
import { intro, isInteractive, log, note, outro, promptBranchName, spinner } from '@/utils/prompts';
import { tryCatch } from '@/utils/try-catch';
import { isValidBranchName, VALIDATION_ERRORS } from '@/utils/validation';

export async function checkoutCommand(
	branch?: string,
	options?: { skipHooks?: boolean; verbose?: boolean; trustHooks?: boolean }
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

	const { data: result, error } = await tryCatch(worktree.checkout(branch));

	if (error) {
		s.stop('Checkout failed');
		throw error;
	}

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
				trustHooks: options?.trustHooks,
				env: {
					worktreePath: result.path,
					branch: result.branch,
					mainPath: gitRoot,
				},
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
