/**
 * Model fallback for retryable errors
 */

export interface FallbackAttempt {
	model: string | undefined;
	failed: boolean;
	retryable: boolean;
}

export interface FallbackResult {
	exitCode: number;
	stderr: string;
	errorMessage?: string;
	stopReason?: string;
	modelAttempts?: FallbackAttempt[];
}

/**
 * Run with model fallback: try primary, then fallback models on retryable errors.
 * @param runFn - Function that runs the agent with a given model override (undefined = use default)
 * @param fallbackModels - Ordered list of fallback models to try
 * @returns The result from whichever model succeeded (or the original error if all failed)
 */
export async function withModelFallback<T extends FallbackResult>(
	runFn: (modelOverride?: string) => Promise<T>,
	fallbackModels: string[] | undefined,
): Promise<T> {
	const attempts: FallbackAttempt[] = [];
	const result = await runFn(undefined);

	const primaryFailed = result.exitCode !== 0 || result.stopReason === "error";
	const primaryRetryable = primaryFailed && isRetryableError(result.stderr, result.errorMessage, result.stopReason);
	attempts.push({ model: undefined, failed: primaryFailed, retryable: primaryRetryable });

	if (!primaryFailed || !primaryRetryable || !fallbackModels?.length) {
		result.modelAttempts = attempts;
		return result;
	}

	// Try each fallback model in order
	for (const fallbackModel of fallbackModels) {
		const fallbackResult = await runFn(fallbackModel);

		const fbFailed = fallbackResult.exitCode !== 0 || fallbackResult.stopReason === "error";
		const fbRetryable = fbFailed && isRetryableError(fallbackResult.stderr, fallbackResult.errorMessage, fallbackResult.stopReason);
		attempts.push({ model: fallbackModel, failed: fbFailed, retryable: fbRetryable });

		if (!fbFailed) {
			fallbackResult.modelAttempts = attempts;
			return fallbackResult;
		}

		if (!fbRetryable) {
			fallbackResult.modelAttempts = attempts;
			return fallbackResult;
		}
	}

	// All fallbacks exhausted — return the original error
	result.modelAttempts = attempts;
	return result;
}

/**
 * Check if an error result indicates a retryable failure
 */
export function isRetryableError(stderr: string, errorMessage?: string, stopReason?: string): boolean {
	const retryablePatterns = [
		/rate.?limit/i,
		/too.?many.?requests/i,
		/overloaded/i,
		/capacity/i,
		/503/,
		/429/,
		/quota/i,
		/temporarily.?unavailable/i,
		/ECONNRESET/,
		/ETIMEDOUT/,
		/ECONNREFUSED/,
		/socket hang up/i,
		/network.?error/i,
		/fetch.?failed/i,
		/unauthorized.*retry/i,
		/401.*temporarily/i,
		/auth.*token.*expired/i,
	];

	const errorText = [stderr, errorMessage, stopReason].filter(Boolean).join(" ");
	return retryablePatterns.some((pattern) => pattern.test(errorText));
}
