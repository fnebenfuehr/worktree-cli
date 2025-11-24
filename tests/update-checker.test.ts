import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test';
import { rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as prompts from '@/utils/prompts';
import { checkForUpdates, setCacheDir } from '@/utils/update';

describe('update-checker', () => {
	let originalFetch: typeof globalThis.fetch;
	let testCacheDir: string;
	let mockLog: ReturnType<typeof mock>;

	beforeEach(() => {
		originalFetch = globalThis.fetch;
		testCacheDir = join(tmpdir(), `worktree-cli-test-${Date.now()}-${Math.random()}`);
		setCacheDir(testCacheDir);
		mockLog = mock(() => {});
		spyOn(prompts.log, 'info').mockImplementation(mockLog);
	});

	afterEach(async () => {
		globalThis.fetch = originalFetch;
		try {
			await rm(testCacheDir, { recursive: true, force: true });
		} catch {}
	});

	test('displays update message when newer version available', async () => {
		globalThis.fetch = mock(() =>
			Promise.resolve(
				new Response(JSON.stringify({ version: '2.0.0' }), {
					status: 200,
					headers: { 'Content-Type': 'application/json' },
				})
			)
		);

		await checkForUpdates({ name: 'test-pkg', version: '1.0.0' }, 0);

		expect(mockLog).toHaveBeenCalledWith(
			expect.stringContaining('Update available: 1.0.0 → 2.0.0')
		);
	});

	test('does not display message when same version', async () => {
		globalThis.fetch = mock(() =>
			Promise.resolve(
				new Response(JSON.stringify({ version: '1.0.0' }), {
					status: 200,
					headers: { 'Content-Type': 'application/json' },
				})
			)
		);

		await checkForUpdates({ name: 'test-pkg', version: '1.0.0' }, 0);

		expect(mockLog).not.toHaveBeenCalled();
	});

	test('does not display message when current version is newer', async () => {
		globalThis.fetch = mock(() =>
			Promise.resolve(
				new Response(JSON.stringify({ version: '1.0.0' }), {
					status: 200,
					headers: { 'Content-Type': 'application/json' },
				})
			)
		);

		await checkForUpdates({ name: 'test-pkg', version: '2.0.0' }, 0);

		expect(mockLog).not.toHaveBeenCalled();
	});

	test('handles fetch failure gracefully', async () => {
		globalThis.fetch = mock(() => Promise.reject(new Error('Network error')));

		await expect(
			checkForUpdates({ name: 'test-pkg', version: '1.0.0' }, 0)
		).resolves.toBeUndefined();
		expect(mockLog).not.toHaveBeenCalled();
	});

	test('handles non-200 response gracefully', async () => {
		globalThis.fetch = mock(() =>
			Promise.resolve(
				new Response('Not Found', {
					status: 404,
				})
			)
		);

		await expect(
			checkForUpdates({ name: 'test-pkg', version: '1.0.0' }, 0)
		).resolves.toBeUndefined();
		expect(mockLog).not.toHaveBeenCalled();
	});

	test('compares major version correctly', async () => {
		globalThis.fetch = mock(() =>
			Promise.resolve(
				new Response(JSON.stringify({ version: '2.0.0' }), {
					status: 200,
					headers: { 'Content-Type': 'application/json' },
				})
			)
		);

		await checkForUpdates({ name: 'test-pkg', version: '1.9.9' }, 0);

		expect(mockLog).toHaveBeenCalled();
	});

	test('compares minor version correctly', async () => {
		globalThis.fetch = mock(() =>
			Promise.resolve(
				new Response(JSON.stringify({ version: '1.5.0' }), {
					status: 200,
					headers: { 'Content-Type': 'application/json' },
				})
			)
		);

		await checkForUpdates({ name: 'test-pkg', version: '1.4.9' }, 0);

		expect(mockLog).toHaveBeenCalled();
	});

	test('compares patch version correctly', async () => {
		globalThis.fetch = mock(() =>
			Promise.resolve(
				new Response(JSON.stringify({ version: '1.0.5' }), {
					status: 200,
					headers: { 'Content-Type': 'application/json' },
				})
			)
		);

		await checkForUpdates({ name: 'test-pkg', version: '1.0.4' }, 0);

		expect(mockLog).toHaveBeenCalled();
	});

	test('ignores pre-release versions', async () => {
		globalThis.fetch = mock(() =>
			Promise.resolve(
				new Response(JSON.stringify({ version: '2.0.0-beta.1' }), {
					status: 200,
					headers: { 'Content-Type': 'application/json' },
				})
			)
		);

		await checkForUpdates({ name: 'test-pkg', version: '1.0.0' }, 0);

		expect(mockLog).not.toHaveBeenCalled();
	});

	test('ignores updates when current version is pre-release', async () => {
		globalThis.fetch = mock(() =>
			Promise.resolve(
				new Response(JSON.stringify({ version: '2.0.0' }), {
					status: 200,
					headers: { 'Content-Type': 'application/json' },
				})
			)
		);

		await checkForUpdates({ name: 'test-pkg', version: '1.0.0-beta.1' }, 0);

		expect(mockLog).not.toHaveBeenCalled();
	});

	test('respects check interval from cache', async () => {
		globalThis.fetch = mock(() =>
			Promise.resolve(
				new Response(JSON.stringify({ version: '2.0.0' }), {
					status: 200,
					headers: { 'Content-Type': 'application/json' },
				})
			)
		);

		const oneHour = 60 * 60 * 1000;

		await checkForUpdates({ name: 'test-pkg', version: '1.0.0' }, oneHour);
		expect(mockLog).toHaveBeenCalledWith(expect.stringContaining('Update available'));
		mockLog.mockClear();

		await checkForUpdates({ name: 'test-pkg', version: '1.0.0' }, oneHour);
		expect(mockLog).toHaveBeenCalledWith(expect.stringContaining('Update available'));
	});

	test('handles corrupted cache file gracefully', async () => {
		const { mkdir } = await import('node:fs/promises');
		await mkdir(testCacheDir, { recursive: true });
		await writeFile(join(testCacheDir, 'update-check.json'), 'invalid json{', 'utf-8');

		globalThis.fetch = mock(() =>
			Promise.resolve(
				new Response(JSON.stringify({ version: '2.0.0' }), {
					status: 200,
					headers: { 'Content-Type': 'application/json' },
				})
			)
		);

		await checkForUpdates({ name: 'test-pkg', version: '1.0.0' }, 0);

		expect(mockLog).toHaveBeenCalledWith(expect.stringContaining('Update available'));
	});

	test('handles invalid cache structure gracefully', async () => {
		const { mkdir } = await import('node:fs/promises');
		await mkdir(testCacheDir, { recursive: true });
		await writeFile(
			join(testCacheDir, 'update-check.json'),
			JSON.stringify({ invalid: 'structure' }),
			'utf-8'
		);

		globalThis.fetch = mock(() =>
			Promise.resolve(
				new Response(JSON.stringify({ version: '2.0.0' }), {
					status: 200,
					headers: { 'Content-Type': 'application/json' },
				})
			)
		);

		await checkForUpdates({ name: 'test-pkg', version: '1.0.0' }, 0);

		expect(mockLog).toHaveBeenCalledWith(expect.stringContaining('Update available'));
	});

	test('ignores invalid version formats', async () => {
		globalThis.fetch = mock(() =>
			Promise.resolve(
				new Response(JSON.stringify({ version: '2.0.x' }), {
					status: 200,
					headers: { 'Content-Type': 'application/json' },
				})
			)
		);

		await checkForUpdates({ name: 'test-pkg', version: '1.0.0' }, 0);

		expect(mockLog).not.toHaveBeenCalled();
	});

	test('ignores current version with invalid format', async () => {
		globalThis.fetch = mock(() =>
			Promise.resolve(
				new Response(JSON.stringify({ version: '2.0.0' }), {
					status: 200,
					headers: { 'Content-Type': 'application/json' },
				})
			)
		);

		await checkForUpdates({ name: 'test-pkg', version: '1.0.x' }, 0);

		expect(mockLog).not.toHaveBeenCalled();
	});

	test('handles various pre-release patterns', async () => {
		const preReleaseVersions = [
			'2.0.0-alpha.1',
			'2.0.0-rc.2',
			'2.0.0-pre',
			'2.0.0-canary',
			'2.0.0-next.0',
			'2.0.0-dev',
		];

		for (const version of preReleaseVersions) {
			globalThis.fetch = mock(() =>
				Promise.resolve(
					new Response(JSON.stringify({ version }), {
						status: 200,
						headers: { 'Content-Type': 'application/json' },
					})
				)
			);

			mockLog.mockClear();
			await checkForUpdates({ name: 'test-pkg', version: '1.0.0' }, 0);

			expect(mockLog).not.toHaveBeenCalled();
		}
	});
});
