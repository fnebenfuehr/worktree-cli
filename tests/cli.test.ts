/**
 * CLI integration tests for Commander.js integration
 * Tests the CLI entry point, exit codes, and argument parsing
 */

import { describe, expect, test } from 'bun:test';
import { spawn } from 'bun';

const CLI_PATH = './src/index.ts';

describe('CLI Integration', () => {
	describe('exit codes', () => {
		test('exits 0 for --help', async () => {
			const proc = spawn(['bun', CLI_PATH, '--help'], { stdout: 'inherit' });
			await proc.exited;
			expect(proc.exitCode).toBe(0);
		});

		test('exits 0 for -h', async () => {
			const proc = spawn(['bun', CLI_PATH, '-h'], { stdout: 'inherit' });
			await proc.exited;
			expect(proc.exitCode).toBe(0);
		});

		test('exits 0 for --version', async () => {
			const proc = spawn(['bun', CLI_PATH, '--version'], { stdout: 'inherit' });
			await proc.exited;
			expect(proc.exitCode).toBe(0);
		});

		test('exits 0 for -v', async () => {
			const proc = spawn(['bun', CLI_PATH, '-v'], { stdout: 'inherit' });
			await proc.exited;
			expect(proc.exitCode).toBe(0);
		});

		test('shows help when no command provided', async () => {
			const proc = spawn(['bun', CLI_PATH], { stdout: 'inherit' });
			await proc.exited;
			// Commander shows help but exits with 1 when no command matches
			expect(proc.exitCode).toBe(1);
		});

		test('exits non-zero for unknown command', async () => {
			const proc = spawn(['bun', CLI_PATH, 'unknown-command'], { stderr: 'inherit' });
			await proc.exited;
			expect(proc.exitCode).not.toBe(0);
		});

		test('exits non-zero for clone without arguments', async () => {
			const proc = spawn(['bun', CLI_PATH, 'clone'], { stderr: 'inherit' });
			await proc.exited;
			expect(proc.exitCode).not.toBe(0);
		});

		test('exits non-zero for create without arguments', async () => {
			const proc = spawn(['bun', CLI_PATH, 'create'], { stderr: 'inherit' });
			await proc.exited;
			expect(proc.exitCode).not.toBe(0);
		});

		test('exits non-zero for remove without arguments', async () => {
			const proc = spawn(['bun', CLI_PATH, 'remove'], { stderr: 'inherit' });
			await proc.exited;
			expect(proc.exitCode).not.toBe(0);
		});
	});

	describe('verbose flag', () => {
		test('accepts --verbose flag globally', async () => {
			const proc = spawn(['bun', CLI_PATH, '--verbose', '--help'], { stdout: 'inherit' });
			await proc.exited;
			expect(proc.exitCode).toBe(0);
		});

		test('accepts --verbose flag with list command', async () => {
			const proc = spawn(['bun', CLI_PATH, 'list', '--verbose'], { stdout: 'inherit' });
			await proc.exited;
			// Exit code depends on whether we're in a git repo, but it shouldn't crash
			expect([0, 1]).toContain(proc.exitCode);
		});
	});

	describe('command parsing', () => {
		test('all defined commands are recognized', async () => {
			// These should not return "unknown command" errors
			const commands = ['clone', 'setup', 'create', 'remove', 'list'];

			for (const cmd of commands) {
				const proc = spawn(['bun', CLI_PATH, cmd, '--help'], { stdout: 'inherit' });
				await proc.exited;
				// Help for valid commands should exit 0
				expect(proc.exitCode).toBe(0);
			}
		});
	});
});
