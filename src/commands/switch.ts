import * as worktree from '@/core/worktree';
import { ValidationError } from '@/utils/errors';
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

	const s = spinner();
	s.start('Finding worktrees');
	const worktrees = await worktree.list();
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

	const result = await worktree.switchTo(branch);

	outro(`Switching to worktree: ${result.branch}`);
	note(`cd ${result.path}`, 'To switch to this worktree, run:');

	return 0;
}
