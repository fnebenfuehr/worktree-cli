import { basename } from 'node:path';
import { $ } from 'bun';
import type { HookType, WorktreeConfig, WorktreeEnv } from '@/lib/types';
import { isInteractive, log, promptConfirm, spinner } from '@/utils/prompts';
import { tryCatch } from '@/utils/try-catch';

// Security validation types
export type SecurityLevel = 'safe' | 'risky' | 'blocked';

export interface SecurityValidationResult {
	level: SecurityLevel;
	reason?: string;
	command: string;
}

// Safe paths that can be used with rm -rf
const SAFE_RM_PATHS = [
	'node_modules',
	'dist',
	'.cache',
	'build',
	'coverage',
	'.next',
	'.turbo',
	'__pycache__',
	'.pytest_cache',
	'target',
	'out',
	'.parcel-cache',
	'.nuxt',
	'.output',
];

// Patterns that are always blocked
const BLOCKED_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
	{
		pattern: /\bcurl\s+[^|]*\|\s*(?:ba)?sh\b/i,
		reason: 'Piping curl to shell is dangerous - could execute arbitrary remote code',
	},
	{
		pattern: /\bwget\s+[^|]*\|\s*(?:ba)?sh\b/i,
		reason: 'Piping wget to shell is dangerous - could execute arbitrary remote code',
	},
	{
		pattern: /\bsudo\b/,
		reason: 'sudo commands require elevated privileges and are blocked for security',
	},
	{
		pattern: /\beval\s+/,
		reason: 'eval can execute arbitrary code and is blocked for security',
	},
];

// Patterns that are safe and don't need confirmation
const SAFE_PATTERNS: RegExp[] = [
	// Package managers
	/^\s*npm\s+(install|ci|run|test|build|start|exec)\b/,
	/^\s*yarn(\s+(install|add|run|test|build|start))?\s*$/,
	/^\s*yarn\s+(install|add|run|test|build|start)\b/,
	/^\s*pnpm\s+(install|add|run|test|build|start)\b/,
	/^\s*bun\s+(install|add|run|test|build|start)\b/,
	// Docker
	/^\s*docker\s+compose\b/,
	/^\s*docker-compose\b/,
	// Basic file operations
	/^\s*mkdir\s+-?p?\s/,
	/^\s*cp\s+/,
	/^\s*mv\s+/,
	/^\s*touch\s+/,
	/^\s*echo\s+/,
	/^\s*cat\s+/,
	/^\s*ls\b/,
	/^\s*pwd\b/,
	// Git operations
	/^\s*git\s+(fetch|pull|checkout|branch|status|log|diff)\b/,
	// Common build tools
	/^\s*make\b/,
	/^\s*cmake\b/,
	/^\s*cargo\s+(build|run|test)\b/,
	/^\s*go\s+(build|run|test|mod)\b/,
	/^\s*python\s+-m\s+(pip|venv)\b/,
	/^\s*pip\s+install\b/,
	/^\s*composer\s+install\b/,
	/^\s*bundle\s+install\b/,
];

/**
 * Check if an rm -rf command targets a safe path
 */
function isRmRfSafe(command: string): boolean {
	// Match rm -rf or rm -r -f or rm -fr patterns
	const rmMatch = command.match(/\brm\s+(?:-[rf]+\s+)+(.+)/);
	if (!rmMatch || !rmMatch[1]) return false;

	const targetPath = rmMatch[1].trim();

	// Check if target is one of the safe paths
	return SAFE_RM_PATHS.some((safePath) => {
		// Match exact name or path ending with the safe name
		const pathLower = targetPath.toLowerCase();
		const safePathLower = safePath.toLowerCase();
		return (
			pathLower === safePathLower ||
			pathLower.endsWith(`/${safePathLower}`) ||
			pathLower.endsWith(`\\${safePathLower}`)
		);
	});
}

/**
 * Validate a hook command for security concerns
 */
export function validateHookCommand(command: string): SecurityValidationResult {
	// Check for blocked patterns first
	for (const { pattern, reason } of BLOCKED_PATTERNS) {
		if (pattern.test(command)) {
			return { level: 'blocked', reason, command };
		}
	}

	// Check for rm -rf (special handling)
	if (/\brm\s+(?:-[rf]+\s+)+/.test(command)) {
		if (isRmRfSafe(command)) {
			return { level: 'safe', command };
		}
		return {
			level: 'blocked',
			reason: 'rm -rf is only allowed for safe paths like node_modules, dist, .cache',
			command,
		};
	}

	// Check if command matches safe patterns
	for (const pattern of SAFE_PATTERNS) {
		if (pattern.test(command)) {
			return { level: 'safe', command };
		}
	}

	// Default to risky for unknown commands
	return {
		level: 'risky',
		reason: 'Unknown command pattern - requires confirmation',
		command,
	};
}

/**
 * Validate all commands in a hook configuration
 */
export function validateHookCommands(commands: string[]): SecurityValidationResult[] {
	return commands.map(validateHookCommand);
}

interface ShellConfig {
	shell: string;
	flag: string;
}

export function getShellConfig(platform: string = process.platform): ShellConfig {
	const isWindows = platform === 'win32';
	return {
		shell: isWindows ? 'cmd' : 'sh',
		flag: isWindows ? '/c' : '-c',
	};
}

interface CommandResult {
	exitCode: number;
	stdout: Buffer;
	stderr: Buffer;
}

export function buildWorktreeEnv(context: WorktreeEnv): Record<string, string> {
	return {
		WORKTREE_PATH: context.worktreePath,
		WORKTREE_BRANCH: context.branch,
		WORKTREE_MAIN_PATH: context.mainPath,
		WORKTREE_PROJECT: basename(context.mainPath),
	};
}

export async function executeCommand(
	command: string,
	cwd: string,
	env?: Record<string, string>
): Promise<CommandResult> {
	const { shell, flag } = getShellConfig();
	const mergedEnv = env ? { ...process.env, ...env } : process.env;
	const { error, data } = await tryCatch(async () => {
		const result = await $`${shell} ${flag} ${command}`.cwd(cwd).env(mergedEnv).quiet();
		return {
			exitCode: result.exitCode,
			stdout: result.stdout,
			stderr: result.stderr,
		};
	});

	if (error) {
		// Check if it's a shell error with exit code info
		if ('exitCode' in error) {
			const shellError = error as Error & { exitCode: number; stdout?: Buffer; stderr?: Buffer };
			return {
				exitCode: shellError.exitCode,
				stdout: shellError.stdout || Buffer.from(''),
				stderr: shellError.stderr || Buffer.from(''),
			};
		}
		throw error;
	}

	return data;
}

interface ExecuteHooksOptions {
	cwd: string;
	skipHooks?: boolean;
	verbose?: boolean;
	env?: WorktreeEnv;
	trustHooks?: boolean;
}

export async function executeHooks(
	config: WorktreeConfig | null,
	hookType: HookType,
	options: ExecuteHooksOptions
): Promise<void> {
	if (options.skipHooks || !config || !config[hookType]) {
		return;
	}

	const commands = config[hookType];
	if (!commands || commands.length === 0) {
		return;
	}

	const { shell, flag } = getShellConfig();
	const shellContext = `${shell} ${flag}`;
	const envVars = options.env ? buildWorktreeEnv(options.env) : undefined;

	// Validate all commands if not trusted
	if (!options.trustHooks) {
		const validationResults = validateHookCommands(commands);
		const blockedCommands = validationResults.filter((r) => r.level === 'blocked');
		const riskyCommands = validationResults.filter((r) => r.level === 'risky');

		// Block dangerous commands
		if (blockedCommands.length > 0) {
			for (const blocked of blockedCommands) {
				log.error(`Blocked hook command: ${blocked.command}`);
				log.warn(`Reason: ${blocked.reason}`);
			}
			log.warn('Use --trust-hooks to bypass security validation (not recommended)');
			return;
		}

		// Prompt for risky commands
		if (riskyCommands.length > 0 && isInteractive()) {
			log.warn('The following hook commands require confirmation:');
			for (const risky of riskyCommands) {
				log.message(`  - ${risky.command}`);
			}

			const confirmed = await promptConfirm(
				'Do you want to run these commands? (Use --trust-hooks to skip this prompt)',
				false
			);

			if (!confirmed) {
				log.info('Hook execution cancelled by user');
				return;
			}
		} else if (riskyCommands.length > 0 && !isInteractive()) {
			// Non-interactive mode: skip risky commands without trust flag
			log.warn('Skipping unrecognized hook commands in non-interactive mode:');
			for (const risky of riskyCommands) {
				log.message(`  - ${risky.command}`);
			}
			log.warn('Use --trust-hooks to run these commands');
			// Filter to only safe commands
			const safeCommands = commands.filter((cmd) => {
				const result = validateHookCommand(cmd);
				return result.level === 'safe';
			});
			if (safeCommands.length === 0) {
				return;
			}
			// Continue with only safe commands
			for (let i = 0; i < safeCommands.length; i++) {
				const command = safeCommands[i];
				if (!command) continue;
				await runHookCommand(command, i, safeCommands.length, options, shellContext, envVars);
			}
			return;
		}
	}

	for (let i = 0; i < commands.length; i++) {
		const command = commands[i];
		if (!command) continue;
		await runHookCommand(command, i, commands.length, options, shellContext, envVars);
	}
}

async function runHookCommand(
	command: string,
	index: number,
	total: number,
	options: ExecuteHooksOptions,
	shellContext: string,
	envVars?: Record<string, string>
): Promise<void> {
	const s = spinner();
	s.start(`Running: ${command} (${index + 1}/${total})`);

	const { error, data: result } = await tryCatch(executeCommand(command, options.cwd, envVars));

	if (error) {
		s.stop(`Error: ${command}`);
		const errorMsg = error instanceof Error ? error.message : String(error);
		log.warn(`Hook execution failed (via ${shellContext}): ${command}\nReason: ${errorMsg}`);

		if (options.verbose) {
			console.error(error);
		}
		return;
	}

	if (result.exitCode !== 0) {
		s.stop(`Failed: ${command}`);
		log.warn(`Hook failed (via ${shellContext}): ${command}`);

		if (options.verbose && result.stderr) {
			console.error(result.stderr.toString());
		}
		return;
	}

	s.stop(`Done: ${command}`);

	if (options.verbose && result.stdout) {
		console.log(result.stdout.toString());
	}
}
