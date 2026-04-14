/**
 * Build CLI args for spawning a Claude Code subagent process
 */

import { isValidThinkingLevel } from "./agent-args.ts";

const VALID_DISPATCHES = new Set(["pi", "claude"]);
const VALID_PERMISSION_MODES = new Set(["bypassPermissions", "auto", "plan"]);

/** Map pi thinking levels to Claude Code --effort values */
const THINKING_TO_EFFORT: Record<string, string> = {
	off: "low",
	minimal: "low",
	low: "low",
	medium: "medium",
	high: "high",
	xhigh: "max",
};

/**
 * Strip provider prefix from model name.
 * "anthropic/claude-opus-4-6" → "claude-opus-4-6"
 */
export function stripProviderPrefix(model: string): string {
	const slashIdx = model.indexOf("/");
	return slashIdx >= 0 ? model.slice(slashIdx + 1) : model;
}

export function isValidDispatch(value: string): boolean {
	return VALID_DISPATCHES.has(value);
}

export function isValidPermissionMode(value: string): boolean {
	return VALID_PERMISSION_MODES.has(value);
}

export interface BuildClaudeArgsInput {
	agentModel?: string;
	agentThinking?: string;
	agentTools?: string[];
	modelOverride?: string;
	thinkingOverride?: string;
	permissionMode?: string;
	systemPrompt?: string;
}

export interface BuildClaudeArgsResult {
	args: string[];
	effectiveModel?: string;
	error?: string;
}

export interface ClaudeUsage {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
	cost: number;
	contextTokens: number;
	turns: number;
}

export interface ClaudeResult {
	exitCode: number;
	finalOutput: string;
	usage: ClaudeUsage;
	error?: string;
	model?: string;
}

/**
 * Build CLI arguments for a Claude Code subprocess.
 * Resolution order: tool call override > agent frontmatter > defaults
 */
export function buildClaudeArgs(input: BuildClaudeArgsInput): BuildClaudeArgsResult {
	const permissionMode = input.permissionMode ?? "bypassPermissions";

	const args: string[] = [
		"-p",
		"--output-format", "stream-json",
		"--verbose",
		"--no-session-persistence",
	];

	// Permission mode
	args.push("--permission-mode", permissionMode);

	// Model: override > frontmatter, strip provider prefix
	const rawModel = input.modelOverride ?? input.agentModel;
	const effectiveModel = rawModel ? stripProviderPrefix(rawModel) : undefined;

	if (effectiveModel) {
		args.push("--model", effectiveModel);
	}

	// Thinking → effort mapping
	const rawThinking = input.thinkingOverride ?? input.agentThinking;
	if (rawThinking) {
		if (!isValidThinkingLevel(rawThinking)) {
			return {
				args: [],
				effectiveModel,
				error: `Invalid thinking level: "${rawThinking}". Valid values: off, minimal, low, medium, high, xhigh`,
			};
		}
		const effort = THINKING_TO_EFFORT[rawThinking];
		args.push("--effort", effort);
	}

	// System prompt (inline text)
	if (input.systemPrompt) {
		args.push("--system-prompt", input.systemPrompt);
	}

	// agentTools is intentionally ignored — Claude Code has all tools built in

	return { args, effectiveModel };
}

/**
 * Parse an intermediate Claude Code stream-json event.
 * Returns the assistant message object for "assistant" events, undefined otherwise.
 */
export function parseClaudeStreamEvent(event: Record<string, unknown>): unknown | undefined {
	if (event.type === "assistant") {
		return event.message;
	}
	return undefined;
}

/**
 * Parse the final "result" event from Claude Code stream-json output.
 */
export function parseClaudeResult(json: Record<string, unknown>): ClaudeResult {
	const isError = json.is_error === true;
	const subtype = json.subtype as string | undefined;
	const hasError = isError || (subtype !== undefined && subtype !== "success");

	const usage = (json.usage ?? {}) as Record<string, number>;
	const input = usage.input_tokens ?? 0;
	const output = usage.output_tokens ?? 0;
	const cacheRead = usage.cache_read_input_tokens ?? 0;
	const cacheWrite = usage.cache_creation_input_tokens ?? 0;
	const cost = (json.total_cost_usd as number) ?? 0;
	const turns = (json.num_turns as number) ?? 0;

	return {
		exitCode: hasError ? 1 : 0,
		finalOutput: json.result as string,
		usage: {
			input,
			output,
			cacheRead,
			cacheWrite,
			cost,
			contextTokens: input + cacheRead + cacheWrite,
			turns,
		},
		error: hasError ? (subtype ?? "unknown_error") : undefined,
		model: json.model as string | undefined,
	};
}
