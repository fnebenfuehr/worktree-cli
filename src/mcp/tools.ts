import * as worktree from '@/core/worktree';
import { FileSystemError, GitError, ValidationError } from '@/utils/errors';
import type { ToolResult } from './types';

export async function handleToolError<T>(fn: () => Promise<T>): Promise<ToolResult<T>> {
	try {
		const data = await fn();
		return { success: true, data };
	} catch (error) {
		if (error instanceof GitError) {
			return {
				success: false,
				error: error.message,
				type: 'git_error',
				recoverable: true,
				suggestion: 'Check git configuration and repository state',
			};
		}

		if (error instanceof ValidationError) {
			return {
				success: false,
				error: error.message,
				type: 'validation_error',
				recoverable: true,
				suggestion: 'Verify input parameters and try again',
			};
		}

		if (error instanceof FileSystemError) {
			return {
				success: false,
				error: error.message,
				type: 'filesystem_error',
				recoverable: true,
				suggestion: 'Check file permissions and paths',
			};
		}

		return {
			success: false,
			error: error instanceof Error ? error.message : String(error),
			type: 'unknown_error',
			recoverable: false,
		};
	}
}

export async function worktreeStatus(): Promise<ToolResult<worktree.StatusResult>> {
	return handleToolError(async () => {
		return await worktree.status();
	});
}

export async function worktreeList(): Promise<ToolResult<worktree.WorktreeInfo[]>> {
	return handleToolError(async () => {
		return await worktree.list();
	});
}

export async function worktreeCreate(
	branch: string,
	baseBranch?: string
): Promise<ToolResult<worktree.CreateResult>> {
	return handleToolError(async () => {
		return await worktree.create(branch, baseBranch);
	});
}

export async function worktreeSwitch(branch: string): Promise<ToolResult<worktree.SwitchResult>> {
	return handleToolError(async () => {
		return await worktree.switchTo(branch);
	});
}

export async function worktreeRemove(
	identifier: string,
	force = false
): Promise<ToolResult<worktree.RemoveResult>> {
	return handleToolError(async () => {
		return await worktree.remove(identifier, force);
	});
}

export async function worktreeSetup(targetDir?: string): Promise<ToolResult<worktree.SetupResult>> {
	return handleToolError(async () => {
		return await worktree.setup(targetDir);
	});
}
