import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { log } from '@/utils/prompts';

interface UpdateCheckCache {
	lastCheck: number;
	latestVersion?: string;
}

interface PackageJson {
	name: string;
	version: string;
}

const CACHE_DIR =
	process.platform === 'win32'
		? join(process.env.LOCALAPPDATA || tmpdir(), 'worktree-cli', 'Cache')
		: join(homedir(), '.cache', 'worktree-cli');

const CACHE_FILE = join(CACHE_DIR, 'update-check.json');

async function ensureCacheDir(): Promise<void> {
	try {
		await mkdir(CACHE_DIR, { recursive: true });
	} catch {
		// Ignore
	}
}

async function readCache(): Promise<UpdateCheckCache | null> {
	try {
		const data = await readFile(CACHE_FILE, 'utf-8');
		return JSON.parse(data);
	} catch {
		return null;
	}
}

async function writeCache(cache: UpdateCheckCache): Promise<void> {
	try {
		await ensureCacheDir();
		await writeFile(CACHE_FILE, JSON.stringify(cache, null, 2), 'utf-8');
	} catch {
		// Ignore
	}
}

async function fetchLatestVersion(packageName: string): Promise<string | null> {
	try {
		const response = await fetch(`https://registry.npmjs.org/${packageName}/latest`, {
			headers: { Accept: 'application/json' },
			signal: AbortSignal.timeout(3000),
		});

		if (!response.ok) return null;

		const data = (await response.json()) as { version?: string };
		return data.version || null;
	} catch {
		return null;
	}
}

function isNewerVersion(current: string, latest: string): boolean {
	if (current.includes('-') || latest.includes('-')) return false;

	const parseCurrent = current.split('.').map(Number);
	const parseLatest = latest.split('.').map(Number);

	for (let i = 0; i < Math.max(parseCurrent.length, parseLatest.length); i++) {
		const c = parseCurrent[i] || 0;
		const l = parseLatest[i] || 0;
		if (l > c) return true;
		if (l < c) return false;
	}

	return false;
}

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
