/**
 * Recursion depth guard for subagent nesting
 */

export interface DepthCheckResult {
	allowed: boolean;
	currentDepth: number;
	effectiveMaxDepth: number;
	errorMessage?: string;
}

/**
 * Parse the current subagent depth from environment
 */
export function getCurrentDepth(): number {
	return parseInt(process.env.PI_SUBAGENT_DEPTH || "0", 10);
}

/**
 * Compute the effective max depth: agent limit cannot relax parent limit
 */
export function getEffectiveMaxDepth(agentMaxDepth: number | undefined, parentMaxDepth?: number): number {
	const agentLimit = agentMaxDepth ?? Infinity;
	const parentLimit = parentMaxDepth ?? Infinity;
	return Math.min(agentLimit, parentLimit);
}

/**
 * Check whether a subagent dispatch is allowed at the current depth
 */
export function checkDepth(agentName: string, agentMaxDepth: number | undefined): DepthCheckResult {
	const currentDepth = getCurrentDepth();
	const parentMaxDepth = process.env.PI_SUBAGENT_MAX_DEPTH
		? parseInt(process.env.PI_SUBAGENT_MAX_DEPTH, 10)
		: undefined;
	const effectiveMaxDepth = getEffectiveMaxDepth(agentMaxDepth, parentMaxDepth);

	if (currentDepth >= effectiveMaxDepth) {
		return {
			allowed: false,
			currentDepth,
			effectiveMaxDepth,
			errorMessage: `Subagent depth limit reached (current depth: ${currentDepth}, max: ${effectiveMaxDepth}). Agent "${agentName}" cannot spawn subagents at this depth.`,
		};
	}

	return { allowed: true, currentDepth, effectiveMaxDepth };
}

/**
 * Build env vars for a child subagent process
 */
export function buildChildEnv(currentDepth: number, effectiveMaxDepth: number): Record<string, string> {
	return {
		PI_SUBAGENT_DEPTH: String(currentDepth + 1),
		PI_SUBAGENT_MAX_DEPTH: String(effectiveMaxDepth),
	};
}
