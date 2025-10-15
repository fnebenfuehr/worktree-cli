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
		public readonly command: string
	) {
		super(message, 'GIT_ERROR', 1);
		this.name = 'GitError';
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
