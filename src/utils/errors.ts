export class WorktreeError extends Error {
	constructor(
		message: string,
		public readonly code: string,
		public readonly exitCode: number = 1
	) {
		super(message);
		this.name = 'WorktreeError';
		Error.captureStackTrace(this, this.constructor);
	}
}

export class GitError extends WorktreeError {
	constructor(
		message: string,
		public readonly command: string,
		options?: ErrorOptions
	) {
		super(message, 'GIT_ERROR', 1);
		this.name = 'GitError';
		if (options?.cause) {
			this.cause = options.cause;
		}
	}
}

export class ValidationError extends WorktreeError {
	constructor(message: string) {
		super(message, 'VALIDATION_ERROR', 1);
		this.name = 'ValidationError';
	}
}

export class FileSystemError extends WorktreeError {
	constructor(message: string) {
		super(message, 'FS_ERROR', 1);
		this.name = 'FileSystemError';
	}
}

export class UserCancelledError extends WorktreeError {
	constructor(message: string = 'Operation cancelled') {
		super(message, 'USER_CANCELLED', 0);
		this.name = 'UserCancelledError';
	}
}

export class UncommittedChangesError extends GitError {
	constructor(identifier: string) {
		super(
			`Worktree '${identifier}' has uncommitted changes. Commit or stash changes, or use --force to override.`,
			'git status --porcelain --untracked-files=no'
		);
		this.name = 'UncommittedChangesError';
	}
}

export class UnmergedBranchError extends GitError {
	constructor(branch: string, targetBranch: string) {
		super(
			`Branch '${branch}' is not merged to '${targetBranch}'. Removing it will make those commits harder to recover. Use --force to override.`,
			'git branch --merged'
		);
		this.name = 'UnmergedBranchError';
	}
}

export class MergeStatusUnknownError extends GitError {
	constructor(branch: string, targetBranch: string) {
		super(
			`Cannot verify if branch '${branch}' is merged to '${targetBranch}'. Use --force to override.`,
			'git branch --merged'
		);
		this.name = 'MergeStatusUnknownError';
	}
}
