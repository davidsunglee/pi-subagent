import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { getCurrentDepth, getEffectiveMaxDepth, checkDepth, buildChildEnv } from "../depth-guard.ts";

describe("depth-guard", () => {
	const originalEnv = { ...process.env };

	beforeEach(() => {
		delete process.env.PI_SUBAGENT_DEPTH;
		delete process.env.PI_SUBAGENT_MAX_DEPTH;
	});

	afterEach(() => {
		process.env = { ...originalEnv };
	});

	describe("getCurrentDepth", () => {
		it("returns 0 when env var is not set", () => {
			assert.equal(getCurrentDepth(), 0);
		});

		it("parses depth from env var", () => {
			process.env.PI_SUBAGENT_DEPTH = "2";
			assert.equal(getCurrentDepth(), 2);
		});
	});

	describe("getEffectiveMaxDepth", () => {
		it("uses agent limit when no parent limit", () => {
			assert.equal(getEffectiveMaxDepth(1), 1);
		});

		it("uses parent limit when no agent limit", () => {
			assert.equal(getEffectiveMaxDepth(undefined, 3), 3);
		});

		it("uses the stricter of agent and parent limits", () => {
			assert.equal(getEffectiveMaxDepth(2, 5), 2);
			assert.equal(getEffectiveMaxDepth(5, 2), 2);
		});

		it("returns Infinity when neither limit is set", () => {
			assert.equal(getEffectiveMaxDepth(undefined, undefined), Infinity);
		});
	});

	describe("checkDepth", () => {
		it("allows dispatch when depth is below limit", () => {
			const result = checkDepth("coder", 2);
			assert.equal(result.allowed, true);
			assert.equal(result.currentDepth, 0);
		});

		it("blocks dispatch when depth equals limit", () => {
			process.env.PI_SUBAGENT_DEPTH = "1";
			const result = checkDepth("coder", 1);
			assert.equal(result.allowed, false);
			assert.ok(result.errorMessage?.includes("coder"));
		});

		it("blocks dispatch when depth exceeds limit", () => {
			process.env.PI_SUBAGENT_DEPTH = "3";
			const result = checkDepth("planner", 2);
			assert.equal(result.allowed, false);
		});

		it("blocks agent with maxSubagentDepth 0 at any depth", () => {
			const result = checkDepth("planner", 0);
			assert.equal(result.allowed, false);
		});

		it("respects parent max depth from env", () => {
			process.env.PI_SUBAGENT_DEPTH = "1";
			process.env.PI_SUBAGENT_MAX_DEPTH = "2";
			// Agent says depth 5 is ok, but parent says max 2
			const result = checkDepth("worker", 5);
			assert.equal(result.allowed, true);
			assert.equal(result.effectiveMaxDepth, 2);
		});

		it("parent limit cannot be relaxed by agent", () => {
			process.env.PI_SUBAGENT_DEPTH = "1";
			process.env.PI_SUBAGENT_MAX_DEPTH = "2";
			const result = checkDepth("worker", 100);
			assert.equal(result.effectiveMaxDepth, 2);
		});

		it("allows code-refiner scenario: depth 0, maxSubagentDepth 1", () => {
			const result = checkDepth("code-refiner", 1);
			assert.equal(result.allowed, true);
		});

		it("blocks code-reviewer dispatched by code-refiner: depth 1, maxSubagentDepth 0", () => {
			process.env.PI_SUBAGENT_DEPTH = "1";
			const result = checkDepth("code-reviewer", 0);
			assert.equal(result.allowed, false);
		});
	});

	describe("buildChildEnv", () => {
		it("increments depth by 1", () => {
			const env = buildChildEnv(0, 2);
			assert.equal(env.PI_SUBAGENT_DEPTH, "1");
		});

		it("passes through max depth", () => {
			const env = buildChildEnv(0, 3);
			assert.equal(env.PI_SUBAGENT_MAX_DEPTH, "3");
		});
	});
});
