import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { getCurrentDepth, getParentMaxDepth, checkDepth, buildChildEnv } from "../depth-guard.ts";

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

		it("returns 0 for Infinity env value", () => {
			process.env.PI_SUBAGENT_DEPTH = "Infinity";
			assert.equal(getCurrentDepth(), 0);
		});

		it("returns 0 for NaN env value", () => {
			process.env.PI_SUBAGENT_DEPTH = "NaN";
			assert.equal(getCurrentDepth(), 0);
		});

		it("returns 0 for non-numeric env value", () => {
			process.env.PI_SUBAGENT_DEPTH = "abc";
			assert.equal(getCurrentDepth(), 0);
		});
	});

	describe("getParentMaxDepth", () => {
		it("returns DEFAULT_MAX_DEPTH (2) when env var is not set", () => {
			assert.equal(getParentMaxDepth(), 2);
		});

		it("parses max depth from env var", () => {
			process.env.PI_SUBAGENT_MAX_DEPTH = "5";
			assert.equal(getParentMaxDepth(), 5);
		});

		it("returns DEFAULT_MAX_DEPTH for 'Infinity'", () => {
			process.env.PI_SUBAGENT_MAX_DEPTH = "Infinity";
			assert.equal(getParentMaxDepth(), 2);
		});

		it("returns DEFAULT_MAX_DEPTH for 'NaN'", () => {
			process.env.PI_SUBAGENT_MAX_DEPTH = "NaN";
			assert.equal(getParentMaxDepth(), 2);
		});

		it("returns DEFAULT_MAX_DEPTH for non-numeric string", () => {
			process.env.PI_SUBAGENT_MAX_DEPTH = "abc";
			assert.equal(getParentMaxDepth(), 2);
		});

		it("accepts zero as a valid max depth", () => {
			process.env.PI_SUBAGENT_MAX_DEPTH = "0";
			assert.equal(getParentMaxDepth(), 0);
		});
	});

	describe("checkDepth", () => {
		it("allows dispatch when depth is below default max (2)", () => {
			// depth 0, max 2 → allowed
			const result = checkDepth("coder");
			assert.equal(result.allowed, true);
			assert.equal(result.currentDepth, 0);
			assert.equal(result.effectiveMaxDepth, 2);
		});

		it("blocks dispatch when depth equals max", () => {
			process.env.PI_SUBAGENT_DEPTH = "2";
			const result = checkDepth("coder");
			assert.equal(result.allowed, false);
			assert.ok(result.errorMessage?.includes("coder"));
		});

		it("blocks dispatch when depth exceeds max", () => {
			process.env.PI_SUBAGENT_DEPTH = "3";
			process.env.PI_SUBAGENT_MAX_DEPTH = "2";
			const result = checkDepth("planner");
			assert.equal(result.allowed, false);
		});

		it("allows agent with maxSubagentDepth 0 to be launched (checks parent, not child)", () => {
			// An agent with maxSubagentDepth 0 (like code-reviewer) CAN be launched
			// because checkDepth checks the PARENT's limits, not the child's config
			const result = checkDepth("code-reviewer");
			assert.equal(result.allowed, true);
		});

		it("respects parent max depth from env", () => {
			process.env.PI_SUBAGENT_DEPTH = "1";
			process.env.PI_SUBAGENT_MAX_DEPTH = "3";
			const result = checkDepth("worker");
			assert.equal(result.allowed, true);
			assert.equal(result.effectiveMaxDepth, 3);
		});

		it("blocks when parent env says max is reached", () => {
			process.env.PI_SUBAGENT_DEPTH = "2";
			process.env.PI_SUBAGENT_MAX_DEPTH = "2";
			const result = checkDepth("worker");
			assert.equal(result.allowed, false);
		});

		it("allows code-reviewer dispatched at depth 1 when parent max is 2", () => {
			// code-reviewer has maxSubagentDepth 0, but that's irrelevant for launch
			// parent max depth is 2, current depth is 1 → 1 < 2 → allowed
			process.env.PI_SUBAGENT_DEPTH = "1";
			process.env.PI_SUBAGENT_MAX_DEPTH = "2";
			const result = checkDepth("code-reviewer");
			assert.equal(result.allowed, true);
		});

		it("no longer takes agentMaxDepth parameter", () => {
			// checkDepth only takes agentName now
			assert.equal(checkDepth.length, 1);
		});
	});

	describe("buildChildEnv", () => {
		it("increments depth by 1", () => {
			const env = buildChildEnv(0, 2, undefined);
			assert.equal(env.PI_SUBAGENT_DEPTH, "1");
		});

		it("inherits parent max depth when agent has no maxSubagentDepth", () => {
			const env = buildChildEnv(0, 3, undefined);
			assert.equal(env.PI_SUBAGENT_MAX_DEPTH, "3");
		});

		it("converts agent relative maxSubagentDepth to absolute and clamps to parent", () => {
			// code-refiner at depth 0, parent max 5, agent maxSubagentDepth 1
			// childDepth = 1, childAbsoluteLimit = 1 + 1 = 2, clamp to min(2, 5) = 2
			const env = buildChildEnv(0, 5, 1);
			assert.equal(env.PI_SUBAGENT_DEPTH, "1");
			assert.equal(env.PI_SUBAGENT_MAX_DEPTH, "2");
		});

		it("agent maxSubagentDepth 0 means child cannot spawn subagents", () => {
			// code-reviewer at depth 1, parent max 2, agent maxSubagentDepth 0
			// childDepth = 2, childAbsoluteLimit = 2 + 0 = 2, clamp to min(2, 2) = 2
			// child sees depth 2 and max 2, so 2 >= 2 → blocked
			const env = buildChildEnv(1, 2, 0);
			assert.equal(env.PI_SUBAGENT_DEPTH, "2");
			assert.equal(env.PI_SUBAGENT_MAX_DEPTH, "2");
		});

		it("cannot relax parent's limit", () => {
			// agent says maxSubagentDepth 10, but parent max is 3
			// childDepth = 1, childAbsoluteLimit = 1 + 10 = 11, clamp to min(11, 3) = 3
			const env = buildChildEnv(0, 3, 10);
			assert.equal(env.PI_SUBAGENT_MAX_DEPTH, "3");
		});

		it("end-to-end: orchestrator → code-refiner(1) → code-reviewer(0) → blocked", () => {
			// Step 1: Orchestrator at depth 0, parent max 2, launches code-refiner (maxSubagentDepth 1)
			const refinerEnv = buildChildEnv(0, 2, 1);
			assert.equal(refinerEnv.PI_SUBAGENT_DEPTH, "1");
			assert.equal(refinerEnv.PI_SUBAGENT_MAX_DEPTH, "2");

			// Step 2: code-refiner at depth 1, max 2, launches code-reviewer (maxSubagentDepth 0)
			const reviewerEnv = buildChildEnv(1, 2, 0);
			assert.equal(reviewerEnv.PI_SUBAGENT_DEPTH, "2");
			assert.equal(reviewerEnv.PI_SUBAGENT_MAX_DEPTH, "2");

			// Step 3: code-reviewer at depth 2, max 2 → cannot spawn (2 >= 2)
			// Simulate by setting env and calling checkDepth
			process.env.PI_SUBAGENT_DEPTH = reviewerEnv.PI_SUBAGENT_DEPTH;
			process.env.PI_SUBAGENT_MAX_DEPTH = reviewerEnv.PI_SUBAGENT_MAX_DEPTH;
			const depthCheck = checkDepth("any-subagent");
			assert.equal(depthCheck.allowed, false);
			assert.ok(depthCheck.errorMessage?.includes("any-subagent"));
		});
	});
});
