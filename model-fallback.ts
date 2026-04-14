/**
 * Model fallback for retryable errors
 */

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
	];

	const errorText = [stderr, errorMessage, stopReason].filter(Boolean).join(" ");
	return retryablePatterns.some((pattern) => pattern.test(errorText));
}
