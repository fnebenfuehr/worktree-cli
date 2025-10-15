import { cp, realpath as fsRealpath, mkdir, readdir, rename, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';

export async function exists(path: string): Promise<boolean> {
	try {
		await stat(path);
		return true;
	} catch {
		return false;
	}
}

export async function realpath(path: string): Promise<string> {
	try {
		return await fsRealpath(path);
	} catch {
		return path;
	}
}

// Handles: git@github.com:user/repo.git, https://github.com/user/repo.git, https://github.com/user/repo
export function extractRepoName(url: string): string | null {
	const cleanUrl = url.replace(/\/$/, '');
	const name = basename(cleanUrl).replace(/\.git$/, '');

	return name || null;
}

export function branchToDirName(branch: string): string {
	return branch.replace(/\//g, '-');
}

export async function findGitReposInSubdirs(dir: string): Promise<string[]> {
	try {
		const entries = await readdir(dir, { withFileTypes: true });
		const repos: string[] = [];

		for (const entry of entries) {
			if (entry.isDirectory()) {
				const gitDir = join(dir, entry.name, '.git');
				if (await exists(gitDir)) {
					repos.push(join(dir, entry.name));
				}
			}
		}

		return repos;
	} catch {
		return [];
	}
}

export async function createDir(path: string): Promise<void> {
	await mkdir(path, { recursive: true });
}

export async function move(source: string, destination: string): Promise<void> {
	await rename(source, destination);
}

export async function copyFile(source: string, destination: string): Promise<void> {
	await cp(source, destination);
}

export async function getAllItems(dir: string): Promise<string[]> {
	try {
		const entries = await readdir(dir, { withFileTypes: true });
		return entries.map((entry) => entry.name);
	} catch {
		return [];
	}
}
