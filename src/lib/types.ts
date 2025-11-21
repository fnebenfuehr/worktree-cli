/**
 * Shared types for the worktree CLI library
 */

/**
 * Information about a git worktree
 */
export interface WorktreeInfo {
	path: string;
	commit: string;
	branch: string;
}

/**
 * Result of checking worktree status
 */
export interface StatusResult {
	enabled: boolean;
	count: number;
	defaultBranch?: string;
}

/**
 * Result of creating a new worktree
 */
export interface CreateResult {
	path: string;
	branch: string;
	created: boolean;
}

/**
 * Result of switching to a worktree
 */
export interface SwitchResult {
	path: string;
	branch: string;
}

/**
 * Result of checking out a branch
 */
export interface CheckoutResult {
	path: string;
	branch: string;
	action: 'switched' | 'created';
	created?: boolean;
	source?: 'local' | 'remote';
}

/**
 * Result of removing a worktree
 */
export interface RemoveResult {
	path: string;
}

/**
 * Result of setting up worktree structure
 */
export interface SetupResult {
	repositoryPath: string;
	worktreePath: string;
}

/**
 * Configuration for worktree hooks and file operations
 */
export interface WorktreeConfig {
	$schema?: string;
	post_create?: string[];
	pre_remove?: string[];
	post_remove?: string[];
	copy_files?: string[];
}

/**
 * Result of copying configuration files
 */
export interface CopyResult {
	success: number;
	failed: number;
	skipped: number;
	total: number;
}

/**
 * Hook type for lifecycle events
 */
export type HookType = 'post_create' | 'pre_remove' | 'post_remove';

/**
 * Environment context for worktree operations
 */
export interface WorktreeEnv {
	worktreePath: string;
	branch: string;
	mainPath: string;
}

/**
 * Result of executing a git command
 */
export interface GitCommandResult {
	stdout: string;
	stderr: string;
	exitCode: number;
}
