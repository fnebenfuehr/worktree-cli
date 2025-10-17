import { cp, realpath as fsRealpath, mkdir, readdir, rename, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { tryCatch } from '@/utils/try-catch';

export async function exists(path: string): Promise<boolean> {
	const { error } = await tryCatch(stat(path));
	return error === null;
}

export async function realpath(path: string): Promise<string> {
	const { error, data } = await tryCatch(fsRealpath(path));
	if (error) return path;
	return data;
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
	const { error, data: entries } = await tryCatch(readdir(dir, { withFileTypes: true }));
	if (error) return [];

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
	const { error, data: entries } = await tryCatch(readdir(dir, { withFileTypes: true }));
	if (error) return [];
	return entries.map((entry) => entry.name);
}
