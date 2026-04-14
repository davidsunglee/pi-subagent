/**
 * Recursion depth guard for subagent nesting
 *
 * The depth guard checks the PARENT's limits (from env vars), not the child
 * agent's frontmatter config. An agent's `maxSubagentDepth` controls how deep
 * IT can dispatch, not whether it can be launched.
 */

const DEFAULT_MAX_DEPTH = 2;

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
 * Get the parent's max depth from env, with a finite default.
 */
export function getParentMaxDepth(): number {
	const raw = process.env.PI_SUBAGENT_MAX_DEPTH;
	if (raw === undefined) return DEFAULT_MAX_DEPTH;
	const parsed = parseInt(raw, 10);
	return Number.isFinite(parsed) ? parsed : DEFAULT_MAX_DEPTH;
}

/**
 * Check if the current process is allowed to spawn a subagent.
 * This checks the PARENT's limits, not the child agent's.
 */
export function checkDepth(agentName: string): DepthCheckResult {
	const currentDepth = getCurrentDepth();
	const maxDepth = getParentMaxDepth();

	if (currentDepth >= maxDepth) {
		return {
			allowed: false,
			currentDepth,
			effectiveMaxDepth: maxDepth,
			errorMessage: `Subagent depth limit reached (current depth: ${currentDepth}, max: ${maxDepth}). Agent "${agentName}" cannot be spawned at this depth.`,
		};
	}

	return { allowed: true, currentDepth, effectiveMaxDepth: maxDepth };
}

/**
 * Build env vars for a child subagent process.
 * The child's maxSubagentDepth controls how deep IT can go (relative to its own depth).
 * Convert to absolute: childDepth + agentMaxSubagentDepth.
 * Clamp: never relax the parent's limit.
 */
export function buildChildEnv(
	currentDepth: number,
	parentMaxDepth: number,
	agentMaxSubagentDepth: number | undefined,
): Record<string, string> {
	const childDepth = currentDepth + 1;
	// Convert agent's relative limit to absolute
	const childAbsoluteLimit = agentMaxSubagentDepth !== undefined
		? childDepth + agentMaxSubagentDepth
		: parentMaxDepth; // inherit parent's limit if unspecified
	// Cannot relax parent's limit
	const childMaxDepth = Math.min(childAbsoluteLimit, parentMaxDepth);

	return {
		PI_SUBAGENT_DEPTH: String(childDepth),
		PI_SUBAGENT_MAX_DEPTH: String(childMaxDepth),
	};
}
