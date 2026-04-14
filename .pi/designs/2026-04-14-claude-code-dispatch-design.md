# Claude Code Dispatch for Subagents

**Source:** TODO-97a8b7b4
**Date:** 2026-04-14
**Updated:** 2026-04-14 (grounded to current pi-subagent repo)

## Problem

Anthropic subscription plans (Max, etc.) provide included usage quotas when using Claude Code, but API calls from third-party agents like pi count as "extra usage" at higher cost. Pi's subagent extension currently only spawns `pi` processes — there is no way to route Anthropic-model tasks through the `claude` CLI to take advantage of subscription quotas.

Anthropic's stealth-mode detection (identifying non-Claude-Code clients using OAuth tokens) is an active cat-and-mouse game. Spawning the actual Claude Code CLI is the durable, ToS-compliant approach.

## Scope

This spec covers **Layer 1 only** — general-purpose dispatch support in the `pi-subagent` extension. Layer 2 (adding a `dispatch` map to `model-tiers.json` and updating skill SKILL.md files) lives in a separate repo and is out of scope here.

## Design

The subagent extension learns to spawn different CLIs based on a `dispatch` property. This works for any subagent use case, independent of planning/execution workflows.

### Agent Frontmatter

Two new optional fields in agent markdown frontmatter:

```yaml
---
name: coder
model: claude-sonnet-4-6
dispatch: claude           # pi (default) | claude
permissionMode: bypassPermissions  # bypassPermissions (default) | auto | plan
---
```

- **`dispatch`** — which CLI spawns the subagent. Default: `pi` (current behavior). When `claude`, the extension spawns the `claude` CLI instead.
- **`permissionMode`** — only applies when `dispatch: claude`. Maps to Claude Code's `--permission-mode` flag. Supported values:
  - `bypassPermissions` (default) — no permission prompts, subagents operate fully autonomously
  - `auto` — autonomous with safety guardrails
  - `plan` — read-only, no file mutations (useful for reviewers)

### Invocation-Time Override

Callers can override both fields at invocation time:

```
subagent { agent: "coder", task: "...", dispatch: "claude", permissionMode: "plan" }
```

Precedence: invocation-time override > agent frontmatter > extension default (`pi`).

### AgentConfig Changes

The `AgentConfig` interface gains two optional fields alongside the existing extended frontmatter fields:

```typescript
export interface AgentConfig {
    name: string;
    description: string;
    tools?: string[];
    model?: string;
    thinking?: string;
    maxSubagentDepth?: number;
    fallbackModels?: string[];
    dispatch?: string;         // "pi" | "claude"
    permissionMode?: string;   // "bypassPermissions" | "auto" | "plan"
    systemPrompt: string;
    source: "user" | "project" | "builtin";
    filePath: string;
}
```

Parsed from frontmatter by `loadAgentsFromDir()` in `agents.ts`.

### SubagentParams Changes

The subagent tool's parameter schema gains optional `dispatch` and `permissionMode` fields in `SubagentParams` (single mode), `TaskItem` (parallel mode), and `ChainItem` (chain mode).

### Model Translation

When `dispatch: claude`, the extension strips the provider prefix from the pi-normalized model string:

- `anthropic/claude-opus-4-6` → `claude-opus-4-6`
- `anthropic/claude-sonnet-4-6` → `claude-sonnet-4-6`
- `anthropic/claude-haiku-4-5` → `claude-haiku-4-5`

Implementation: split on `/`, take the right side. Claude Code accepts these IDs directly via `--model`.

### CLI Argument Mapping

| pi | claude |
|---|---|
| `--mode json -p` | `-p --output-format stream-json` |
| `--model anthropic/claude-opus-4-6` | `--model claude-opus-4-6` |
| `--append-system-prompt <file>` | `--system-prompt <file>` |
| `--no-session` | `--no-session-persistence` |
| `--tools read,write,...` | *(not needed — Claude Code has all tools built in)* |
| `--thinking <level>` | `--effort <level>` (translated — see Thinking / Effort below) |
| *(n/a)* | `--permission-mode <mode>` |

### Thinking / Effort

Pi's `--thinking <level>` (off/minimal/low/medium/high/xhigh) maps to Claude Code's `--effort <level>` (low/medium/high/max). The mapping is approximate — pi has 6 levels, Claude Code has 4. When `dispatch: claude`, `buildClaudeArgs()` translates the thinking level:

| pi thinking | claude effort |
|---|---|
| `off` | `low` |
| `minimal` | `low` |
| `low` | `low` |
| `medium` | `medium` |
| `high` | `high` |
| `xhigh` | `max` |

If `thinking` is unset, `--effort` is omitted (Claude Code uses its own default).

### Tools

Pi's `--tools` flag restricts which tools a subagent can use. Claude Code has all tools built in and does not accept a `--tools` flag. When `dispatch: claude`, the `tools` field from agent frontmatter is ignored.

### System Prompt

Pi's `--append-system-prompt` takes a file path. Claude Code's `--system-prompt` flag behavior (file path vs inline text) should be verified during implementation. If it accepts a file path, the existing temp-file approach works. If it accepts inline text only, `buildClaudeArgs()` reads the temp file content and passes it as a string argument instead.

### Spawn Function

A new `getClaudeInvocation(args)` function alongside the existing `getPiInvocation(args)`:

```typescript
function getClaudeInvocation(args: string[]): { command: string; args: string[] } {
    return { command: "claude", args };
}
```

`runSingleAgent()` branches on `dispatch` to choose the invocation function and arg builder. The output event parsing also branches: pi emits `message_end`/`tool_result_end` events, while Claude Code's `stream-json` format has its own event schema.

### Error Handling

If `dispatch: claude` is set but the `claude` CLI is not found (spawn fails with ENOENT), the subagent returns a `SingleResult` with `exitCode: 1` and a clear error message: `"Claude Code CLI not found. Install it or set dispatch to 'pi'."` No fallback to pi — an explicit dispatch choice should fail explicitly.

### Output Parsing

Claude Code's `--output-format stream-json` emits newline-delimited JSON events. These must be mapped to `SingleResult` and the TUI update callbacks so that Claude-dispatched agents show real-time progress like pi-dispatched agents.

The final event in the stream is a `result` object:

```json
{
    "type": "result",
    "subtype": "success",
    "result": "...",
    "is_error": false,
    "stop_reason": "end_turn",
    "total_cost_usd": 0.124,
    "duration_ms": 27266,
    "num_turns": 3,
    "usage": {
        "input_tokens": 3,
        "output_tokens": 4,
        "cache_read_input_tokens": 0,
        "cache_creation_input_tokens": 19863
    }
}
```

Intermediate streaming events (assistant messages, tool calls) should be mapped to `currentResult.messages` for TUI progress. The exact intermediate event schema should be verified during implementation by inspecting Claude Code's `stream-json` output.

The result event maps to `SingleResult`:
- `result` → `finalOutput` (the agent's text response)
- `is_error` / `subtype` → `exitCode` (0 for success, 1 for error)
- `usage` → mapped to `UsageStats`
- `total_cost_usd` → `usage.cost`
- `num_turns` → `usage.turns`

### Interaction with Existing Features

**Model fallback:** `withModelFallback` wraps `runSingleAgent`. Fallback operates within the same dispatch target — if the primary model fails via `claude`, fallback models also dispatch via `claude`. The fallback wrapper doesn't need to know about dispatch.

**Depth guard:** Dispatch-agnostic. The `PI_SUBAGENT_DEPTH` / `PI_SUBAGENT_MAX_DEPTH` env vars are set in the child process regardless of which CLI is spawned.

**Arg building:** The existing `buildAgentArgs()` in `agent-args.ts` builds pi-specific args. A parallel `buildClaudeArgs()` function handles Claude-specific arg construction. The dispatch branch in `runSingleAgent()` calls the appropriate builder.

### Extensibility

The `dispatch` field is a string, not a boolean. This accommodates future dispatch targets (e.g., `codex-cli`) without schema changes. Each new target requires:

1. An invocation function (how to find/spawn the CLI)
2. An arg builder (how to translate the agent config to the target CLI's args)
3. An output parser (how to map the target CLI's streaming events to `SingleResult`)

## Module Structure

Changes touch these files:

| File | Change |
|---|---|
| `agents.ts` | Add `dispatch` and `permissionMode` to `AgentConfig`, parse from frontmatter |
| `claude-args.ts` | **New.** `stripProviderPrefix()`, `buildClaudeArgs()`, `parseClaudeStreamEvent()`, `parseClaudeResult()` |
| `claude-args.test.ts` | **New.** Unit tests for the above |
| `index.ts` | Branch on `dispatch` in `runSingleAgent()`, add `getClaudeInvocation()`, add `dispatch`/`permissionMode` to schemas |

### What doesn't change
- `agent-args.ts` — remains pi-specific arg builder
- `depth-guard.ts` — dispatch-agnostic, no changes needed
- `model-fallback.ts` — dispatch-agnostic, no changes needed
- `agents/` — builtin agent definitions unchanged
- `prompts/` — chain prompts unchanged

## In Scope

- Add `dispatch` and `permissionMode` support to the subagent extension, with Claude Code as the first non-pi dispatch target
- Real-time TUI progress via stream-json parsing
- Unit tests for Claude-specific arg building and output parsing

## Not In Scope

- Layer 2: `model-tiers.json` dispatch map and skill SKILL.md changes (separate repo)
- Codex CLI dispatch — the design accommodates it, but implementation is future work
- Native Claude Code `--fallback-model` support (extension has its own fallback wrapper; Claude Code's built-in fallback is a possible future simplification for claude-dispatched tasks)

## Assumption

Agent system prompts (coder, planner, plan-reviewer, code-reviewer, code-refiner) work without modification when run in Claude Code. They describe what to do, not which tools to call by name. If any prompt references pi-specific tool names, that would need a follow-up fix.
