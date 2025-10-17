/**
 * Worktree display and formatting utilities
 */

import { resolve, sep } from 'node:path';

import { log } from './prompts';

export interface Worktree {
	branch: string;
	path: string;
}

/**
 * Display worktrees in formatted list
 */
export function displayWorktrees(worktrees: Worktree[]): void {
	const currentDir = resolve(process.cwd());

	worktrees.forEach((wt, i) => {
		const resolvedWtPath = resolve(wt.path);
		const isCurrent = currentDir === resolvedWtPath || currentDir.startsWith(resolvedWtPath + sep);
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
