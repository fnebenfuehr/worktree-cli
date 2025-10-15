#!/usr/bin/env bun

/**
 * Git Worktree CLI
 * A modern CLI tool for managing git worktrees with ease
 */

import { Command, CommanderError } from 'commander';
import updateNotifier from 'update-notifier';
import { cloneCommand } from '@/commands/clone';
import { createCommand } from '@/commands/create';
import { listCommand } from '@/commands/list';
import { removeCommand } from '@/commands/remove';
import { setupCommand } from '@/commands/setup';
import { switchCommand } from '@/commands/switch';
import { UserCancelledError, WorktreeError } from '@/utils/errors';
import { log } from '@/utils/prompts';
import packageJson from '../package.json';

const VERSION = packageJson.version;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const UPDATE_CHECK_INTERVAL = ONE_DAY_MS;

/**
 * Check for available updates to the CLI
 * Non-blocking background check, runs once per day
 */
function checkVersion(): void {
	updateNotifier({
		pkg: packageJson,
		updateCheckInterval: UPDATE_CHECK_INTERVAL,
	}).notify({
		isGlobal: true,
		defer: false,
	});
}

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
	.version(VERSION, '-v, --version', 'Show version')
	.option('--verbose', 'Enable verbose output')
	.option('--no-update-check', 'Disable update check')
	.addHelpText(
		'after',
		`
Examples:
  $ worktree clone git@github.com:user/my-app.git
  $ worktree setup
  $ worktree create feature/login
  $ worktree switch feature/login
  $ worktree remove feature/login
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
}

program
	.command('create [branch]')
	.description('Create a new git worktree and branch')
	.option('--no-hooks', 'Skip running lifecycle hooks')
	.action((branch: string | undefined, options: CommandOptions, command) => {
		const globalOpts = command.optsWithGlobals();
		handleCommandError(() =>
			createCommand(branch, {
				skipHooks: !options.hooks,
				verbose: globalOpts.verbose,
			})
		)();
	});

program
	.command('remove [branch]')
	.description('Remove an existing git worktree')
	.option('--no-hooks', 'Skip running lifecycle hooks')
	.action((branch: string | undefined, options: CommandOptions, command) => {
		const globalOpts = command.optsWithGlobals();
		handleCommandError(() =>
			removeCommand(branch, {
				skipHooks: !options.hooks,
				verbose: globalOpts.verbose,
			})
		)();
	});

program
	.command('list')
	.description('List all active worktrees')
	.action(() => handleCommandError(() => listCommand())());

program
	.command('switch [branch]')
	.description('Switch to an existing worktree')
	.action((branch: string | undefined) => handleCommandError(() => switchCommand(branch))());

// Check for updates (non-blocking, unless --no-update-check flag is present)
if (!process.argv.includes('--no-update-check')) {
	checkVersion();
}

// Parse arguments - wrap in try-catch for unexpected errors
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
