import { describe, expect, test } from 'bun:test';
import { tryCatch } from '@/utils/try-catch';

describe('tryCatch utility', () => {
	describe('synchronous functions', () => {
		test('handles successful sync function', () => {
			const result = tryCatch(() => 42);

			expect(result.error).toBeNull();
			expect(result.data).toBe(42);
		});

		test('handles sync function that throws Error', () => {
			const result = tryCatch(() => {
				throw new Error('sync error');
			});

			expect(result.data).toBeNull();
			expect(result.error).toBeInstanceOf(Error);
			expect(result.error?.message).toBe('sync error');
		});

		test('handles sync function that throws string', () => {
			const result = tryCatch(() => {
				throw 'string error';
			});

			expect(result.data).toBeNull();
			expect(result.error).toBeInstanceOf(Error);
			expect(result.error?.message).toBe('string error');
		});

		test('handles sync function that throws number', () => {
			const result = tryCatch(() => {
				throw 42;
			});

			expect(result.data).toBeNull();
			expect(result.error).toBeInstanceOf(Error);
			expect(result.error?.message).toBe('42');
		});

		test('handles sync function that throws undefined', () => {
			const result = tryCatch(() => {
				throw undefined;
			});

			expect(result.data).toBeNull();
			expect(result.error).toBeInstanceOf(Error);
			expect(result.error?.message).toBe('undefined');
		});

		test('preserves stack trace when Error thrown', () => {
			const result = tryCatch(() => {
				throw new Error('test error');
			});

			expect(result.error?.stack).toBeDefined();
			expect(result.error?.stack).toContain('test error');
		});
	});

	describe('async functions', () => {
		test('handles successful async function', async () => {
			const result = await tryCatch(async () => 42);

			expect(result.error).toBeNull();
			expect(result.data).toBe(42);
		});

		test('handles async function that rejects with Error', async () => {
			const result = await tryCatch(async () => {
				throw new Error('async error');
			});

			expect(result.data).toBeNull();
			expect(result.error).toBeInstanceOf(Error);
			expect(result.error?.message).toBe('async error');
		});

		test('handles async function that rejects with string', async () => {
			const result = await tryCatch(async () => {
				throw 'async string error';
			});

			expect(result.data).toBeNull();
			expect(result.error).toBeInstanceOf(Error);
			expect(result.error?.message).toBe('async string error');
		});

		test('handles rejected Promise', async () => {
			const result = await tryCatch(Promise.reject(new Error('rejected promise')));

			expect(result.data).toBeNull();
			expect(result.error).toBeInstanceOf(Error);
			expect(result.error?.message).toBe('rejected promise');
		});

		test('handles resolved Promise', async () => {
			const result = await tryCatch(Promise.resolve(123));

			expect(result.error).toBeNull();
			expect(result.data).toBe(123);
		});

		test('handles async function returning Promise', async () => {
			const result = await tryCatch(() => Promise.resolve('success'));

			expect(result.error).toBeNull();
			expect(result.data).toBe('success');
		});

		test('preserves stack trace for async errors', async () => {
			const result = await tryCatch(async () => {
				throw new Error('async test error');
			});

			expect(result.error?.stack).toBeDefined();
			expect(result.error?.stack).toContain('async test error');
		});
	});

	describe('type narrowing', () => {
		test('discriminated union allows type-safe access', async () => {
			const result = await tryCatch(async () => 42);

			if (result.error) {
				// This branch should not execute
				expect.unreachable('Should not reach error branch');
			} else {
				// TypeScript knows result.data is number here
				expect(result.data).toBe(42);
			}
		});

		test('error branch has null data', () => {
			const result = tryCatch(() => {
				throw new Error('test');
			});

			if (result.error) {
				expect(result.data).toBeNull();
			} else {
				expect.unreachable('Should not reach success branch');
			}
		});

		test('success branch has null error', () => {
			const result = tryCatch(() => 'success');

			if (result.data) {
				expect(result.error).toBeNull();
			} else {
				expect.unreachable('Should not reach error branch');
			}
		});
	});

	describe('edge cases', () => {
		test('handles function that returns undefined', () => {
			const result = tryCatch(() => undefined);

			expect(result.error).toBeNull();
			expect(result.data).toBeUndefined();
		});

		test('handles function that returns null', () => {
			const result = tryCatch(() => null);

			expect(result.error).toBeNull();
			expect(result.data).toBeNull();
		});

		test('handles async function that returns undefined', async () => {
			const result = await tryCatch(async () => undefined);

			expect(result.error).toBeNull();
			expect(result.data).toBeUndefined();
		});

		test('handles function that returns object', () => {
			const obj = { key: 'value' };
			const result = tryCatch(() => obj);

			expect(result.error).toBeNull();
			expect(result.data).toBe(obj);
		});

		test('handles function that returns array', () => {
			const arr = [1, 2, 3];
			const result = tryCatch(() => arr);

			expect(result.error).toBeNull();
			expect(result.data).toEqual(arr);
		});

		test('handles thenable-like object that is not a Promise', () => {
			// This should not be treated as a Promise
			// biome-ignore lint/suspicious/noThenProperty: Testing edge case with thenable-like objects
			const thenable = { then: 123 };
			const result = tryCatch(() => thenable);

			expect(result.error).toBeNull();
			expect(result.data).toEqual(thenable);
		});
	});
});
