import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { cosmiconfig } from 'cosmiconfig';
import type { CopyResult, WorktreeConfig } from '@/lib/types';
import { copyFile, createDir, exists } from '@/utils/fs';
import { log } from '@/utils/prompts';
import { tryCatch } from '@/utils/try-catch';
import { isSafePath } from '@/utils/validation';

const explorer = cosmiconfig('worktree', {
	searchPlaces: [
		'.worktree.json',
		'.worktreerc',
		'.worktreerc.json',
		'.worktreerc.yaml',
		'.worktreerc.yml',
		'.worktree.yml',
		'.worktree.yaml',
		'worktree.config.js',
		'worktree.config.cjs',
	],
});

export async function loadConfig(searchPath: string): Promise<WorktreeConfig | null> {
	// Clear cache to ensure fresh reads after writes
	explorer.clearCaches();
	const { error, data: result } = await tryCatch(explorer.search(searchPath));
	if (error) {
		if (process.env.DEBUG) {
			console.error('Error loading worktree config:', error);
		}
		return null;
	}
	return result?.config || null;
}

export async function configExists(searchPath: string): Promise<boolean> {
	const config = await loadConfig(searchPath);
	return config !== null;
}

/**
 * Ensure config exists and has defaultBranch set, updating if missing
 */
export async function ensureConfig(gitRoot: string, defaultBranch: string): Promise<void> {
	const config = await loadConfig(gitRoot);

	if (config?.defaultBranch) {
		return;
	}

	await writeConfig(gitRoot, { defaultBranch });
	log.info(`Updated config with defaultBranch: ${defaultBranch}`);
}

function isStringArray(value: unknown): value is string[] {
	return (
		Array.isArray(value) &&
		value.every((item) => typeof item === 'string' && item.trim().length > 0)
	);
}

export function validateConfig(config: WorktreeConfig): boolean {
	const fields = ['post_create', 'pre_remove', 'post_remove', 'copy_files'] as const;

	for (const field of fields) {
		const value = config[field];
		if (value !== undefined && !isStringArray(value)) {
			return false;
		}
	}

	return true;
}

export async function loadAndValidateConfig(gitRoot: string): Promise<WorktreeConfig | null> {
	const config = await loadConfig(gitRoot);

	if (config && !validateConfig(config)) {
		log.warn('Invalid configuration detected, skipping hooks and file operations');
		return null;
	}

	return config;
}

/**
 * Write or update worktree configuration file
 * Merges with existing config if present
 */
export async function writeConfig(
	gitRoot: string,
	newConfig: Partial<WorktreeConfig>
): Promise<void> {
	const configPath = join(gitRoot, '.worktree.json');

	let existingConfig: WorktreeConfig = {};
	if (await exists(configPath)) {
		const loaded = await loadConfig(gitRoot);
		if (loaded) {
			existingConfig = loaded;
		}
	}

	const mergedConfig: WorktreeConfig = {
		...existingConfig,
		...newConfig,
	};

	const content = JSON.stringify(mergedConfig, null, '\t');
	await writeFile(configPath, `${content}\n`, 'utf-8');
}

export async function copyConfigFiles(opts: {
	config: WorktreeConfig;
	gitRoot: string;
	destDir: string;
	verbose?: boolean;
}): Promise<CopyResult> {
	const result: CopyResult = { success: 0, failed: 0, skipped: 0, total: 0 };

	if (!opts.config.copy_files || opts.config.copy_files.length === 0) {
		return result;
	}

	result.total = opts.config.copy_files.length;

	for (const file of opts.config.copy_files) {
		if (!isSafePath(file)) {
			result.failed++;
			log.warn(`Rejected unsafe path: ${file} (contains directory traversal)`);
			continue;
		}

		const sourcePath = join(opts.gitRoot, file);
		const destPath = join(opts.destDir, file);

		const { error } = await tryCatch(async () => {
			await createDir(dirname(destPath));
			await copyFile(sourcePath, destPath);
		});

		if (error) {
			const errorMsg = error.message || String(error);
			if (errorMsg.includes('ENOENT') || errorMsg.includes('no such file')) {
				result.skipped++;
				if (opts.verbose) {
					log.warn(`Skipped (not found): ${file}`);
				}
			} else {
				result.failed++;
				log.warn(`Failed to copy ${file}: ${errorMsg}`);
			}
		} else {
			result.success++;
			if (opts.verbose) {
				log.step(`Copied: ${file}`);
			}
		}
	}

	return result;
}
