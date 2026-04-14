/**
 * Build CLI args for spawning a subagent process
 */

export interface AgentArgsInput {
	agentModel?: string;
	agentThinking?: string;
	agentTools?: string[];
	modelOverride?: string;
	thinkingOverride?: string;
}

export interface AgentArgsResult {
	args: string[];
	effectiveModel?: string;
	effectiveThinking?: string;
}

/**
 * Build CLI arguments for a pi subprocess.
 * Resolution order: tool call override > agent frontmatter > pi default
 */
export function buildAgentArgs(input: AgentArgsInput): AgentArgsResult {
	const args: string[] = ["--mode", "json", "-p", "--no-session"];

	const effectiveModel = input.modelOverride ?? input.agentModel;
	const effectiveThinking = input.thinkingOverride ?? input.agentThinking;

	if (effectiveModel) args.push("--model", effectiveModel);
	if (effectiveThinking) args.push("--thinking", effectiveThinking);
	if (input.agentTools && input.agentTools.length > 0) args.push("--tools", input.agentTools.join(","));

	return { args, effectiveModel, effectiveThinking };
}
