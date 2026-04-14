# pi-subagent

Subagent extension for [pi coding agent](https://github.com/badlogic/pi-mono). Delegates tasks to specialized agents via isolated subprocess spawning, with support for both `pi` and `claude` (Claude Code) CLI backends.

Forked from the reference implementation in `badlogic/pi-mono`, extended with:

- **Multi-CLI dispatch** — route tasks through `pi` or `claude` via a `dispatch` frontmatter field or per-invocation override
- **Per-task model and thinking overrides** — override model and thinking level per dispatch in single and parallel modes
- **Recursion depth guard** — prevents infinite subagent nesting via `PI_SUBAGENT_DEPTH` env var
- **Model fallback** — opt-in ordered retry on retryable errors (rate limit, overloaded, network failures)
- **Builtin agent discovery** — three-tier priority: builtin (package `agents/`) < user (`~/.pi/agent/agents/`) < project (`.pi/agents/`)
- **Tool restriction mapping** — pi tool names mapped to Claude Code equivalents via `--allowedTools`

## Installation

Reference from `~/.pi/agent/settings.json`:

```json
{
  "packages": [
    "~/Code/pi-subagent"
  ]
}
```

## Usage

Three dispatch modes:

```
# Single
subagent { agent: "scout", task: "List files in src/" }

# Parallel
subagent { tasks: [
  { agent: "worker", task: "Implement feature A" },
  { agent: "worker", task: "Implement feature B" }
]}

# Chain
subagent { chain: [
  { agent: "scout", task: "Analyze the codebase" },
  { agent: "planner", task: "Create a plan based on: {previous}" }
]}
```

### Claude Code dispatch

Route tasks through the `claude` CLI instead of `pi`:

```
subagent { agent: "scout", task: "List files", dispatch: "claude" }
```

Set `dispatch` in agent frontmatter for a default, or pass it per-invocation. Per-task overrides work in parallel and chain modes.

## Agent frontmatter

```yaml
---
name: coder
description: Writes code from task specs
model: anthropic/claude-sonnet-4-6
thinking: high
dispatch: claude
permissionMode: bypassPermissions
maxSubagentDepth: 0
fallbackModels: anthropic/claude-haiku-4-5
tools: read, write, edit, bash, grep
---
System prompt here.
```

All fields except `name` and `description` are optional.

## Builtin agents

| Agent | Purpose |
|---|---|
| scout | Fast codebase recon (Haiku) |
| planner | Plan generation (Sonnet) |
| worker | General execution (Sonnet) |
| reviewer | Code review (Sonnet) |

User-scope agents at `~/.pi/agent/agents/` override builtins by name.

## File structure

```
pi-subagent/
├── index.ts            # Extension entry point, tool registration, execution
├── agents.ts           # Agent discovery and frontmatter parsing
├── agent-args.ts       # Pi CLI arg building
├── claude-args.ts      # Claude Code CLI arg building, stream parsing
├── depth-guard.ts      # Recursion depth guard
├── model-fallback.ts   # Model fallback retry wrapper
├── agents/             # Builtin agent definitions
├── prompts/            # Chain prompt templates
└── test/               # Unit tests
```

## Tests

```bash
node --experimental-strip-types --test test/*.test.ts
```
