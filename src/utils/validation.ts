import { normalize, sep } from 'node:path';

export const VALIDATION_ERRORS = {
	BRANCH_NAME_INVALID:
		'Branch names cannot contain: .., @{, \\, ^, ~, :, ?, *, [, ;, &, |, `, $, (, ), <, >, spaces or end with . or .lock',
	GIT_URL_INVALID:
		'Expected format: git@github.com:user/repo.git, https://github.com/user/repo.git, git://host/repo.git, or file:///path/to/repo.git',
} as const;

const HOSTNAME_PATTERN =
	'[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?(?:\\.[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?)*';

const IPV4_PATTERN =
	'(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)';

const IPV6_PATTERN = '\\[(?:[0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}\\]';
const HOST_PATTERN = `(?:${HOSTNAME_PATTERN}|${IPV4_PATTERN}|${IPV6_PATTERN})`;
const USERNAME_PATTERN = '[\\w.-]+';

const SSH_TRADITIONAL_PATTERN = new RegExp(
	`^${USERNAME_PATTERN}@${HOST_PATTERN}:[\\w._\\/-]+(\\.git)?$`
);

const SSH_PROTOCOL_PATTERN = new RegExp(
	`^(ssh|git):\\/\\/(${USERNAME_PATTERN}@)?${HOST_PATTERN}(:\\d+)?\\/[\\w._\\/-]+(\\.git)?$`
);

const HTTPS_PATTERN = new RegExp(
	`^https?:\\/\\/(${USERNAME_PATTERN}(:[^@]+)?@)?${HOST_PATTERN}(:\\d+)?\\/[\\w._\\/-]+(\\.git)?$`
);

const FILE_PATTERN = /^file:\/\/\/[\w._/-]+(\.git)?$/;

const BRANCH_CONTROL_AND_WHITESPACE = /[\x00-\x1f\x7f\s]/;
const BRANCH_GIT_FORBIDDEN = /[\\^~:?*[]|\.\.|\/{2,}|@\{/;
const BRANCH_SHELL_METACHAR = /[;&|`$()<>]/;

// Supports formats:
// - SSH: git@github.com:user/repo.git, deploy@server.com:repo.git, user@192.168.1.1:repo.git
// - SSH with protocol: ssh://git@github.com:2222/user/repo.git
// - HTTPS: https://github.com/user/repo.git or https://user:token@github.com/user/repo
// - Git protocol: git://github.com/user/repo.git
// - File: file:///path/to/repo.git
// - IPv4/IPv6: git@192.168.1.1:repo.git, git@[::1]:repo.git
export function isValidGitUrl(url: string): boolean {
	if (!url || typeof url !== 'string') return false;

	return (
		SSH_TRADITIONAL_PATTERN.test(url) ||
		SSH_PROTOCOL_PATTERN.test(url) ||
		HTTPS_PATTERN.test(url) ||
		FILE_PATTERN.test(url)
	);
}

// Git branch naming rules:
// - Cannot contain: .., @{, \, ^, ~, :, ?, *, [, spaces
// - Cannot start with: /, ., -
// - Cannot end with: /, ., .lock
// - Cannot have consecutive slashes
// - Cannot be '@'
// - Cannot contain control characters
// - Cannot be empty
// See: https://git-scm.com/docs/git-check-ref-format
export function isValidBranchName(branch: string): boolean {
	if (!branch || typeof branch !== 'string') return false;
	if (branch === '@') return false;
	if (branch.startsWith('/') || branch.startsWith('.') || branch.startsWith('-')) return false;
	if (branch.endsWith('/') || branch.endsWith('.') || branch.endsWith('.lock')) return false;
	if (BRANCH_CONTROL_AND_WHITESPACE.test(branch)) return false;
	if (BRANCH_GIT_FORBIDDEN.test(branch)) return false;
	if (BRANCH_SHELL_METACHAR.test(branch)) return false;

	return true;
}

// Prevents path traversal attacks by checking for:
// - .. segments in the path
// - Paths that normalize to something different (potential traversal)
// - Single dot (.) segments that could be used for obfuscation
//
// Note: Accepts both relative and absolute paths.
// Absolute paths (starting with /) are considered safe if they don't contain traversal attempts.
//
// SECURITY WARNING: Does NOT protect against symlink-based traversal attacks.
// For complete security, resolve symlinks and verify the resolved path is within expected boundaries.
export function isSafePath(path: string): boolean {
	if (!path || typeof path !== 'string') return false;

	// Reject paths with .. segments (traversal attempt)
	if (path.includes('..')) return false;

	const normalized = normalize(path);

	// Normalize input path separators to platform-specific
	// This handles mixed separators (e.g., foo/bar on Windows)
	const pathWithCorrectSep = path.split('/').join(sep).split('\\').join(sep);

	// Reject if path differs after normalization (indicates . segments)
	return pathWithCorrectSep === normalized;
}
