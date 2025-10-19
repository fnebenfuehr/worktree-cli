import { basename } from 'node:path';

/**
 * Convert branch name to directory name by replacing slashes with dashes
 * @example "feature/login" -> "feature-login"
 */
export function branchToDirName(branch: string): string {
	return branch.replace(/\//g, '-');
}

/**
 * Extract repository name from git URL
 * Handles: git@github.com:user/repo.git, https://github.com/user/repo.git, https://github.com/user/repo
 */
export function extractRepoName(url: string): string | null {
	const cleanUrl = url.replace(/\/$/, '');
	const name = basename(cleanUrl).replace(/\.git$/, '');

	return name || null;
}
