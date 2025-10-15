import { $ } from 'bun';
import type { WorktreeConfig } from '@/config/loader';
import { log, spinner } from '@/utils/prompts';

export type HookType = 'post_create' | 'pre_remove' | 'post_remove';

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

	for (let i = 0; i < commands.length; i++) {
		const command = commands[i];
		const s = spinner();

		try {
			s.start(`Running: ${command} (${i + 1}/${commands.length})`);

			const result = await $`${command}`.cwd(options.cwd).quiet();

			if (result.exitCode !== 0) {
				s.stop(`Failed: ${command}`);
				log.warn(`Hook command failed but continuing: ${command}`);

				if (options.verbose && result.stderr) {
					console.error(result.stderr.toString());
				}

				continue;
			}

			s.stop(`Done: ${command}`);

			if (options.verbose && result.stdout) {
				console.log(result.stdout.toString());
			}
		} catch (error) {
			s.stop(`Error: ${command}`);
			const errorMsg = error instanceof Error ? error.message : String(error);
			log.warn(`Hook command could not be executed: ${command}\nReason: ${errorMsg}`);

			if (options.verbose) {
				console.error(error);
			}
		}
	}
}
