import { loadAndValidateConfig } from '@/config/loader';
import * as worktree from '@/core/worktree';
import { executeHooks } from '@/hooks/executor';
import { ValidationError } from '@/utils/errors';
import { copyConfigFiles } from '@/utils/file-operations';
import { findGitRootOrThrow } from '@/utils/git';
import { intro, isInteractive, log, note, outro, promptBranchName, spinner } from '@/utils/prompts';
import { isValidBranchName, VALIDATION_ERRORS } from '@/utils/validation';

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

	const s = spinner();
	s.start('Creating worktree');

	const result = await worktree.create(branch);

	s.stop('Worktree created successfully');

	const gitRoot = await findGitRootOrThrow();
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

	outro(`Created worktree for branch: ${result.branch}`);
	note(`cd ${result.path}`, 'To switch to this worktree, run:');

	return 0;
}
