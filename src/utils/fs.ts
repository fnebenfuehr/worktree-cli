import { cp, realpath as fsRealpath, mkdir, readdir, rename, stat } from 'node:fs/promises';
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
