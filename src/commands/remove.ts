import { loadAndValidateConfig } from '@/config/loader';
import * as worktree from '@/core/worktree';
import { executeHooks } from '@/hooks/executor';
import { ValidationError } from '@/utils/errors';
import { findGitRootOrThrow, getDefaultBranch, isBranchMerged } from '@/utils/git';
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

	const gitRoot = await findGitRootOrThrow();

	// Check if branch is merged (unless force is true)
	if (!options?.force) {
		const defaultBranch = await getDefaultBranch(gitRoot);
		const merged = await isBranchMerged(branch, defaultBranch, gitRoot);

		if (!merged) {
			if (isInteractive()) {
				// Interactive: warn and prompt for confirmation
				log.warn(`Branch '${branch}' is not merged to '${defaultBranch}'`);
				const proceedAnyway = await promptConfirm(
					'This branch has not been merged. Proceed with removal?',
					false
				);

				if (!proceedAnyway) {
					cancel('Removal cancelled');
					return 0;
				}
			} else {
				// Non-interactive: fail with error
				throw new ValidationError(
					`Branch '${branch}' is not merged to '${defaultBranch}'. Use --force to override.`
				);
			}
		}
	}

	const config = await loadAndValidateConfig(gitRoot);

	// Capture current directory before removal (worktree deletion may invalidate cwd)
	let currentDir: string | null = null;
	try {
		currentDir = process.cwd();
	} catch {
		// Already in invalid directory, ignore
	}

	const s = spinner();
	s.start('Removing worktree');

	const result = await worktree.remove(branch, options?.force || false);

	if (config) {
		await executeHooks(config, 'pre_remove', {
			cwd: result.path,
			skipHooks: options?.skipHooks,
			verbose: options?.verbose,
		});
	}

	s.stop('Worktree removed successfully');

	if (config) {
		await executeHooks(config, 'post_remove', {
			cwd: gitRoot,
			skipHooks: options?.skipHooks,
			verbose: options?.verbose,
		});
	}

	const remainingWorktrees = await worktree.list();
	const mainWorktree = remainingWorktrees[0];

	if (mainWorktree && currentDir) {
		const isInMainWorktree = currentDir === mainWorktree.path;

		outro(`Worktree for branch '${branch}' has been removed`);

		if (!isInMainWorktree) {
			note(`cd ${mainWorktree.path}`, `To switch to main worktree (${mainWorktree.branch}), run:`);
		}
	} else {
		outro(`Worktree for branch '${branch}' has been removed`);
	}

	return 0;
}
