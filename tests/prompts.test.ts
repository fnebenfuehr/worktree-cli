import { describe, expect, test } from 'bun:test';
import { isInteractive } from '@/utils/prompts';

describe('prompts utils', () => {
	describe('isInteractive', () => {
		test('returns boolean based on TTY status', () => {
			// isInteractive checks process.stdout.isTTY
			// In test environment, this is typically false
			const result = isInteractive();
			expect(typeof result).toBe('boolean');
		});
	});
});
