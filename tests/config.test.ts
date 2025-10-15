import { describe, expect, test } from 'bun:test';
import { validateConfig, type WorktreeConfig } from '@/config/loader';

describe('config validation', () => {
	describe('validateConfig', () => {
		test('validates empty config', () => {
			expect(validateConfig({})).toBe(true);
		});

		test('validates config with valid hooks', () => {
			const config: WorktreeConfig = {
				post_create: ['npm install', 'npm run build'],
				pre_remove: ['npm run clean'],
				post_remove: ['cleanup'],
			};
			expect(validateConfig(config)).toBe(true);
		});

		test('validates config with valid copy_files', () => {
			const config: WorktreeConfig = {
				copy_files: ['.env.example', '.vscode/settings.json'],
			};
			expect(validateConfig(config)).toBe(true);
		});

		test('accepts empty arrays', () => {
			const config: WorktreeConfig = {
				post_create: [],
				copy_files: [],
			};
			expect(validateConfig(config)).toBe(true);
		});

		test('rejects non-array values', () => {
			const config = { post_create: 'npm install' } as any;
			expect(validateConfig(config)).toBe(false);
		});

		test('rejects non-string array elements', () => {
			const config = { post_create: ['npm install', 123] } as any;
			expect(validateConfig(config)).toBe(false);
		});

		test('rejects empty strings in array', () => {
			const config: WorktreeConfig = {
				post_create: ['npm install', '', 'npm test'],
			};
			expect(validateConfig(config)).toBe(false);
		});

		test('rejects whitespace-only strings', () => {
			const config: WorktreeConfig = {
				post_create: ['   '],
			};
			expect(validateConfig(config)).toBe(false);
		});

		test('accepts commands with special characters', () => {
			const config: WorktreeConfig = {
				post_create: ['echo "Hello" && npm install'],
			};
			expect(validateConfig(config)).toBe(true);
		});
	});
});
