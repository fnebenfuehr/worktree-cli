/**
 * Type-safe error handling utility inspired by Go and Rust patterns.
 */

export type Result<T, E = Error> = { error: null; data: T } | { error: E; data: null };

function isPromise(value: unknown): value is Promise<unknown> {
	return (
		value != null &&
		typeof value === 'object' &&
		typeof (value as { then?: unknown }).then === 'function'
	);
}

/**
 * Normalizes any thrown value into an Error instance.
 * JavaScript allows throwing any value, not just Error objects.
 */
function normalizeError<E>(error: unknown): E {
	if (error instanceof Error) {
		return error as E;
	}
	// Handle non-Error throws (strings, numbers, undefined, etc.)
	return new Error(String(error)) as E;
}

export function tryCatch<T, E = Error>(
	promiseOrFn: Promise<T> | (() => Promise<T>)
): Promise<Result<T, E>>;

export function tryCatch<T, E = Error>(fn: () => T): Result<T, E>;

export function tryCatch<T, E = Error>(
	promiseOrFn: Promise<T> | (() => T | Promise<T>)
): Result<T, E> | Promise<Result<T, E>> {
	if (typeof promiseOrFn === 'function') {
		try {
			const input = promiseOrFn();

			if (isPromise(input)) {
				return input
					.then((data) => ({ error: null, data }) as const)
					.catch((error) => ({ error: normalizeError<E>(error), data: null }) as const);
			}

			return { error: null, data: input };
		} catch (error) {
			return { error: normalizeError<E>(error), data: null };
		}
	}

	// Direct promise passed
	if (isPromise(promiseOrFn)) {
		return promiseOrFn
			.then((data) => ({ error: null, data }) as const)
			.catch((error) => ({ error: normalizeError<E>(error), data: null }) as const);
	}

	// Direct value passed (should not happen based on types, but handle it)
	return { error: null, data: promiseOrFn as T };
}
