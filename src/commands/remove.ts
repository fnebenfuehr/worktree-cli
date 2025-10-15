import { dirname, join } from 'node:path';
import { loadAndValidateConfig } from '@/config/loader';
import { executeHooks } from '@/hooks/executor';
import { FileSystemError, ValidationError } from '@/utils/errors';
import { branchToDirName, exists } from '@/utils/fs';
import { findGitRootOrThrow, getWorktreeList, removeWorktree } from '@/utils/git';
import {
	cancel,
	intro,
	isInteractive,
	note,
	outro,
	promptConfirm,
	promptSelectWorktree,
	spinner,
} from '@/utils/prompts';

export async function removeCommand(
	branch?: string,
	options?: { skipHooks?: boolean; verbose?: boolean }
): Promise<number> {
	const shouldPrompt = !branch && isInteractive();

	if (shouldPrompt && !branch) {
		intro('Remove Worktree');

		const gitRoot = await findGitRootOrThrow();

		const worktrees = await getWorktreeList(gitRoot);

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

	const gitRoot = await findGitRootOrThrow();

	const dirName = branchToDirName(branch);
	const projectRoot = dirname(gitRoot);
	const worktreeDir = join(projectRoot, dirName);

	if (!(await exists(worktreeDir))) {
		throw new FileSystemError(
			`No such worktree directory: ${worktreeDir}. Check branch name or use "worktree list" to see active worktrees.`
		);
	}

	if (isInteractive()) {
		const confirmed = await promptConfirm(
			`Remove worktree for branch '${branch}' at ${worktreeDir}?`,
			false
		);

		if (!confirmed) {
			cancel('Removal cancelled');
			return 0;
		}
	}

	const config = await loadAndValidateConfig(gitRoot);

	if (config) {
		await executeHooks(config, 'pre_remove', {
			cwd: worktreeDir,
			skipHooks: options?.skipHooks,
			verbose: options?.verbose,
		});
	}

	const s = spinner();
	s.start('Removing worktree');
	await removeWorktree(worktreeDir, gitRoot);
	s.stop('Worktree removed successfully');

	if (config) {
		await executeHooks(config, 'post_remove', {
			cwd: gitRoot,
			skipHooks: options?.skipHooks,
			verbose: options?.verbose,
		});
	}

	const remainingWorktrees = await getWorktreeList(gitRoot);
	const mainWorktree = remainingWorktrees[0];

	if (mainWorktree) {
		const currentDir = process.cwd();
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
