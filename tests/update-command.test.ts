import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'bun';
import * as updateModule from '@/commands/update';
import { getVersionInfo, updateCommand } from '@/commands/update';
import * as prompts from '@/utils/prompts';
import { setCacheDir } from '@/utils/update-checker';

const CLI_PATH = join(import.meta.dir, '../src/index.ts');

describe('update command', () => {
	let originalFetch: typeof globalThis.fetch;
	let testCacheDir: string;
	let mockLog: ReturnType<typeof mock>;
	let mockSpinner: ReturnType<typeof mock>;

	beforeEach(() => {
		originalFetch = globalThis.fetch;
		testCacheDir = join(tmpdir(), `worktree-cli-test-${Date.now()}-${Math.random()}`);
		setCacheDir(testCacheDir);
		mockLog = mock(() => {});
		mockSpinner = mock(() => ({
			start: mock(() => {}),
			stop: mock(() => {}),
		}));

		spyOn(prompts.log, 'info').mockImplementation(mockLog);
		spyOn(prompts.log, 'warn').mockImplementation(mockLog);
		spyOn(prompts.log, 'success').mockImplementation(mockLog);
		spyOn(prompts, 'intro').mockImplementation(mock(() => {}));
		spyOn(prompts, 'outro').mockImplementation(mock(() => {}));
		spyOn(prompts, 'spinner').mockImplementation(mockSpinner);
	});

	afterEach(async () => {
		globalThis.fetch = originalFetch;
		try {
			await rm(testCacheDir, { recursive: true, force: true });
		} catch {}
	});

	describe('getVersionInfo', () => {
		test('returns update available when newer version exists', async () => {
			globalThis.fetch = mock(() =>
				Promise.resolve(
					new Response(JSON.stringify({ version: '2.0.0' }), {
						status: 200,
						headers: { 'Content-Type': 'application/json' },
					})
				)
			);

			const info = await getVersionInfo({ name: 'test-pkg', version: '1.0.0' });

			expect(info.current).toBe('1.0.0');
			expect(info.latest).toBe('2.0.0');
			expect(info.updateAvailable).toBe(true);
		});

		test('returns no update when on latest version', async () => {
			globalThis.fetch = mock(() =>
				Promise.resolve(
					new Response(JSON.stringify({ version: '1.0.0' }), {
						status: 200,
						headers: { 'Content-Type': 'application/json' },
					})
				)
			);

			const info = await getVersionInfo({ name: 'test-pkg', version: '1.0.0' });

			expect(info.current).toBe('1.0.0');
			expect(info.latest).toBe('1.0.0');
			expect(info.updateAvailable).toBe(false);
		});

		test('handles fetch failure gracefully', async () => {
			globalThis.fetch = mock(() => Promise.reject(new Error('Network error')));

			const info = await getVersionInfo({ name: 'test-pkg', version: '1.0.0' });

			expect(info.current).toBe('1.0.0');
			expect(info.latest).toBeNull();
			expect(info.updateAvailable).toBe(false);
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

			const info = await getVersionInfo({ name: 'test-pkg', version: '1.0.0' });

			expect(info.updateAvailable).toBe(false);
		});
	});

	describe('updateCommand', () => {
		test('returns 0 when already up to date', async () => {
			globalThis.fetch = mock(() =>
				Promise.resolve(
					new Response(JSON.stringify({ version: '1.0.0' }), {
						status: 200,
						headers: { 'Content-Type': 'application/json' },
					})
				)
			);
			spyOn(updateModule, 'getInstalledVersion').mockResolvedValue(null);

			const result = await updateCommand({ name: 'test-pkg', version: '1.0.0' });

			expect(result).toBe(0);
		});

		test('returns 1 when cannot fetch latest version', async () => {
			globalThis.fetch = mock(() => Promise.reject(new Error('Network error')));
			spyOn(updateModule, 'getInstalledVersion').mockResolvedValue(null);

			const result = await updateCommand({ name: 'test-pkg', version: '1.0.0' });

			expect(result).toBe(1);
		});
	});

	describe('CLI integration', () => {
		test('--version flag exits with code 0', async () => {
			const proc = spawn(['bun', CLI_PATH, '--version']);
			await proc.exited;
			expect(proc.exitCode).toBe(0);
		});

		test('-v flag exits with code 0', async () => {
			const proc = spawn(['bun', CLI_PATH, '-v']);
			await proc.exited;
			expect(proc.exitCode).toBe(0);
		});

		test('update command is listed in help', async () => {
			const proc = spawn(['bun', CLI_PATH, '--help']);
			const output = await new Response(proc.stdout).text();
			await proc.exited;

			expect(output).toContain('update');
			expect(output).toContain('Update CLI to the latest version');
		});

		test('update command shows help when --help flag used', async () => {
			const proc = spawn(['bun', CLI_PATH, 'update', '--help']);
			const output = await new Response(proc.stdout).text();
			await proc.exited;

			expect(proc.exitCode).toBe(0);
			expect(output).toContain('Update CLI to the latest version');
		});
	});
});

describe('update-checker exports', () => {
	test('fetchLatestVersion is exported', async () => {
		const { fetchLatestVersion } = await import('@/utils/update-checker');
		expect(typeof fetchLatestVersion).toBe('function');
	});

	test('isNewerVersion is exported', async () => {
		const { isNewerVersion } = await import('@/utils/update-checker');
		expect(typeof isNewerVersion).toBe('function');
	});

	test('isNewerVersion correctly compares versions', async () => {
		const { isNewerVersion } = await import('@/utils/update-checker');

		expect(isNewerVersion('1.0.0', '2.0.0')).toBe(true);
		expect(isNewerVersion('1.0.0', '1.1.0')).toBe(true);
		expect(isNewerVersion('1.0.0', '1.0.1')).toBe(true);
		expect(isNewerVersion('1.0.0', '1.0.0')).toBe(false);
		expect(isNewerVersion('2.0.0', '1.0.0')).toBe(false);
		expect(isNewerVersion('1.0.0', '1.0.0-beta')).toBe(false);
	});
});
