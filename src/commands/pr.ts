import { copyConfigFiles, loadAndValidateConfig } from '@/lib/config';
import { executeHooks } from '@/lib/hooks';
import * as worktree from '@/lib/worktree';
import { ValidationError } from '@/utils/errors';
import { getGitRoot } from '@/utils/git';
import { intro, isInteractive, log, note, outro, promptBranchName, spinner } from '@/utils/prompts';
import { tryCatch } from '@/utils/try-catch';

export async function prCommand(
	prInput?: string,
	options?: { skipHooks?: boolean; verbose?: boolean }
): Promise<number> {
	const shouldPrompt = !prInput && isInteractive();

	if (shouldPrompt && !prInput) {
		intro('Checkout PR');
		prInput = await promptBranchName('Enter PR number or URL', '123');
	} else if (!prInput) {
		throw new ValidationError('PR number or URL required. Usage: worktree pr <number|url>');
	}

	const gitRoot = await getGitRoot();
	const s = spinner();
	s.start('Checking out PR');

	const { data: result, error } = await tryCatch(worktree.checkoutPr(prInput));

	if (error) {
		s.stop('Checkout failed');
		throw error;
	}

	s.stop('Checkout completed successfully');

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

	if (result.action === 'switched') {
		outro(`Switched to existing worktree: ${result.branch}`);
	} else if (result.source === 'local') {
		outro(`Created worktree from local branch: ${result.branch}`);
	} else if (result.source === 'remote') {
		outro(`Created worktree from remote branch: ${result.branch}`);
	} else {
		outro(`Checked out worktree: ${result.branch}`);
	}

	log.message(`PR #${result.prNumber}: ${result.prTitle}`);
	log.message(result.prUrl);
	note(`cd ${result.path}`, 'To switch to this worktree, run:');

	return 0;
}
