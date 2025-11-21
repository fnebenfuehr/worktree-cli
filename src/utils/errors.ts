export class WorktreeError extends Error {
	constructor(
		message: string,
		public readonly code: string,
		public readonly exitCode: number = 1,
		options?: ErrorOptions
	) {
		super(message, options);
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
		super(message, 'GIT_ERROR', 1, options);
		this.name = 'GitError';
	}
}

export class ValidationError extends WorktreeError {
	constructor(message: string, options?: ErrorOptions) {
		super(message, 'VALIDATION_ERROR', 1, options);
		this.name = 'ValidationError';
	}
}

export class FileSystemError extends WorktreeError {
	constructor(message: string, options?: ErrorOptions) {
		super(message, 'FS_ERROR', 1, options);
		this.name = 'FileSystemError';
	}
}

export class UserCancelledError extends WorktreeError {
	constructor(message: string = 'Operation cancelled', options?: ErrorOptions) {
		super(message, 'USER_CANCELLED', 0, options);
		this.name = 'UserCancelledError';
	}
}

export class UncommittedChangesError extends GitError {
	public readonly statusSummary?: string;

	constructor(identifier: string, statusSummary?: string) {
		const baseMessage = `Worktree '${identifier}' has uncommitted changes.`;
		const actionMessage = 'Commit or stash changes, or use --force to override.';

		const message = statusSummary
			? `${baseMessage}\n\n${statusSummary}\n\n${actionMessage}`
			: `${baseMessage} ${actionMessage}`;

		super(message, 'git status --porcelain');
		this.name = 'UncommittedChangesError';
		this.statusSummary = statusSummary;
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

export class GhCliError extends WorktreeError {
	constructor(message: string, options?: ErrorOptions) {
		super(message, 'GH_CLI_ERROR', 1, options);
		this.name = 'GhCliError';
	}
}
