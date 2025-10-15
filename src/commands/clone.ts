import { mkdir } from 'node:fs/promises';
import { $ } from 'bun';
import { FileSystemError, GitError, ValidationError, WorktreeError } from '@/utils/errors';
import { extractRepoName, move } from '@/utils/fs';
import { getCurrentBranch } from '@/utils/git';
import { intro, isInteractive, outro, promptGitUrl, spinner } from '@/utils/prompts';
import { isValidGitUrl, VALIDATION_ERRORS } from '@/utils/validation';

export async function cloneCommand(gitUrl?: string): Promise<number> {
	const shouldPrompt = !gitUrl && isInteractive();

	if (shouldPrompt && !gitUrl) {
		intro('Clone Repository');
		gitUrl = await promptGitUrl('Enter git repository URL', 'git@github.com:user/repo.git');
	} else if (!gitUrl) {
		throw new ValidationError('Git URL required. Usage: worktree clone <git-url>');
	} else if (!isValidGitUrl(gitUrl)) {
		throw new ValidationError(`Invalid git URL: ${gitUrl}\n${VALIDATION_ERRORS.GIT_URL_INVALID}`);
	}

	const repoName = extractRepoName(gitUrl);
	if (!repoName) {
		throw new ValidationError(
			'Could not extract repository name from URL. Ensure URL format is correct (e.g., https://github.com/user/repo.git)'
		);
	}

	try {
		await mkdir(repoName);
	} catch (error) {
		if ((error as { code?: string }).code === 'EEXIST') {
			throw new FileSystemError(
				`Directory '${repoName}' already exists. Use a different location or remove the existing directory.`
			);
		}
		throw error;
	}

	const s = spinner();
	s.start('Cloning repository');

	const tempClone = `${repoName}/.tmp-clone-${process.pid}`;

	try {
		const cloneProc = await $`git clone ${[gitUrl, tempClone]}`.quiet();

		if (cloneProc.exitCode !== 0) {
			s.stop('Clone failed');
			throw new GitError(
				'Failed to clone repository. Check that the URL is correct and you have access.',
				`git clone ${gitUrl}`
			);
		}

		s.message('Setting up worktree structure');
		const defaultBranch = await getCurrentBranch(tempClone);

		if (!defaultBranch) {
			s.stop('Setup failed');
			throw new GitError(
				'Could not detect default branch. Repository may be empty or corrupted.',
				'git branch --show-current'
			);
		}

		const targetDir = `${repoName}/${defaultBranch}`;
		await move(tempClone, targetDir);

		s.stop('Repository cloned successfully');
		outro(`cd ${targetDir}\nworktree create <branch-name>`);

		return 0;
	} catch (error) {
		s.stop('Clone failed');

		try {
			await $`rm -rf ${[repoName]}`.quiet();
		} catch {
			// Ignore cleanup errors
		}

		if (error instanceof WorktreeError) {
			throw error;
		}
		throw new GitError(
			`Clone failed: ${error instanceof Error ? error.message : String(error)}`,
			`git clone ${gitUrl}`
		);
	}
}
