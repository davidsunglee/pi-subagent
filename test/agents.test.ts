import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { loadAgentsFromDir, getBuiltinAgentsDir } from "../agents.ts";

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
});
