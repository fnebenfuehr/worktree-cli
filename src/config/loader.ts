import { cosmiconfig } from 'cosmiconfig';
import { log } from '@/utils/prompts';

export interface WorktreeConfig {
	post_create?: string[];
	pre_remove?: string[];
	post_remove?: string[];
	copy_files?: string[];
}

const explorer = cosmiconfig('worktree', {
	searchPlaces: [
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
	try {
		const result = await explorer.search(searchPath);
		return result?.config || null;
	} catch (error) {
		if (process.env.DEBUG) {
			console.error('Error loading worktree config:', error);
		}
		return null;
	}
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
