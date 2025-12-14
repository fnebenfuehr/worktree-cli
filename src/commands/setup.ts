import * as worktree from '@/lib/worktree';
import { gitGetCurrentBranch } from '@/utils/git';
import { branchToDirName } from '@/utils/naming';
import { cancel, intro, isInteractive, log, outro, promptConfirm, spinner } from '@/utils/prompts';
import { tryCatch } from '@/utils/try-catch';

export async function setupCommand(): Promise<number> {
	const currentBranch = await gitGetCurrentBranch();
	const targetDirName = branchToDirName(currentBranch);

	if (isInteractive()) {
		intro('Setup Worktree Structure');

		const confirmed = await promptConfirm(
			`Convert repository to worktree structure? Current branch '${currentBranch}' will be moved to ./${targetDirName}/`,
			true
		);

		if (!confirmed) {
			cancel('Setup cancelled');
			return 0;
		}
	}

	const s = spinner();
	s.start('Converting repository structure');

	const { error, data: result } = await tryCatch(worktree.setup());

	if (error) {
		s.stop('Setup failed');
		log.error(error.message);
		return 1;
	}

	s.stop('Repository converted successfully');
	outro(`cd ${result.worktreePath}\nworktree create feature/<branch-name>`);

	return 0;
}
