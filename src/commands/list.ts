import { findGitRootOrThrow, getWorktreeList } from '@/utils/git';
import { intro, log, outro } from '@/utils/prompts';
import { displayWorktrees } from '@/utils/worktree';

export async function listCommand(): Promise<number> {
	intro('Active Worktrees');

	const gitRoot = await findGitRootOrThrow();
	const worktrees = await getWorktreeList(gitRoot);

	if (worktrees.length === 0) {
		log.info('No worktrees found');
		return 0;
	}

	displayWorktrees(worktrees);

	outro(`${worktrees.length} worktree${worktrees.length === 1 ? '' : 's'} found`);

	return 0;
}
