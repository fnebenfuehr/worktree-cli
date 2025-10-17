import type { FileSystemError, GitError, ValidationError } from '@/utils/errors';

export type ToolResult<T> =
	| { success: true; data: T; message?: string }
	| {
			success: false;
			error: string;
			type: 'git_error' | 'validation_error' | 'filesystem_error' | 'unknown_error';
			recoverable: boolean;
			suggestion?: string;
	  };

export type WorktreeError = GitError | ValidationError | FileSystemError;
