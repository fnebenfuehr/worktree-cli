import { dirname, join } from 'node:path';
import type { WorktreeConfig } from '@/config/loader';
import { copyFile, createDir } from '@/utils/fs';
import { log } from '@/utils/prompts';
import { tryCatch } from '@/utils/try-catch';
import { isSafePath } from '@/utils/validation';

export interface CopyResult {
	success: number;
	failed: number;
	skipped: number;
	total: number;
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
