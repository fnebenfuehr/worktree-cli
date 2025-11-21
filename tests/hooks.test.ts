import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildWorktreeEnv, executeCommand, executeHooks, getShellConfig } from '@/lib/hooks';
import type { WorktreeConfig, WorktreeEnv } from '@/lib/types';

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

describe('buildWorktreeEnv', () => {
	test('builds correct environment variables', () => {
		const context: WorktreeEnv = {
			worktreePath: '/path/to/worktree',
			branch: 'feature/test',
			mainPath: '/path/to/main',
		};

		const env = buildWorktreeEnv(context);

		expect(env.WORKTREE_PATH).toBe('/path/to/worktree');
		expect(env.WORKTREE_BRANCH).toBe('feature/test');
		expect(env.WORKTREE_MAIN_PATH).toBe('/path/to/main');
		expect(env.WORKTREE_PROJECT).toBe('main');
	});

	test('extracts project name from main path', () => {
		const context: WorktreeEnv = {
			worktreePath: '/home/user/repos/my-project/.worktrees/feature',
			branch: 'feature/awesome',
			mainPath: '/home/user/repos/my-project',
		};

		const env = buildWorktreeEnv(context);

		expect(env.WORKTREE_PROJECT).toBe('my-project');
	});
});

describe('environment variables in hooks', () => {
	let testDir: string;

	beforeEach(async () => {
		testDir = await mkdtemp(join(tmpdir(), 'worktree-env-test-'));
	});

	afterEach(async () => {
		await rm(testDir, { recursive: true, force: true });
	});

	test('executeCommand passes environment variables', async () => {
		const outputFile = join(testDir, 'env-output.txt');
		const env = {
			WORKTREE_PATH: '/test/path',
			WORKTREE_BRANCH: 'test-branch',
		};

		await executeCommand(`echo "$WORKTREE_PATH|$WORKTREE_BRANCH" > ${outputFile}`, testDir, env);

		const output = await Bun.file(outputFile).text();
		expect(output.trim()).toBe('/test/path|test-branch');
	});

	test('executeHooks passes worktree env context', async () => {
		const outputFile = join(testDir, 'hook-env.txt');
		const config: WorktreeConfig = {
			post_create: [
				`echo "$WORKTREE_PATH|$WORKTREE_BRANCH|$WORKTREE_MAIN_PATH|$WORKTREE_PROJECT" > ${outputFile}`,
			],
		};

		const env: WorktreeEnv = {
			worktreePath: '/my/worktree',
			branch: 'feat/env-test',
			mainPath: '/my/main-repo',
		};

		await executeHooks(config, 'post_create', {
			cwd: testDir,
			env: env,
		});

		const output = await Bun.file(outputFile).text();
		expect(output.trim()).toBe('/my/worktree|feat/env-test|/my/main-repo|main-repo');
	});

	test('hooks can access all four environment variables', async () => {
		const outputFile = join(testDir, 'all-env.txt');
		const config: WorktreeConfig = {
			post_create: [
				`test -n "$WORKTREE_PATH" && test -n "$WORKTREE_BRANCH" && test -n "$WORKTREE_MAIN_PATH" && test -n "$WORKTREE_PROJECT" && echo "all-present" > ${outputFile}`,
			],
		};

		const env: WorktreeEnv = {
			worktreePath: '/path/wt',
			branch: 'branch',
			mainPath: '/path/main',
		};

		await executeHooks(config, 'post_create', {
			cwd: testDir,
			env: env,
		});

		const output = await Bun.file(outputFile).text();
		expect(output.trim()).toBe('all-present');
	});

	test('preserves existing shell environment', async () => {
		const outputFile = join(testDir, 'preserve-env.txt');
		const config: WorktreeConfig = {
			post_create: [`echo "$HOME" > ${outputFile}`],
		};

		const env: WorktreeEnv = {
			worktreePath: '/test',
			branch: 'test',
			mainPath: '/main',
		};

		await executeHooks(config, 'post_create', {
			cwd: testDir,
			env: env,
		});

		const output = await Bun.file(outputFile).text();
		expect(output.trim()).toBe(process.env.HOME);
	});
});
