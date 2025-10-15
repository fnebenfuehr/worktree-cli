import { FileSystemError, ValidationError } from '@/utils/errors';
import { findGitRootOrThrow, getWorktreeList } from '@/utils/git';
import {
	cancel,
	intro,
	isInteractive,
	log,
	note,
	outro,
	promptSelectWorktree,
	spinner,
} from '@/utils/prompts';
import { displayWorktrees } from '@/utils/worktree';

export async function switchCommand(branch?: string): Promise<number> {
	const shouldPrompt = !branch && isInteractive();

	if (shouldPrompt && !branch) {
		intro('Switch Worktree');
	}

	const gitRoot = await findGitRootOrThrow();

	const s = spinner();
	s.start('Finding worktrees');
	const worktrees = await getWorktreeList(gitRoot);
	s.stop('Worktrees loaded');

	if (worktrees.length === 0) {
		cancel('No worktrees found');
		return 1;
	}

	if (shouldPrompt && !branch) {
		const worktreeOptions = worktrees.map((wt) => ({
			value: wt.branch,
			label: wt.branch,
			hint: wt.path,
		}));

		branch = await promptSelectWorktree(worktreeOptions, 'Select worktree to switch to');
	} else if (!branch) {
		intro('Available Worktrees');
		displayWorktrees(worktrees);
		log.message('');
		throw new ValidationError('Branch name required. Usage: worktree switch <branch-name>');
	}

	const targetWorktree = worktrees.find((wt) => wt.branch === branch);

	if (!targetWorktree) {
		throw new FileSystemError(
			`No worktree found for branch '${branch}'. Use "worktree list" to see active worktrees.`
		);
	}

	outro(`Switching to worktree: ${branch}`);
	note(`cd ${targetWorktree.path}`, 'To switch to this worktree, run:');

	return 0;
}
