import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { loadAgentsFromDir, getBuiltinAgentsDir, mergeAgentsByPriority } from "../agents.ts";
import type { AgentConfig } from "../agents.ts";

describe("agents", () => {
	let tmpDir: string;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-subagent-test-"));
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	describe("loadAgentsFromDir", () => {
		it("parses standard frontmatter fields", () => {
			fs.writeFileSync(path.join(tmpDir, "test-agent.md"), [
				"---",
				"name: test-agent",
				"description: A test agent",
				"model: claude-sonnet-4-6",
				"tools: read, grep, bash",
				"---",
				"",
				"You are a test agent.",
			].join("\n"));

			const agents = loadAgentsFromDir(tmpDir, "user");
			assert.equal(agents.length, 1);
			assert.equal(agents[0].name, "test-agent");
			assert.equal(agents[0].description, "A test agent");
			assert.equal(agents[0].model, "claude-sonnet-4-6");
			assert.deepEqual(agents[0].tools, ["read", "grep", "bash"]);
			assert.equal(agents[0].source, "user");
			assert.equal(agents[0].systemPrompt.trim(), "You are a test agent.");
		});

		it("parses thinking field", () => {
			fs.writeFileSync(path.join(tmpDir, "thinker.md"), [
				"---",
				"name: thinker",
				"description: Thinks deeply",
				"thinking: high",
				"---",
				"",
				"Think.",
			].join("\n"));

			const agents = loadAgentsFromDir(tmpDir, "user");
			assert.equal(agents[0].thinking, "high");
		});

		it("drops invalid thinking value from frontmatter", () => {
			fs.writeFileSync(path.join(tmpDir, "bad-thinking.md"), [
				"---",
				"name: bad-thinking",
				"description: Invalid thinking",
				"thinking: superduper",
				"---",
				"",
				"Body.",
			].join("\n"));

			const agents = loadAgentsFromDir(tmpDir, "user");
			assert.equal(agents[0].thinking, undefined);
		});

		it("preserves valid thinking values from frontmatter", () => {
			const validLevels = ["off", "minimal", "low", "medium", "high", "xhigh"];
			for (const level of validLevels) {
				const filename = `thinking-${level}.md`;
				fs.writeFileSync(path.join(tmpDir, filename), [
					"---",
					`name: thinking-${level}`,
					`description: Thinking ${level}`,
					`thinking: ${level}`,
					"---",
					"",
					"Body.",
				].join("\n"));
			}

			const agents = loadAgentsFromDir(tmpDir, "user");
			assert.equal(agents.length, validLevels.length);
			for (let i = 0; i < validLevels.length; i++) {
				const agent = agents.find(a => a.name === `thinking-${validLevels[i]}`);
				assert.ok(agent, `Expected agent for thinking level "${validLevels[i]}"`);
				assert.equal(agent!.thinking, validLevels[i]);
			}
		});

		it("parses maxSubagentDepth as integer", () => {
			fs.writeFileSync(path.join(tmpDir, "shallow.md"), [
				"---",
				"name: shallow",
				"description: No recursion",
				"maxSubagentDepth: 0",
				"---",
				"",
				"No subs.",
			].join("\n"));

			const agents = loadAgentsFromDir(tmpDir, "user");
			assert.equal(agents[0].maxSubagentDepth, 0);
		});

		it("handles non-numeric maxSubagentDepth as undefined", () => {
			fs.writeFileSync(path.join(tmpDir, "bad-depth.md"), [
				"---",
				"name: bad-depth",
				"description: Bad depth value",
				"maxSubagentDepth: not-a-number",
				"---",
				"",
				"Body.",
			].join("\n"));

			const agents = loadAgentsFromDir(tmpDir, "user");
			assert.equal(agents[0].maxSubagentDepth, undefined);
		});

		it("parses fallbackModels as comma-separated list", () => {
			fs.writeFileSync(path.join(tmpDir, "fallback.md"), [
				"---",
				"name: fallback",
				"description: Has fallbacks",
				"fallbackModels: claude-haiku-4-5, gpt-4o-mini",
				"---",
				"",
				"Body.",
			].join("\n"));

			const agents = loadAgentsFromDir(tmpDir, "user");
			assert.deepEqual(agents[0].fallbackModels, ["claude-haiku-4-5", "gpt-4o-mini"]);
		});

		it("returns undefined for absent optional fields", () => {
			fs.writeFileSync(path.join(tmpDir, "minimal.md"), [
				"---",
				"name: minimal",
				"description: Just the basics",
				"---",
				"",
				"Body.",
			].join("\n"));

			const agents = loadAgentsFromDir(tmpDir, "user");
			assert.equal(agents[0].thinking, undefined);
			assert.equal(agents[0].maxSubagentDepth, undefined);
			assert.equal(agents[0].fallbackModels, undefined);
			assert.equal(agents[0].model, undefined);
			assert.equal(agents[0].tools, undefined);
		});

		it("skips files without name", () => {
			fs.writeFileSync(path.join(tmpDir, "no-name.md"), [
				"---",
				"description: Missing name",
				"---",
				"",
				"Body.",
			].join("\n"));

			const agents = loadAgentsFromDir(tmpDir, "user");
			assert.equal(agents.length, 0);
		});

		it("skips files without description", () => {
			fs.writeFileSync(path.join(tmpDir, "no-desc.md"), [
				"---",
				"name: no-desc",
				"---",
				"",
				"Body.",
			].join("\n"));

			const agents = loadAgentsFromDir(tmpDir, "user");
			assert.equal(agents.length, 0);
		});

		it("skips non-markdown files", () => {
			fs.writeFileSync(path.join(tmpDir, "not-markdown.txt"), "hello");

			const agents = loadAgentsFromDir(tmpDir, "user");
			assert.equal(agents.length, 0);
		});

		it("returns empty array for non-existent directory", () => {
			const agents = loadAgentsFromDir("/tmp/does-not-exist-xyz", "user");
			assert.equal(agents.length, 0);
		});

		it("assigns correct source label", () => {
			fs.writeFileSync(path.join(tmpDir, "agent.md"), [
				"---",
				"name: agent",
				"description: Test",
				"---",
				"Body.",
			].join("\n"));

			const userAgents = loadAgentsFromDir(tmpDir, "user");
			assert.equal(userAgents[0].source, "user");

			const projectAgents = loadAgentsFromDir(tmpDir, "project");
			assert.equal(projectAgents[0].source, "project");

			const builtinAgents = loadAgentsFromDir(tmpDir, "builtin");
			assert.equal(builtinAgents[0].source, "builtin");
		});
	});

	describe("getBuiltinAgentsDir", () => {
		it("resolves to package agents/ directory", () => {
			const dir = getBuiltinAgentsDir();
			assert.ok(dir.endsWith("/agents") || dir.endsWith("\\agents"));
			assert.ok(fs.existsSync(dir), `Builtin agents dir should exist: ${dir}`);
		});

		it("contains the 4 builtin agent files", () => {
			const dir = getBuiltinAgentsDir();
			const files = fs.readdirSync(dir).filter(f => f.endsWith(".md")).sort();
			assert.deepEqual(files, ["planner.md", "reviewer.md", "scout.md", "worker.md"]);
		});
	});

	describe("mergeAgentsByPriority", () => {
		const makeAgent = (name: string, source: "builtin" | "user" | "project"): AgentConfig => ({
			name,
			description: `${name} from ${source}`,
			systemPrompt: "",
			source,
			filePath: `/fake/${source}/${name}.md`,
		});

		it("returns builtin agents when no user or project agents", () => {
			const builtins = [makeAgent("scout", "builtin"), makeAgent("planner", "builtin")];
			const result = mergeAgentsByPriority(builtins, [], [], "user");
			assert.equal(result.length, 2);
			assert.equal(result[0].source, "builtin");
		});

		it("user agents override builtins with same name", () => {
			const builtins = [makeAgent("planner", "builtin")];
			const users = [makeAgent("planner", "user")];
			const result = mergeAgentsByPriority(builtins, users, [], "user");
			assert.equal(result.length, 1);
			assert.equal(result[0].source, "user");
			assert.equal(result[0].description, "planner from user");
		});

		it("project agents override user agents with same name", () => {
			const users = [makeAgent("planner", "user")];
			const projects = [makeAgent("planner", "project")];
			const result = mergeAgentsByPriority([], users, projects, "both");
			assert.equal(result.length, 1);
			assert.equal(result[0].source, "project");
		});

		it("project agents override builtins with same name", () => {
			const builtins = [makeAgent("planner", "builtin")];
			const projects = [makeAgent("planner", "project")];
			const result = mergeAgentsByPriority(builtins, [], projects, "both");
			assert.equal(result.length, 1);
			assert.equal(result[0].source, "project");
		});

		it("non-colliding agents from all tiers are all included", () => {
			const builtins = [makeAgent("scout", "builtin")];
			const users = [makeAgent("coder", "user")];
			const projects = [makeAgent("reviewer", "project")];
			const result = mergeAgentsByPriority(builtins, users, projects, "both");
			assert.equal(result.length, 3);
			const names = result.map(a => a.name).sort();
			assert.deepEqual(names, ["coder", "reviewer", "scout"]);
		});

		it("scope 'user' ignores project agents in merge", () => {
			const builtins = [makeAgent("scout", "builtin")];
			const users = [makeAgent("coder", "user")];
			const projects = [makeAgent("reviewer", "project")];
			const result = mergeAgentsByPriority(builtins, users, projects, "user");
			// Project agents are passed but scope "user" means they shouldn't override
			const names = result.map(a => a.name).sort();
			assert.deepEqual(names, ["coder", "scout"]);
		});

		it("scope 'project' ignores user agents in merge", () => {
			const builtins = [makeAgent("scout", "builtin")];
			const users = [makeAgent("coder", "user")];
			const projects = [makeAgent("reviewer", "project")];
			const result = mergeAgentsByPriority(builtins, users, projects, "project");
			const names = result.map(a => a.name).sort();
			assert.deepEqual(names, ["reviewer", "scout"]);
		});

		it("full scenario: 5 user agents override 1 builtin, 3 builtins remain", () => {
			const builtins = [
				makeAgent("scout", "builtin"),
				makeAgent("planner", "builtin"),
				makeAgent("worker", "builtin"),
				makeAgent("reviewer", "builtin"),
			];
			const users = [
				makeAgent("planner", "user"),  // overrides builtin
				makeAgent("coder", "user"),
				makeAgent("plan-reviewer", "user"),
				makeAgent("code-reviewer", "user"),
				makeAgent("code-refiner", "user"),
			];
			const result = mergeAgentsByPriority(builtins, users, [], "user");
			assert.equal(result.length, 8);

			const planner = result.find(a => a.name === "planner");
			assert.equal(planner?.source, "user"); // user overrides builtin

			const scout = result.find(a => a.name === "scout");
			assert.equal(scout?.source, "builtin"); // not overridden
		});
	});
});
