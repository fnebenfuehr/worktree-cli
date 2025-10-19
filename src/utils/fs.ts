import { cp, mkdir, readdir, rename, stat } from 'node:fs/promises';
import { tryCatch } from '@/utils/try-catch';

export async function exists(path: string): Promise<boolean> {
	const { error } = await tryCatch(stat(path));
	return error === null;
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
	const entries = await readdir(dir, { withFileTypes: true });
	return entries.map((entry) => entry.name);
}
