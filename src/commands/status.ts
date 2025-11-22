import { resolve, sep } from 'node:path';
import { getDefaultBranch, getWorktrees, hasWorktreeStructure } from '@/lib/git';
import type { ExtendedStatusResult, WorktreeStatusInfo } from '@/lib/types';
import { getGitRoot, gitGetTrackingStatus } from '@/utils/git';
import { intro, log, outro } from '@/utils/prompts';
import { tryCatch } from '@/utils/try-catch';

export async function extendedStatus(): Promise<ExtendedStatusResult> {
	const gitRoot = await getGitRoot();
	const worktrees = await getWorktrees(gitRoot);
	const defaultBranch = await getDefaultBranch(gitRoot);
	const enabled = await hasWorktreeStructure(gitRoot);

	const { data: currentDir } = tryCatch(() => resolve(process.cwd()));

	const worktreeStatusList: WorktreeStatusInfo[] = await Promise.all(
		worktrees.map(async (wt) => {
			const resolvedWtPath = resolve(wt.path);
			const isCurrent =
				currentDir != null &&
				(currentDir === resolvedWtPath || currentDir.startsWith(resolvedWtPath + sep));

			let tracking: WorktreeStatusInfo['tracking'];
			if (wt.branch !== 'detached') {
				const trackingResult = await gitGetTrackingStatus(wt.branch, wt.path);
				if (trackingResult) {
					tracking = trackingResult;
				}
			}

			return {
				...wt,
				isCurrent,
				tracking,
			};
		})
	);

	const currentWorktree = worktreeStatusList.find((wt) => wt.isCurrent);

	return {
		enabled,
		count: worktrees.length,
		defaultBranch,
		worktrees: worktreeStatusList,
		currentWorktree,
	};
}

export async function statusCommand(): Promise<number> {
	intro('Worktree Status');

	const status = await extendedStatus();

	// Show basic status info
	log.message(`Enabled:        ${status.enabled ? 'yes' : 'no'}`);
	log.message(`Worktree count: ${status.count}`);
	if (status.defaultBranch) {
		log.message(`Default branch: ${status.defaultBranch}`);
	}

	// Show current worktree info if in one
	if (status.currentWorktree) {
		log.message('');
		log.message(`Current worktree: ${status.currentWorktree.branch}`);
		log.message(`  Path: ${status.currentWorktree.path}`);
		if (status.currentWorktree.tracking) {
			const { ahead, behind, upstream } = status.currentWorktree.tracking;
			if (ahead === 0 && behind === 0) {
				log.message(`  Status: up to date with ${upstream}`);
			} else {
				const parts: string[] = [];
				if (ahead > 0) parts.push(`${ahead} ahead`);
				if (behind > 0) parts.push(`${behind} behind`);
				log.message(`  Status: ${parts.join(', ')} ${upstream}`);
			}
		}
	}

	// List all worktrees
	if (status.worktrees.length > 0) {
		log.message('');
		log.message('Worktrees:');

		for (const [i, wt] of status.worktrees.entries()) {
			const isMain = i === 0;
			const icon = isMain ? '⚡' : '📦';
			const currentLabel = wt.isCurrent ? ' (current)' : '';

			// Build tracking status string
			let trackingStr = '';
			if (wt.tracking) {
				const { ahead, behind } = wt.tracking;
				if (ahead === 0 && behind === 0) {
					trackingStr = ' [up to date]';
				} else {
					const parts: string[] = [];
					if (ahead > 0) parts.push(`↑${ahead}`);
					if (behind > 0) parts.push(`↓${behind}`);
					trackingStr = ` [${parts.join(' ')}]`;
				}
			}

			const paddedBranch = wt.branch.padEnd(30, ' ');
			log.message(`  ${icon} ${paddedBranch}${wt.path}${currentLabel}${trackingStr}`);
		}
	}

	outro(`${status.count} worktree${status.count === 1 ? '' : 's'}`);

	return 0;
}
