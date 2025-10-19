import { resolve, sep } from 'node:path';
import * as p from '@clack/prompts';
import { UserCancelledError } from '@/utils/errors';
import { tryCatch } from '@/utils/try-catch';
import { isValidBranchName, isValidGitUrl, VALIDATION_ERRORS } from '@/utils/validation';

export interface WorktreeOption {
	value: string;
	label: string;
	hint?: string;
}

export interface Worktree {
	branch: string;
	path: string;
}

// Only needed for gating interactive prompts (text, select, confirm)
// Spinners and logs work in both TTY and non-TTY
export function isInteractive(): boolean {
	return process.stdout.isTTY ?? false;
}

export const log = p.log;

export async function promptBranchName(
	message: string = 'Enter branch name',
	placeholder: string = 'feature/my-feature'
): Promise<string> {
	const result = await p.text({
		message,
		placeholder,
		validate: (value) => {
			if (!value || value.trim().length === 0) {
				return 'Branch name is required';
			}
			if (!isValidBranchName(value)) {
				return `Invalid branch name. ${VALIDATION_ERRORS.BRANCH_NAME_INVALID}`;
			}
			return undefined;
		},
	});

	if (p.isCancel(result)) {
		cancel('Operation cancelled');
	}

	return result as string;
}

export async function promptGitUrl(
	message: string = 'Enter git repository URL',
	placeholder: string = 'git@github.com:user/repo.git'
): Promise<string> {
	const result = await p.text({
		message,
		placeholder,
		validate: (value) => {
			if (!value || value.trim().length === 0) {
				return 'Git URL is required';
			}
			if (!isValidGitUrl(value)) {
				return `Invalid git URL. ${VALIDATION_ERRORS.GIT_URL_INVALID}`;
			}
			return undefined;
		},
	});

	if (p.isCancel(result)) {
		cancel('Operation cancelled');
	}

	return result as string;
}

export async function promptSelectWorktree(
	worktrees: WorktreeOption[],
	message: string = 'Select a worktree'
): Promise<string> {
	if (worktrees.length === 0) {
		cancel('No worktrees available');
	}

	const result = await p.select({
		message,
		options: worktrees,
	});

	if (p.isCancel(result)) {
		cancel('Operation cancelled');
	}

	return result as string;
}

export async function promptConfirm(
	message: string,
	initialValue: boolean = false
): Promise<boolean> {
	const result = await p.confirm({
		message,
		initialValue,
	});

	if (p.isCancel(result)) {
		cancel('Operation cancelled');
	}

	return result as boolean;
}

export const spinner = p.spinner;
export const intro = p.intro;
export const outro = p.outro;
export const note = p.note;

export function cancel(message: string = 'Operation cancelled'): never {
	p.cancel(message);
	throw new UserCancelledError(message);
}

export function printWorktreeList(worktrees: Worktree[]): void {
	const { data: currentDir } = tryCatch(() => resolve(process.cwd()));

	worktrees.forEach((wt, i) => {
		const resolvedWtPath = resolve(wt.path);
		const isCurrent =
			currentDir && (currentDir === resolvedWtPath || currentDir.startsWith(resolvedWtPath + sep));
		const isMain = i === 0;

		let icon: string;
		if (isMain) {
			icon = '⚡';
		} else {
			icon = '📦';
		}

		const currentLabel = isCurrent ? ' (current)' : '';
		const paddedBranch = wt.branch.padEnd(30, ' ');

		log.message(`${icon} ${paddedBranch}${wt.path}${currentLabel}`);
	});
}
