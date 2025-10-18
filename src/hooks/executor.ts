import { $ } from 'bun';
import type { WorktreeConfig } from '@/config/loader';
import { log, spinner } from '@/utils/prompts';
import { tryCatch } from '@/utils/try-catch';

export type HookType = 'post_create' | 'pre_remove' | 'post_remove';

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

export async function executeCommand(command: string, cwd: string): Promise<CommandResult> {
	const { shell, flag } = getShellConfig();
	const { error, data } = await tryCatch(async () => {
		const result = await $`${shell} ${flag} ${command}`.cwd(cwd).quiet();
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

	for (let i = 0; i < commands.length; i++) {
		const command = commands[i];
		if (!command) continue;

		const s = spinner();
		s.start(`Running: ${command} (${i + 1}/${commands.length})`);

		const { error, data: result } = await tryCatch(executeCommand(command, options.cwd));

		if (error) {
			s.stop(`Error: ${command}`);
			const errorMsg = error instanceof Error ? error.message : String(error);
			log.warn(`Hook execution failed (via ${shellContext}): ${command}\nReason: ${errorMsg}`);

			if (options.verbose) {
				console.error(error);
			}
			continue;
		}

		if (result.exitCode !== 0) {
			s.stop(`Failed: ${command}`);
			log.warn(`Hook failed (via ${shellContext}): ${command}`);

			if (options.verbose && result.stderr) {
				console.error(result.stderr.toString());
			}
			continue;
		}

		s.stop(`Done: ${command}`);

		if (options.verbose && result.stdout) {
			console.log(result.stdout.toString());
		}
	}
}
