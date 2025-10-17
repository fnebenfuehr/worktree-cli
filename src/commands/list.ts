import * as worktree from '@/core/worktree';
import { intro, log, outro } from '@/utils/prompts';
import { displayWorktrees } from '@/utils/worktree';

export async function listCommand(): Promise<number> {
	intro('Active Worktrees');

	const worktrees = await worktree.list();

	if (worktrees.length === 0) {
		log.info('No worktrees found');
		return 0;
	}

	displayWorktrees(worktrees);

	outro(`${worktrees.length} worktree${worktrees.length === 1 ? '' : 's'} found`);

	return 0;
}
