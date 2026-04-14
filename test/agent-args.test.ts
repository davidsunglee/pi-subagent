import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildAgentArgs, isValidThinkingLevel } from "../agent-args.ts";

describe("agent-args", () => {
	describe("buildAgentArgs", () => {
		it("includes base flags", () => {
			const { args } = buildAgentArgs({});
			assert.deepEqual(args, ["--mode", "json", "-p", "--no-session"]);
		});

		it("uses agent model from frontmatter", () => {
			const { args, effectiveModel } = buildAgentArgs({ agentModel: "claude-opus-4-6" });
			assert.ok(args.includes("--model"));
			assert.ok(args.includes("claude-opus-4-6"));
			assert.equal(effectiveModel, "claude-opus-4-6");
		});

		it("model override takes precedence over agent frontmatter", () => {
			const { args, effectiveModel } = buildAgentArgs({
				agentModel: "claude-opus-4-6",
				modelOverride: "claude-haiku-4-5",
			});
			assert.ok(args.includes("claude-haiku-4-5"));
			assert.ok(!args.includes("claude-opus-4-6"));
			assert.equal(effectiveModel, "claude-haiku-4-5");
		});

		it("uses agent thinking from frontmatter", () => {
			const { args, effectiveThinking } = buildAgentArgs({ agentThinking: "high" });
			assert.ok(args.includes("--thinking"));
			assert.ok(args.includes("high"));
			assert.equal(effectiveThinking, "high");
		});

		it("thinking override takes precedence over agent frontmatter", () => {
			const { args, effectiveThinking } = buildAgentArgs({
				agentThinking: "high",
				thinkingOverride: "low",
			});
			assert.ok(args.includes("low"));
			assert.ok(!args.includes("high"));
			assert.equal(effectiveThinking, "low");
		});

		it("omits --model when neither override nor frontmatter set", () => {
			const { args, effectiveModel } = buildAgentArgs({});
			assert.ok(!args.includes("--model"));
			assert.equal(effectiveModel, undefined);
		});

		it("omits --thinking when neither override nor frontmatter set", () => {
			const { args, effectiveThinking } = buildAgentArgs({});
			assert.ok(!args.includes("--thinking"));
			assert.equal(effectiveThinking, undefined);
		});

		it("includes --tools from agent config", () => {
			const { args } = buildAgentArgs({ agentTools: ["read", "grep", "bash"] });
			assert.ok(args.includes("--tools"));
			assert.ok(args.includes("read,grep,bash"));
		});

		it("omits --tools when agent has no tools", () => {
			const { args } = buildAgentArgs({ agentTools: undefined });
			assert.ok(!args.includes("--tools"));
		});

		it("omits --tools when agent has empty tools array", () => {
			const { args } = buildAgentArgs({ agentTools: [] });
			assert.ok(!args.includes("--tools"));
		});

		it("combines all args correctly", () => {
			const { args } = buildAgentArgs({
				agentModel: "claude-opus-4-6",
				modelOverride: "claude-sonnet-4-6",
				agentThinking: "high",
				thinkingOverride: "medium",
				agentTools: ["read", "bash"],
			});
			assert.deepEqual(args, [
				"--mode", "json", "-p", "--no-session",
				"--model", "claude-sonnet-4-6",
				"--thinking", "medium",
				"--tools", "read,bash",
			]);
		});

		it("returns error field for invalid thinking level", () => {
			const result = buildAgentArgs({ agentThinking: "superduper" });
			assert.ok(result.error);
			assert.ok(result.error!.includes('Invalid thinking level'));
			assert.ok(result.error!.includes('"superduper"'));
		});

		it("returns empty args array on validation error", () => {
			const result = buildAgentArgs({ agentThinking: "superduper" });
			assert.deepEqual(result.args, []);
		});

		it("returns effectiveModel and effectiveThinking on validation error", () => {
			const result = buildAgentArgs({ agentModel: "claude-opus-4-6", agentThinking: "superduper" });
			assert.equal(result.effectiveModel, "claude-opus-4-6");
			assert.equal(result.effectiveThinking, "superduper");
			assert.ok(result.error);
		});

		it("throws on empty-string thinking level", () => {
			// Empty string is falsy so it won't reach validation — should not throw
			const { args } = buildAgentArgs({ agentThinking: "" });
			assert.ok(!args.includes("--thinking"));
		});

		it("accepts all valid thinking levels", () => {
			for (const level of ["off", "minimal", "low", "medium", "high", "xhigh"]) {
				const { args, effectiveThinking } = buildAgentArgs({ agentThinking: level });
				assert.ok(args.includes("--thinking"));
				assert.ok(args.includes(level));
				assert.equal(effectiveThinking, level);
			}
		});
	});

	describe("isValidThinkingLevel", () => {
		it("returns true for valid levels", () => {
			for (const level of ["off", "minimal", "low", "medium", "high", "xhigh"]) {
				assert.equal(isValidThinkingLevel(level), true, `Expected "${level}" to be valid`);
			}
		});

		it("returns false for invalid levels", () => {
			assert.equal(isValidThinkingLevel("superduper"), false);
			assert.equal(isValidThinkingLevel("MAX"), false);
			assert.equal(isValidThinkingLevel(""), false);
			assert.equal(isValidThinkingLevel("High"), false); // case-sensitive
		});
	});
});
