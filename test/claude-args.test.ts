import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
	stripProviderPrefix,
	isValidDispatch,
	isValidPermissionMode,
	buildClaudeArgs,
	parseClaudeStreamEvent,
	parseClaudeResult,
} from "../claude-args.ts";

describe("claude-args", () => {
	describe("stripProviderPrefix", () => {
		it("strips anthropic/ prefix", () => {
			assert.equal(stripProviderPrefix("anthropic/claude-opus-4-6"), "claude-opus-4-6");
		});

		it("strips any provider prefix", () => {
			assert.equal(stripProviderPrefix("openai/gpt-4"), "gpt-4");
		});

		it("returns model unchanged when no prefix", () => {
			assert.equal(stripProviderPrefix("claude-sonnet-4-6"), "claude-sonnet-4-6");
		});

		it("handles multiple slashes by stripping only the first segment", () => {
			assert.equal(stripProviderPrefix("a/b/c"), "b/c");
		});

		it("handles empty string", () => {
			assert.equal(stripProviderPrefix(""), "");
		});
	});

	describe("isValidDispatch", () => {
		it("returns true for pi", () => {
			assert.equal(isValidDispatch("pi"), true);
		});

		it("returns true for claude", () => {
			assert.equal(isValidDispatch("claude"), true);
		});

		it("returns false for unknown values", () => {
			assert.equal(isValidDispatch("openai"), false);
			assert.equal(isValidDispatch(""), false);
			assert.equal(isValidDispatch("Claude"), false); // case-sensitive
		});
	});

	describe("isValidPermissionMode", () => {
		it("returns true for bypassPermissions", () => {
			assert.equal(isValidPermissionMode("bypassPermissions"), true);
		});

		it("returns true for auto", () => {
			assert.equal(isValidPermissionMode("auto"), true);
		});

		it("returns true for plan", () => {
			assert.equal(isValidPermissionMode("plan"), true);
		});

		it("returns false for unknown values", () => {
			assert.equal(isValidPermissionMode("manual"), false);
			assert.equal(isValidPermissionMode(""), false);
			assert.equal(isValidPermissionMode("Auto"), false); // case-sensitive
		});
	});

	describe("buildClaudeArgs", () => {
		it("includes base flags", () => {
			const { args } = buildClaudeArgs({});
			assert.deepEqual(args, [
				"-p",
				"--output-format", "stream-json",
				"--verbose",
				"--no-session-persistence",
				"--permission-mode", "bypassPermissions",
			]);
		});

		it("uses agent model from frontmatter", () => {
			const { args, effectiveModel } = buildClaudeArgs({ agentModel: "claude-opus-4-6" });
			assert.ok(args.includes("--model"));
			assert.ok(args.includes("claude-opus-4-6"));
			assert.equal(effectiveModel, "claude-opus-4-6");
		});

		it("model override takes precedence over agent frontmatter", () => {
			const { args, effectiveModel } = buildClaudeArgs({
				agentModel: "claude-opus-4-6",
				modelOverride: "claude-haiku-4-5",
			});
			assert.ok(args.includes("claude-haiku-4-5"));
			assert.ok(!args.includes("claude-opus-4-6"));
			assert.equal(effectiveModel, "claude-haiku-4-5");
		});

		it("strips provider prefix from model", () => {
			const { args, effectiveModel } = buildClaudeArgs({
				agentModel: "anthropic/claude-opus-4-6",
			});
			assert.ok(args.includes("claude-opus-4-6"));
			assert.ok(!args.includes("anthropic/claude-opus-4-6"));
			assert.equal(effectiveModel, "claude-opus-4-6");
		});

		it("strips provider prefix from model override", () => {
			const { args, effectiveModel } = buildClaudeArgs({
				modelOverride: "anthropic/claude-sonnet-4-6",
			});
			assert.ok(args.includes("claude-sonnet-4-6"));
			assert.equal(effectiveModel, "claude-sonnet-4-6");
		});

		it("omits --model when neither override nor frontmatter set", () => {
			const { args, effectiveModel } = buildClaudeArgs({});
			assert.ok(!args.includes("--model"));
			assert.equal(effectiveModel, undefined);
		});

		it("maps thinking 'off' to --effort low", () => {
			const { args } = buildClaudeArgs({ agentThinking: "off" });
			assert.ok(args.includes("--effort"));
			assert.ok(args.includes("low"));
		});

		it("maps thinking 'minimal' to --effort low", () => {
			const { args } = buildClaudeArgs({ agentThinking: "minimal" });
			assert.ok(args.includes("--effort"));
			assert.ok(args.includes("low"));
		});

		it("maps thinking 'low' to --effort low", () => {
			const { args } = buildClaudeArgs({ agentThinking: "low" });
			assert.ok(args.includes("--effort"));
			assert.ok(args.includes("low"));
		});

		it("maps thinking 'medium' to --effort medium", () => {
			const { args } = buildClaudeArgs({ agentThinking: "medium" });
			assert.ok(args.includes("--effort"));
			assert.ok(args.includes("medium"));
		});

		it("maps thinking 'high' to --effort high", () => {
			const { args } = buildClaudeArgs({ agentThinking: "high" });
			assert.ok(args.includes("--effort"));
			assert.ok(args.includes("high"));
		});

		it("maps thinking 'xhigh' to --effort max", () => {
			const { args } = buildClaudeArgs({ agentThinking: "xhigh" });
			assert.ok(args.includes("--effort"));
			assert.ok(args.includes("max"));
		});

		it("thinking override takes precedence over agent frontmatter", () => {
			const { args } = buildClaudeArgs({
				agentThinking: "high",
				thinkingOverride: "low",
			});
			const effortIdx = args.indexOf("--effort");
			assert.ok(effortIdx >= 0);
			assert.equal(args[effortIdx + 1], "low");
		});

		it("returns error for invalid thinking level", () => {
			const result = buildClaudeArgs({ agentThinking: "superduper" });
			assert.ok(result.error);
			assert.ok(result.error!.includes("Invalid thinking level"));
			assert.ok(result.error!.includes('"superduper"'));
		});

		it("returns empty args on validation error", () => {
			const result = buildClaudeArgs({ agentThinking: "superduper" });
			assert.deepEqual(result.args, []);
		});

		it("omits --effort when no thinking specified", () => {
			const { args } = buildClaudeArgs({});
			assert.ok(!args.includes("--effort"));
		});

		it("omits --effort for empty-string thinking", () => {
			const { args } = buildClaudeArgs({ agentThinking: "" });
			assert.ok(!args.includes("--effort"));
		});

		it("ignores agentTools (Claude has all tools built in)", () => {
			const { args } = buildClaudeArgs({ agentTools: ["read", "grep", "bash"] });
			assert.ok(!args.includes("--tools"));
			assert.ok(!args.includes("read,grep,bash"));
		});

		it("defaults permission mode to bypassPermissions", () => {
			const { args } = buildClaudeArgs({});
			const pmIdx = args.indexOf("--permission-mode");
			assert.ok(pmIdx >= 0);
			assert.equal(args[pmIdx + 1], "bypassPermissions");
		});

		it("passes --permission-mode bypassPermissions", () => {
			const { args } = buildClaudeArgs({ permissionMode: "bypassPermissions" });
			const pmIdx = args.indexOf("--permission-mode");
			assert.ok(pmIdx >= 0);
			assert.equal(args[pmIdx + 1], "bypassPermissions");
		});

		it("passes --permission-mode auto", () => {
			const { args } = buildClaudeArgs({ permissionMode: "auto" });
			const pmIdx = args.indexOf("--permission-mode");
			assert.ok(pmIdx >= 0);
			assert.equal(args[pmIdx + 1], "auto");
		});

		it("passes --permission-mode plan", () => {
			const { args } = buildClaudeArgs({ permissionMode: "plan" });
			const pmIdx = args.indexOf("--permission-mode");
			assert.ok(pmIdx >= 0);
			assert.equal(args[pmIdx + 1], "plan");
		});

		it("includes --system-prompt with inline text", () => {
			const { args } = buildClaudeArgs({ systemPrompt: "You are a helpful assistant." });
			assert.ok(args.includes("--system-prompt"));
			const spIdx = args.indexOf("--system-prompt");
			assert.equal(args[spIdx + 1], "You are a helpful assistant.");
		});

		it("omits --system-prompt when not provided", () => {
			const { args } = buildClaudeArgs({});
			assert.ok(!args.includes("--system-prompt"));
		});

		it("combines all args correctly", () => {
			const { args } = buildClaudeArgs({
				agentModel: "anthropic/claude-opus-4-6",
				modelOverride: "claude-sonnet-4-6",
				agentThinking: "high",
				thinkingOverride: "xhigh",
				agentTools: ["read", "bash"],
				permissionMode: "bypassPermissions",
				systemPrompt: "Be concise.",
			});
			assert.deepEqual(args, [
				"-p",
				"--output-format", "stream-json",
				"--verbose",
				"--no-session-persistence",
				"--permission-mode", "bypassPermissions",
				"--model", "claude-sonnet-4-6",
				"--effort", "max",
				"--system-prompt", "Be concise.",
			]);
		});
	});

	describe("parseClaudeStreamEvent", () => {
		it("returns message object for assistant event", () => {
			const event = {
				type: "assistant",
				message: {
					content: [{ type: "text", text: "Hello" }],
					model: "claude-opus-4-6",
					usage: { input_tokens: 10, output_tokens: 5 },
					stop_reason: "end_turn",
				},
			};
			const result = parseClaudeStreamEvent(event);
			assert.deepEqual(result, event.message);
		});

		it("returns undefined for system event", () => {
			const event = { type: "system", subtype: "init" };
			assert.equal(parseClaudeStreamEvent(event), undefined);
		});

		it("returns undefined for rate_limit_event", () => {
			const event = { type: "rate_limit_event" };
			assert.equal(parseClaudeStreamEvent(event), undefined);
		});

		it("returns undefined for result event", () => {
			const event = { type: "result", subtype: "success", result: "done" };
			assert.equal(parseClaudeStreamEvent(event), undefined);
		});

		it("returns undefined for unknown event type", () => {
			const event = { type: "unknown_type" };
			assert.equal(parseClaudeStreamEvent(event), undefined);
		});
	});

	describe("parseClaudeResult", () => {
		it("parses a successful result", () => {
			const json = {
				type: "result",
				subtype: "success",
				result: "The answer is 42.",
				is_error: false,
				total_cost_usd: 0.12,
				num_turns: 3,
				usage: {
					input_tokens: 1000,
					output_tokens: 200,
					cache_read_input_tokens: 50,
					cache_creation_input_tokens: 100,
				},
				model: "claude-opus-4-6",
			};
			const result = parseClaudeResult(json);
			assert.equal(result.exitCode, 0);
			assert.equal(result.finalOutput, "The answer is 42.");
			assert.equal(result.error, undefined);
			assert.equal(result.model, "claude-opus-4-6");
			assert.equal(result.usage.input, 1000);
			assert.equal(result.usage.output, 200);
			assert.equal(result.usage.cacheRead, 50);
			assert.equal(result.usage.cacheWrite, 100);
			assert.equal(result.usage.cost, 0.12);
			assert.equal(result.usage.turns, 3);
		});

		it("parses an error result with is_error true", () => {
			const json = {
				type: "result",
				subtype: "error_max_turns",
				result: "Ran out of turns",
				is_error: true,
				total_cost_usd: 0.05,
				num_turns: 10,
				usage: {
					input_tokens: 500,
					output_tokens: 100,
					cache_read_input_tokens: 0,
					cache_creation_input_tokens: 0,
				},
			};
			const result = parseClaudeResult(json);
			assert.equal(result.exitCode, 1);
			assert.equal(result.finalOutput, "Ran out of turns");
			assert.equal(result.error, "Ran out of turns");
			assert.equal(result.model, undefined);
		});

		it("parses error result with non-success subtype even if is_error is false", () => {
			const json = {
				type: "result",
				subtype: "error_tool",
				result: "Tool failed",
				is_error: false,
				total_cost_usd: 0.01,
				num_turns: 1,
				usage: {
					input_tokens: 100,
					output_tokens: 50,
				},
			};
			const result = parseClaudeResult(json);
			assert.equal(result.exitCode, 1);
			assert.equal(result.error, "Tool failed");
		});

		it("handles missing usage fields gracefully", () => {
			const json = {
				type: "result",
				subtype: "success",
				result: "Done",
				is_error: false,
				total_cost_usd: 0.0,
				num_turns: 1,
				usage: {},
			};
			const result = parseClaudeResult(json);
			assert.equal(result.usage.input, 0);
			assert.equal(result.usage.output, 0);
			assert.equal(result.usage.cacheRead, 0);
			assert.equal(result.usage.cacheWrite, 0);
		});

		it("computes contextTokens as input + output + cacheRead + cacheWrite", () => {
			const json = {
				type: "result",
				subtype: "success",
				result: "Done",
				is_error: false,
				total_cost_usd: 0.10,
				num_turns: 2,
				usage: {
					input_tokens: 1000,
					output_tokens: 200,
					cache_read_input_tokens: 300,
					cache_creation_input_tokens: 150,
				},
			};
			const result = parseClaudeResult(json);
			assert.equal(result.usage.contextTokens, 1000 + 200 + 300 + 150);
		});

		it("handles missing usage object", () => {
			const json = {
				type: "result",
				subtype: "success",
				result: "Done",
				is_error: false,
				total_cost_usd: 0.0,
				num_turns: 1,
			};
			const result = parseClaudeResult(json);
			assert.equal(result.usage.input, 0);
			assert.equal(result.usage.output, 0);
			assert.equal(result.usage.cacheRead, 0);
			assert.equal(result.usage.cacheWrite, 0);
			assert.equal(result.usage.contextTokens, 0);
		});
	});
});
