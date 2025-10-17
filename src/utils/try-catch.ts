/**
 * Type-safe error handling utility inspired by Go and Rust patterns.
 */

export type Result<T, E = Error> = { error: null; data: T } | { error: E; data: null };

function isPromise(value: unknown): value is Promise<unknown> {
	return value != null && typeof (value as { then?: unknown }).then === 'function';
}

export function tryCatch<T, E = Error>(
	promiseOrFn: Promise<T> | (() => Promise<T>)
): Promise<Result<T, E>>;

export function tryCatch<T, E = Error>(fn: () => T): Result<T, E>;

export function tryCatch<T, E = Error>(
	promiseOrFn: Promise<T> | (() => T | Promise<T>)
): Result<T, E> | Promise<Result<T, E>> {
	const input = typeof promiseOrFn === 'function' ? promiseOrFn() : promiseOrFn;

	if (isPromise(input)) {
		return input
			.then((data) => ({ error: null, data }) as const)
			.catch((error) => ({ error: error as E, data: null }) as const);
	}

	try {
		return { error: null, data: input };
	} catch (error) {
		return { error: error as E, data: null };
	}
}
