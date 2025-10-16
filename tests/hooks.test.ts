import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { WorktreeConfig } from '@/config/loader';
import { executeCommand, executeHooks, getShellConfig } from '@/hooks/executor';

describe('getShellConfig', () => {
	test('returns sh -c for Unix platforms', () => {
		const config = getShellConfig('darwin');
		expect(config.shell).toBe('sh');
		expect(config.flag).toBe('-c');
	});

	test('returns sh -c for Linux', () => {
		const config = getShellConfig('linux');
		expect(config.shell).toBe('sh');
		expect(config.flag).toBe('-c');
	});

	test('returns cmd /c for Windows', () => {
		const config = getShellConfig('win32');
		expect(config.shell).toBe('cmd');
		expect(config.flag).toBe('/c');
	});

	test('uses process.platform by default', () => {
		const config = getShellConfig();
		expect(config.shell).toBeTruthy();
		expect(config.flag).toBeTruthy();
	});
});

describe('executeCommand', () => {
	test('executes command and returns result', async () => {
		const result = await executeCommand('echo test', process.cwd());
		expect(result.exitCode).toBe(0);
		expect(result.stdout.toString()).toContain('test');
	});

	test('returns non-zero exit code for failed commands', async () => {
		const result = await executeCommand('false', process.cwd());
		expect(result.exitCode).toBe(1);
	});
});

describe('hook execution', () => {
	let testDir: string;

	beforeEach(async () => {
		testDir = await mkdtemp(join(tmpdir(), 'worktree-hook-test-'));
	});

	afterEach(async () => {
		await rm(testDir, { recursive: true, force: true });
	});

	test('executes simple command', async () => {
		const outputFile = join(testDir, 'output.txt');
		const config: WorktreeConfig = {
			post_create: [`echo "test" > ${outputFile}`],
		};

		await executeHooks(config, 'post_create', { cwd: testDir });

		const output = await Bun.file(outputFile).text();
		expect(output.trim()).toBe('test');
	});

	test('executes command with single quotes', async () => {
		const outputFile = join(testDir, 'output.txt');
		const config: WorktreeConfig = {
			post_create: [`echo 'hello world' > ${outputFile}`],
		};

		await executeHooks(config, 'post_create', { cwd: testDir });

		const output = await Bun.file(outputFile).text();
		expect(output.trim()).toBe('hello world');
	});

	test('executes command with double quotes', async () => {
		const outputFile = join(testDir, 'output.txt');
		const config: WorktreeConfig = {
			post_create: [`echo "double quotes" > ${outputFile}`],
		};

		await executeHooks(config, 'post_create', { cwd: testDir });

		const output = await Bun.file(outputFile).text();
		expect(output.trim()).toBe('double quotes');
	});

	test('executes chained commands', async () => {
		const outputFile = join(testDir, 'output.txt');
		const config: WorktreeConfig = {
			post_create: [`echo "first" > ${outputFile} && echo "second" >> ${outputFile}`],
		};

		await executeHooks(config, 'post_create', { cwd: testDir });

		const output = await Bun.file(outputFile).text();
		expect(output.trim()).toBe('first\nsecond');
	});

	test('executes multiple hooks sequentially', async () => {
		const file1 = join(testDir, 'file1.txt');
		const file2 = join(testDir, 'file2.txt');
		const config: WorktreeConfig = {
			post_create: [`echo "hook1" > ${file1}`, `echo "hook2" > ${file2}`],
		};

		await executeHooks(config, 'post_create', { cwd: testDir });

		expect(await Bun.file(file1).text()).toContain('hook1');
		expect(await Bun.file(file2).text()).toContain('hook2');
	});

	test('skips hooks when skipHooks is true', async () => {
		const outputFile = join(testDir, 'output.txt');
		const config: WorktreeConfig = {
			post_create: [`echo "should not run" > ${outputFile}`],
		};

		await executeHooks(config, 'post_create', { cwd: testDir, skipHooks: true });

		const exists = await Bun.file(outputFile).exists();
		expect(exists).toBe(false);
	});

	test('continues after failed hook', async () => {
		const outputFile = join(testDir, 'output.txt');
		const config: WorktreeConfig = {
			post_create: [
				'false', // exits with 1
				`echo "continued" > ${outputFile}`,
			],
		};

		await executeHooks(config, 'post_create', { cwd: testDir });

		const output = await Bun.file(outputFile).text();
		expect(output.trim()).toBe('continued');
	});

	test('executes pre_remove hooks', async () => {
		const outputFile = join(testDir, 'pre-remove.txt');
		const config: WorktreeConfig = {
			pre_remove: [`echo "pre-remove executed" > ${outputFile}`],
		};

		await executeHooks(config, 'pre_remove', { cwd: testDir });

		const output = await Bun.file(outputFile).text();
		expect(output.trim()).toBe('pre-remove executed');
	});

	test('executes post_remove hooks', async () => {
		const outputFile = join(testDir, 'post-remove.txt');
		const config: WorktreeConfig = {
			post_remove: [`echo "post-remove executed" > ${outputFile}`],
		};

		await executeHooks(config, 'post_remove', { cwd: testDir });

		const output = await Bun.file(outputFile).text();
		expect(output.trim()).toBe('post-remove executed');
	});

	test('outputs stdout when verbose is true', async () => {
		const config: WorktreeConfig = {
			post_create: ['echo "verbose output"'],
		};

		const originalLog = console.log;
		let loggedOutput = '';
		console.log = (msg: string) => {
			loggedOutput += msg;
		};

		await executeHooks(config, 'post_create', { cwd: testDir, verbose: true });

		console.log = originalLog;
		expect(loggedOutput).toContain('verbose output');
	});

	test('outputs stderr when verbose is true and command fails', async () => {
		const config: WorktreeConfig = {
			post_create: ['sh -c "echo error >&2; exit 1"'],
		};

		const originalError = console.error;
		let errorOutput = '';
		console.error = (msg: string) => {
			errorOutput += msg.toString();
		};

		await executeHooks(config, 'post_create', { cwd: testDir, verbose: true });

		console.error = originalError;
		expect(errorOutput).toContain('error');
	});

	test('does not output when verbose is false', async () => {
		const config: WorktreeConfig = {
			post_create: ['echo "should not see this"'],
		};

		const originalLog = console.log;
		let loggedOutput = '';
		console.log = (msg: string) => {
			loggedOutput += msg;
		};

		await executeHooks(config, 'post_create', { cwd: testDir, verbose: false });

		console.log = originalLog;
		expect(loggedOutput).toBe('');
	});
});
