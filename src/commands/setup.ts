import * as worktree from '@/core/worktree';
import { getCurrentBranch } from '@/utils/git';
import { cancel, intro, isInteractive, outro, promptConfirm, spinner } from '@/utils/prompts';

export async function setupCommand(): Promise<number> {
	const currentBranch = await getCurrentBranch();

	if (isInteractive()) {
		intro('Setup Worktree Structure');

		const confirmed = await promptConfirm(
			`Convert repository to worktree structure? Current branch '${currentBranch}' will be moved to ./${currentBranch}/`,
			true
		);

		if (!confirmed) {
			cancel('Setup cancelled');
			return 0;
		}
	}

	const s = spinner();
	s.start('Converting repository structure');

	const result = await worktree.setup();

	s.stop('Repository converted successfully');
	outro(`cd ${result.worktreePath}\nworktree create feature/<branch-name>`);

	return 0;
}
