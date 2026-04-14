/**
 * Model fallback for retryable errors
 */

export interface FallbackResult {
	exitCode: number;
	stderr: string;
	errorMessage?: string;
	stopReason?: string;
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
	const result = await runFn(undefined);

	// Success — no fallback needed
	if (result.exitCode === 0 && result.stopReason !== "error") return result;

	// Non-retryable error — fallback won't help
	if (!isRetryableError(result.stderr, result.errorMessage, result.stopReason)) return result;

	// No fallback models configured
	if (!fallbackModels || fallbackModels.length === 0) return result;

	// Try each fallback model in order
	for (const fallbackModel of fallbackModels) {
		const fallbackResult = await runFn(fallbackModel);

		if (fallbackResult.exitCode === 0 && fallbackResult.stopReason !== "error") {
			return fallbackResult;
		}

		if (!isRetryableError(fallbackResult.stderr, fallbackResult.errorMessage, fallbackResult.stopReason)) {
			return fallbackResult;
		}
	}

	// All fallbacks exhausted — return the original error
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
	];

	const errorText = [stderr, errorMessage, stopReason].filter(Boolean).join(" ");
	return retryablePatterns.some((pattern) => pattern.test(errorText));
}
