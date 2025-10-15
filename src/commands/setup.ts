import { $ } from 'bun';
import { FileSystemError, GitError, ValidationError } from '@/utils/errors';
import { createDir, exists, getAllItems, move } from '@/utils/fs';
import { execGit, getCurrentBranch, getGitRoot } from '@/utils/git';
import { cancel, intro, isInteractive, log, outro, promptConfirm, spinner } from '@/utils/prompts';

export async function setupCommand(): Promise<number> {
	if (!(await exists('.git'))) {
		throw new ValidationError(
			'Not in a git repository root (no .git folder found). Run this command from the root of your cloned repository.'
		);
	}

	const currentBranch = await getCurrentBranch();

	if (!currentBranch) {
		throw new GitError('Could not determine current branch', 'git branch --show-current');
	}

	const statusResult = await execGit(['status', '--porcelain', '--untracked-files=no']);
	if (statusResult.stdout.trim()) {
		throw new GitError(
			'Uncommitted changes detected. Commit or stash changes before setup.',
			'git status --porcelain --untracked-files=no'
		);
	}

	const gitRoot = await getGitRoot('..');
	if (gitRoot) {
		throw new ValidationError('Already appears to be in a worktree structure. No setup needed.');
	}

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

	const tempDir = `.tmp-worktree-setup-${process.pid}`;
	const targetDir = currentBranch;

	const itemsToRollback: string[] = [];
	let interrupted = false;

	const signalHandler = () => {
		interrupted = true;
	};

	process.on('SIGINT', signalHandler);
	process.on('SIGTERM', signalHandler);

	try {
		const s = spinner();
		s.start('Moving repository contents');

		await createDir(tempDir);

		const items = await getAllItems('.');

		for (const item of items) {
			if (interrupted) {
				throw new Error('Operation interrupted by user');
			}
			if (item !== tempDir && item !== '.' && item !== '..') {
				await move(item, `${tempDir}/${item}`);
				itemsToRollback.push(item);
			}
		}

		try {
			await move(tempDir, targetDir);
		} catch (error) {
			if ((error as { code?: string }).code === 'EEXIST') {
				throw new FileSystemError(
					`Directory '${targetDir}' already exists. Cannot proceed with setup.`
				);
			}
			throw error;
		}

		s.stop('Repository converted successfully');
		outro(`cd ${targetDir}\nworktree create feature/<branch-name>`);

		return 0;
	} catch (error) {
		const s = spinner();
		s.start('Rolling back changes');

		for (const item of itemsToRollback) {
			try {
				await move(`${tempDir}/${item}`, item);
			} catch (error) {
				log.warn(
					`Failed to restore ${item}: ${error instanceof Error ? error.message : String(error)}`
				);
			}
		}

		try {
			await $`rm -rf ${tempDir}`.quiet();
		} catch {
			// Ignore cleanup errors
		}

		s.stop('Rollback completed');

		if (
			error instanceof ValidationError ||
			error instanceof FileSystemError ||
			error instanceof GitError
		) {
			throw error;
		}
		throw new FileSystemError(
			`Setup failed: ${error instanceof Error ? error.message : String(error)}`
		);
	} finally {
		process.off('SIGINT', signalHandler);
		process.off('SIGTERM', signalHandler);
	}
}
