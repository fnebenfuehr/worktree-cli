import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('update-checker', () => {
	let originalFetch: typeof globalThis.fetch;
	let testCacheDir: string;
	let mockLog: ReturnType<typeof mock>;

	beforeEach(() => {
		originalFetch = globalThis.fetch;
		testCacheDir = join(tmpdir(), `worktree-cli-test-${Date.now()}`);
		mockLog = mock(() => {});
	});

	afterEach(async () => {
		globalThis.fetch = originalFetch;
		try {
			await rm(testCacheDir, { recursive: true, force: true });
		} catch {}
	});

	async function setupTest() {
		const mod = await import('@/utils/update-checker');
		const logMod = await import('@/utils/prompts');
		spyOn(logMod.log, 'info').mockImplementation(mockLog);
		return mod;
	}

	test('displays update message when newer version available', async () => {
		globalThis.fetch = mock(() =>
			Promise.resolve(
				new Response(JSON.stringify({ version: '2.0.0' }), {
					status: 200,
					headers: { 'Content-Type': 'application/json' },
				})
			)
		);

		const { checkForUpdates } = await setupTest();
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

		const { checkForUpdates } = await setupTest();
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

		const { checkForUpdates } = await setupTest();
		await checkForUpdates({ name: 'test-pkg', version: '2.0.0' }, 0);

		expect(mockLog).not.toHaveBeenCalled();
	});

	test('handles fetch failure gracefully', async () => {
		globalThis.fetch = mock(() => Promise.reject(new Error('Network error')));

		const { checkForUpdates } = await setupTest();
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

		const { checkForUpdates } = await setupTest();
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

		const { checkForUpdates } = await setupTest();
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

		const { checkForUpdates } = await setupTest();
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

		const { checkForUpdates } = await setupTest();
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

		const { checkForUpdates } = await setupTest();
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

		const { checkForUpdates } = await setupTest();
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

		const { checkForUpdates } = await setupTest();
		const oneHour = 60 * 60 * 1000;

		await checkForUpdates({ name: 'test-pkg', version: '1.0.0' }, oneHour);
		expect(mockLog).toHaveBeenCalledWith(expect.stringContaining('Update available'));
		mockLog.mockClear();

		await checkForUpdates({ name: 'test-pkg', version: '1.0.0' }, oneHour);
		expect(mockLog).toHaveBeenCalledWith(expect.stringContaining('Update available'));
	});
});
