import { join } from 'node:path';
import { loadAndValidateConfig } from '@/lib/config';
import { getDefaultBranch, getProjectRoot } from '@/lib/git';
import { executeHooks } from '@/lib/hooks';
import * as worktree from '@/lib/worktree';
import { GitError, ValidationError } from '@/utils/errors';
import { getGitRoot } from '@/utils/git';
import {
	cancel,
	intro,
	isInteractive,
	log,
	note,
	outro,
	promptConfirm,
	promptSelectWorktree,
	spinner,
} from '@/utils/prompts';
import { tryCatch } from '@/utils/try-catch';

export async function removeCommand(
	branch?: string,
	options?: { skipHooks?: boolean; verbose?: boolean; force?: boolean }
): Promise<number> {
	const shouldPrompt = !branch && isInteractive();

	if (shouldPrompt && !branch) {
		intro('Remove Worktree');

		const worktrees = await worktree.list();

		if (worktrees.length === 0) {
			cancel('No worktrees found');
			return 1;
		}

		const removableWorktrees = worktrees.slice(1);

		if (removableWorktrees.length === 0) {
			cancel('No removable worktrees found (cannot remove main worktree)');
			return 1;
		}

		const worktreeOptions = removableWorktrees.map((wt) => ({
			value: wt.branch,
			label: wt.branch,
			hint: wt.path,
		}));

		branch = await promptSelectWorktree(worktreeOptions, 'Select worktree to remove');
	} else if (!branch) {
		throw new ValidationError('Branch name required. Usage: worktree remove <branch-name>');
	}

	if (isInteractive()) {
		const confirmed = await promptConfirm(`Remove worktree for branch '${branch}'?`, false);

		if (!confirmed) {
			cancel('Removal cancelled');
			return 0;
		}
	}

	const gitRoot = await getGitRoot();

	// Capture current directory and paths before removal (worktree deletion may invalidate cwd)
	const { data: currentDir } = tryCatch(() => process.cwd());
	const projectRoot = await getProjectRoot();
	const defaultBranch = await getDefaultBranch(gitRoot);
	const defaultBranchPath = join(projectRoot, defaultBranch);

	// Verify worktree exists before doing expensive checks
	const worktrees = await worktree.list();
	const targetWorktree = worktrees.find((wt) => wt.branch === branch);

	if (!targetWorktree) {
		throw new ValidationError(
			`No worktree found for branch '${branch}'. Run \`worktree list\` to see active worktrees.`
		);
	}

	const worktreePath = targetWorktree.path;

	const config = await loadAndValidateConfig(gitRoot);

	const env = {
		worktreePath,
		branch,
		mainPath: defaultBranchPath,
	};

	if (config) {
		await executeHooks(config, 'pre_remove', {
			cwd: worktreePath,
			skipHooks: options?.skipHooks,
			verbose: options?.verbose,
			env,
		});
	}

	const s = spinner();
	s.start('Removing worktree');

	const { error: removeError } = await tryCatch(() =>
		worktree.remove(branch, options?.force || false)
	);

	if (removeError) {
		s.stop();

		// In interactive mode, catch GitErrors and prompt user to override with force
		if (removeError instanceof GitError && isInteractive() && !options?.force) {
			log.warn(removeError.message);
			const proceedWithForce = await promptConfirm('Proceed with forced removal?', false);

			if (!proceedWithForce) {
				cancel('Removal cancelled');
			}

			s.start('Removing worktree (forced)');
			const { error: forceError } = await tryCatch(() => worktree.remove(branch, true));
			s.stop();

			if (forceError) {
				throw forceError;
			}
		} else {
			throw removeError;
		}
	} else {
		s.stop('Worktree removed successfully');
	}

	if (config) {
		await executeHooks(config, 'post_remove', {
			cwd: defaultBranchPath,
			skipHooks: options?.skipHooks,
			verbose: options?.verbose,
			env,
		});
	}

	// If we were in the removed worktree (or its subdirectory), show message to switch to main
	if (!currentDir || currentDir === worktreePath || currentDir.startsWith(worktreePath + '/')) {
		outro(`Worktree for branch '${branch}' has been removed`);
		note(`cd ${defaultBranchPath}`, 'To return to main worktree, run:');
	} else {
		outro(`Worktree for branch '${branch}' has been removed`);
	}

	return 0;
}
