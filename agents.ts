/**
 * Agent discovery and configuration
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { getAgentDir, parseFrontmatter } from "@mariozechner/pi-coding-agent";

export type AgentScope = "user" | "project" | "both";

export interface AgentConfig {
	name: string;
	description: string;
	tools?: string[];
	model?: string;
	thinking?: string;
	maxSubagentDepth?: number;
	fallbackModels?: string[];
	dispatch?: string;
	permissionMode?: string;
	systemPrompt: string;
	source: "user" | "project" | "builtin";
	filePath: string;
}

export interface AgentDiscoveryResult {
	agents: AgentConfig[];
	projectAgentsDir: string | null;
}

const VALID_THINKING_LEVELS = new Set(["off", "minimal", "low", "medium", "high", "xhigh"]);

export function loadAgentsFromDir(dir: string, source: "user" | "project" | "builtin"): AgentConfig[] {
	const agents: AgentConfig[] = [];

	if (!fs.existsSync(dir)) {
		return agents;
	}

	let entries: fs.Dirent[];
	try {
		entries = fs.readdirSync(dir, { withFileTypes: true });
	} catch {
		return agents;
	}

	for (const entry of entries) {
		if (!entry.name.endsWith(".md")) continue;
		if (!entry.isFile() && !entry.isSymbolicLink()) continue;

		const filePath = path.join(dir, entry.name);
		let content: string;
		try {
			content = fs.readFileSync(filePath, "utf-8");
		} catch {
			continue;
		}

		const { frontmatter, body } = parseFrontmatter<Record<string, string>>(content);

		if (!frontmatter.name || !frontmatter.description) {
			continue;
		}

		const tools = frontmatter.tools
			?.split(",")
			.map((t: string) => t.trim())
			.filter(Boolean);

		const rawThinking = frontmatter.thinking?.trim() || undefined;
		const thinking = rawThinking && VALID_THINKING_LEVELS.has(rawThinking) ? rawThinking : undefined;
		const rawMaxDepth = frontmatter.maxSubagentDepth !== undefined
			? parseInt(frontmatter.maxSubagentDepth, 10)
			: undefined;
		const maxSubagentDepth = rawMaxDepth !== undefined && !Number.isNaN(rawMaxDepth) ? rawMaxDepth : undefined;
		const fallbackModels = frontmatter.fallbackModels
			?.split(",")
			.map((m: string) => m.trim())
			.filter(Boolean);
		const dispatch = frontmatter.dispatch?.trim() || undefined;
		const permissionMode = frontmatter.permissionMode?.trim() || undefined;

		agents.push({
			name: frontmatter.name,
			description: frontmatter.description,
			tools: tools && tools.length > 0 ? tools : undefined,
			model: frontmatter.model,
			thinking,
			maxSubagentDepth,
			fallbackModels: fallbackModels && fallbackModels.length > 0 ? fallbackModels : undefined,
			dispatch,
			permissionMode,
			systemPrompt: body,
			source,
			filePath,
		});
	}

	return agents;
}

function isDirectory(p: string): boolean {
	try {
		return fs.statSync(p).isDirectory();
	} catch {
		return false;
	}
}

function findNearestProjectAgentsDir(cwd: string): string | null {
	let currentDir = cwd;
	while (true) {
		const candidate = path.join(currentDir, ".pi", "agents");
		if (isDirectory(candidate)) return candidate;

		const parentDir = path.dirname(currentDir);
		if (parentDir === currentDir) return null;
		currentDir = parentDir;
	}
}

export function getBuiltinAgentsDir(): string {
	const thisFile = fileURLToPath(import.meta.url);
	return path.join(path.dirname(thisFile), "agents");
}

/**
 * Merge agents from three tiers with priority: builtin (lowest) -> user -> project (highest).
 * Later tiers override earlier tiers by name.
 */
export function mergeAgentsByPriority(
	builtinAgents: AgentConfig[],
	userAgents: AgentConfig[],
	projectAgents: AgentConfig[],
	scope: AgentScope,
): AgentConfig[] {
	const agentMap = new Map<string, AgentConfig>();

	for (const agent of builtinAgents) agentMap.set(agent.name, agent);

	if (scope === "both") {
		for (const agent of userAgents) agentMap.set(agent.name, agent);
		for (const agent of projectAgents) agentMap.set(agent.name, agent);
	} else if (scope === "user") {
		for (const agent of userAgents) agentMap.set(agent.name, agent);
	} else {
		for (const agent of projectAgents) agentMap.set(agent.name, agent);
	}

	return Array.from(agentMap.values());
}

export function discoverAgents(cwd: string, scope: AgentScope): AgentDiscoveryResult {
	const builtinDir = getBuiltinAgentsDir();
	const userDir = path.join(getAgentDir(), "agents");
	const projectAgentsDir = findNearestProjectAgentsDir(cwd);

	const builtinAgents = loadAgentsFromDir(builtinDir, "builtin");
	const userAgents = scope === "project" ? [] : loadAgentsFromDir(userDir, "user");
	const projectAgents = scope === "user" || !projectAgentsDir ? [] : loadAgentsFromDir(projectAgentsDir, "project");

	return {
		agents: mergeAgentsByPriority(builtinAgents, userAgents, projectAgents, scope),
		projectAgentsDir,
	};
}

export function formatAgentList(agents: AgentConfig[], maxItems: number): { text: string; remaining: number } {
	if (agents.length === 0) return { text: "none", remaining: 0 };
	const listed = agents.slice(0, maxItems);
	const remaining = agents.length - listed.length;
	return {
		text: listed.map((a) => `${a.name} (${a.source}): ${a.description}`).join("; "),
		remaining,
	};
}
