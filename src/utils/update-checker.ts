import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { log } from '@/utils/prompts';
import { tryCatch } from '@/utils/try-catch';

const UpdateCheckCacheSchema = z.object({
	lastCheck: z.number(),
	latestVersion: z.string().optional(),
});

type UpdateCheckCache = z.infer<typeof UpdateCheckCacheSchema>;

interface PackageJson {
	name: string;
	version: string;
}

const CACHE_FILENAME = 'update-check.json';
const PRERELEASE_PATTERN = /-(?:alpha|beta|rc|pre|canary|next|dev)/;

const getDefaultCacheDir = () =>
	process.platform === 'win32'
		? join(process.env.LOCALAPPDATA || tmpdir(), 'worktree-cli', 'Cache')
		: join(homedir(), '.cache', 'worktree-cli');

let cacheDir = getDefaultCacheDir();
let cacheFile = join(cacheDir, CACHE_FILENAME);

export function setCacheDir(dir: string): void {
	cacheDir = dir;
	cacheFile = join(dir, CACHE_FILENAME);
}

async function ensureCacheDir(): Promise<void> {
	const { error } = await tryCatch(mkdir(cacheDir, { recursive: true }));
	if (process.env.DEBUG && error) {
		console.error('Failed to create cache directory:', error);
	}
}

async function readCache(): Promise<UpdateCheckCache | null> {
	const { error, data } = await tryCatch(async () => {
		const fileData = await readFile(cacheFile, 'utf-8');
		const parsed = JSON.parse(fileData);
		return UpdateCheckCacheSchema.parse(parsed);
	});

	if (error) {
		if (process.env.DEBUG) {
			console.error('Failed to read cache:', error);
		}
		return null;
	}

	return data;
}

async function writeCache(cache: UpdateCheckCache): Promise<void> {
	const { error } = await tryCatch(async () => {
		await ensureCacheDir();
		await writeFile(cacheFile, JSON.stringify(cache, null, 2), 'utf-8');
	});

	if (process.env.DEBUG && error) {
		console.error('Failed to write cache:', error);
	}
}

export async function fetchLatestVersion(packageName: string): Promise<string | null> {
	const { error, data: response } = await tryCatch(
		fetch(`https://registry.npmjs.org/${packageName}/latest`, {
			headers: { Accept: 'application/json' },
			signal: AbortSignal.timeout(3000),
		})
	);

	if (error || !response.ok) return null;

	const { error: jsonError, data } = await tryCatch(
		async () => (await response.json()) as { version?: string }
	);
	if (jsonError) return null;

	return data.version || null;
}

function isValidVersion(version: string): boolean {
	const parts = version.split('.');
	if (parts.length === 0) return false;
	return parts.every((part) => {
		const num = Number(part);
		return !Number.isNaN(num) && num >= 0 && Number.isInteger(num);
	});
}

export function isNewerVersion(current: string, latest: string): boolean {
	if (PRERELEASE_PATTERN.test(current) || PRERELEASE_PATTERN.test(latest)) {
		return false;
	}

	if (!isValidVersion(current) || !isValidVersion(latest)) {
		return false;
	}

	const parsedCurrent = current.split('.').map(Number);
	const parsedLatest = latest.split('.').map(Number);

	for (let i = 0; i < Math.max(parsedCurrent.length, parsedLatest.length); i++) {
		const currentPart = parsedCurrent[i] || 0;
		const latestPart = parsedLatest[i] || 0;
		if (latestPart > currentPart) return true;
		if (latestPart < currentPart) return false;
	}

	return false;
}

/**
 * Checks for available package updates and displays a message if a newer version exists.
 *
 * Fetches the latest version from npm registry and compares it with the current version.
 * Results are cached for the specified interval to avoid excessive network requests.
 *
 * @param pkg - Package information containing name and current version
 * @param checkIntervalMs - Minimum time in milliseconds between update checks
 *
 * @example
 * ```ts
 * await checkForUpdates(
 *   { name: '@fnebenfuehr/worktree-cli', version: '1.0.0' },
 *   24 * 60 * 60 * 1000 // 24 hours
 * );
 * ```
 */
export async function checkForUpdates(pkg: PackageJson, checkIntervalMs: number): Promise<void> {
	const cache = await readCache();
	const now = Date.now();

	if (cache && now - cache.lastCheck < checkIntervalMs) {
		if (cache.latestVersion && isNewerVersion(pkg.version, cache.latestVersion)) {
			displayUpdateMessage(pkg.version, cache.latestVersion, pkg.name);
		}
		return;
	}

	const latestVersion = await fetchLatestVersion(pkg.name);

	await writeCache({
		lastCheck: now,
		latestVersion: latestVersion || undefined,
	});

	if (latestVersion && isNewerVersion(pkg.version, latestVersion)) {
		displayUpdateMessage(pkg.version, latestVersion, pkg.name);
	}
}

function displayUpdateMessage(current: string, latest: string, packageName: string): void {
	log.info(`Update available: ${current} → ${latest}\nRun: npm update -g ${packageName}`);
}
