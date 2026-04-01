#!/usr/bin/env bun

/**
 * Git Worktree CLI
 * A modern CLI tool for managing git worktrees with ease
 */

import { Command, CommanderError } from 'commander';
import { checkoutCommand } from '@/commands/checkout';
import { cloneCommand } from '@/commands/clone';
import { createCommand } from '@/commands/create';
import { listCommand } from '@/commands/list';
import { mcpConfigCommand, mcpStartCommand, mcpTestCommand } from '@/commands/mcp';
import { prCommand } from '@/commands/pr';
import { removeCommand } from '@/commands/remove';
import { setupCommand } from '@/commands/setup';
import { statusCommand } from '@/commands/status';
import { switchCommand } from '@/commands/switch';
import { getVersionInfo, updateCommand } from '@/commands/update';
import { UserCancelledError, WorktreeError } from '@/utils/errors';
import { log } from '@/utils/prompts';
import { checkForUpdates } from '@/utils/update-checker';
import packageJson from '../package.json';

const VERSION = packageJson.version;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Wraps command actions with consistent error handling
 */
function handleCommandError(fn: () => Promise<number>) {
	return async () => {
		try {
			const exitCode = await fn();
			process.exitCode = exitCode;
		} catch (error) {
			if (error instanceof UserCancelledError) {
				process.exitCode = 0;
				return;
			}
			if (error instanceof WorktreeError) {
				log.error(error.message);
				if (process.env.DEBUG) {
					console.error(error);
				}
				process.exitCode = error.exitCode;
			} else {
				throw error;
			}
		}
	};
}

const program = new Command();

program
	.name('worktree')
	.description('A modern CLI tool for managing git worktrees with ease')
	.option('-v, --version', 'Show version')
	.option('--verbose', 'Enable verbose output')
	.on('option:version', async () => {
		console.log(VERSION);
		try {
			const info = await getVersionInfo(packageJson);
			if (info.updateAvailable && info.latest) {
				console.log(`\nUpdate available: ${info.current} → ${info.latest}`);
				console.log(`Run: npm update -g ${packageJson.name}`);
			}
		} catch {
			// Silently ignore update check errors
		}
		process.exit(0);
	})
	.addHelpText(
		'after',
		`
Examples:
  $ worktree clone git@github.com:user/my-app.git
  $ worktree setup
  $ worktree create feat/auth
  $ worktree create feat/login-ui --from feat/auth
  $ worktree checkout feat/auth         # switch to existing or create from local/remote
  $ worktree add feat/dark-mode          # alias for checkout (git-like)
  $ worktree switch feat/auth
  $ worktree remove fix/bug-123
  $ worktree list
`
	)
	.showHelpAfterError()
	.exitOverride()
	.hook('preAction', (thisCommand) => {
		// Enable debug mode if --verbose flag is present
		const opts = thisCommand.optsWithGlobals();
		if (opts.verbose) {
			process.env.DEBUG = '1';
		}
	});

// Repository setup commands
program
	.command('clone [git-url]')
	.description('Clone a repo into a worktree-ready structure')
	.action((gitUrl: string | undefined) => handleCommandError(() => cloneCommand(gitUrl))());

program
	.command('setup')
	.description('Convert existing clone to worktree structure')
	.action(() => handleCommandError(() => setupCommand())());

// Branch management commands
interface CommandOptions {
	hooks?: boolean;
	force?: boolean;
	from?: string;
	trustHooks?: boolean;
}

program
	.command('create [branch]')
	.description('Create a new git worktree and branch')
	.option('--no-hooks', 'Skip running lifecycle hooks')
	.option('--trust-hooks', 'Trust all hook commands without security validation')
	.option('-f, --from <branch>', 'Base branch to create from')
	.action((branch: string | undefined, options: CommandOptions, command) => {
		const globalOpts = command.optsWithGlobals();
		handleCommandError(() =>
			createCommand(branch, {
				skipHooks: !options.hooks,
				verbose: globalOpts.verbose,
				from: options.from,
				trustHooks: options.trustHooks,
			})
		)();
	});

program
	.command('remove [branch]')
	.description('Remove an existing git worktree')
	.option('--no-hooks', 'Skip running lifecycle hooks')
	.option('--trust-hooks', 'Trust all hook commands without security validation')
	.option('-f, --force', 'Force removal even with uncommitted changes')
	.action((branch: string | undefined, options: CommandOptions, command) => {
		const globalOpts = command.optsWithGlobals();
		handleCommandError(() =>
			removeCommand(branch, {
				skipHooks: !options.hooks,
				verbose: globalOpts.verbose,
				force: options.force,
				trustHooks: options.trustHooks,
			})
		)();
	});

program
	.command('list')
	.description('List all active worktrees')
	.action(() => handleCommandError(() => listCommand())());

program
	.command('status')
	.description('Show worktree status and configuration')
	.action(() => handleCommandError(() => statusCommand())());

program
	.command('switch [branch]')
	.description('Switch to an existing worktree')
	.action((branch: string | undefined) => handleCommandError(() => switchCommand(branch))());

program
	.command('checkout [branch]')
	.description('Checkout a branch (switch to existing worktree or create from local/remote)')
	.option('--no-hooks', 'Skip running lifecycle hooks')
	.option('--trust-hooks', 'Trust all hook commands without security validation')
	.action((branch: string | undefined, options: CommandOptions, command) => {
		const globalOpts = command.optsWithGlobals();
		handleCommandError(() =>
			checkoutCommand(branch, {
				skipHooks: !options.hooks,
				verbose: globalOpts.verbose,
				trustHooks: options.trustHooks,
			})
		)();
	});

// Alias 'add' to 'checkout' (git-like naming)
program
	.command('add [branch]')
	.description('Alias for checkout - git-like naming')
	.option('--no-hooks', 'Skip running lifecycle hooks')
	.option('--trust-hooks', 'Trust all hook commands without security validation')
	.action((branch: string | undefined, options: CommandOptions, command) => {
		const globalOpts = command.optsWithGlobals();
		handleCommandError(() =>
			checkoutCommand(branch, {
				skipHooks: !options.hooks,
				verbose: globalOpts.verbose,
				trustHooks: options.trustHooks,
			})
		)();
	});

program
	.command('pr [number]')
	.description('Checkout a PR by number or GitHub URL')
	.option('--no-hooks', 'Skip running lifecycle hooks')
	.action((prInput: string | undefined, options: CommandOptions, command) => {
		const globalOpts = command.optsWithGlobals();
		handleCommandError(() =>
			prCommand(prInput, {
				skipHooks: !options.hooks,
				verbose: globalOpts.verbose,
			})
		)();
	});

// MCP server commands
const mcpCommand = program.command('mcp').description('MCP server integration for AI assistants');

mcpCommand
	.command('start')
	.description('Start MCP server (used by AI tools)')
	.action(() => handleCommandError(() => mcpStartCommand())());

mcpCommand
	.command('config')
	.description('Show configuration for AI tools')
	.option('--json', 'Output JSON only')
	.action((options: { json?: boolean }) => handleCommandError(() => mcpConfigCommand(options))());

mcpCommand
	.command('test')
	.description('Test MCP server connection')
	.action(() => handleCommandError(() => mcpTestCommand())());

// Update command
program
	.command('update')
	.description('Update CLI to the latest version')
	.action(() => handleCommandError(() => updateCommand(packageJson))());

// Fire-and-forget update check (non-blocking)
checkForUpdates(packageJson, ONE_DAY_MS).catch(() => {
	// Silently ignore errors
});

// Parse arguments
try {
	await program.parseAsync(process.argv);
} catch (error) {
	// Handle Commander errors (help, version, parse errors)
	if (error instanceof CommanderError) {
		// For help and version, exit successfully (code 0)
		if (error.code === 'commander.helpDisplayed' || error.code === 'commander.version') {
			process.exitCode = 0;
		} else {
			// For other commander errors (invalid args, etc.), exit with error code
			process.exitCode = error.exitCode;
		}
	} else {
		// Handle unexpected errors (non-WorktreeError, non-CommanderError)
		log.error(`Unexpected error: ${error instanceof Error ? error.message : String(error)}`);
		if (process.env.DEBUG) {
			console.error(error);
		}
		process.exitCode = 1;
	}
}

// Node.js will exit naturally with the exitCode set above
