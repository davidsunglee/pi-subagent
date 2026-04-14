# Claude Code Dispatch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable the pi-subagent extension to dispatch tasks via the Claude Code CLI instead of pi, controlled by a `dispatch` property in agent frontmatter and tool params.

**Architecture:** `runSingleAgent()` branches on `dispatch` to choose between pi and claude arg building, invocation, and output parsing. A new `claude-args.ts` module handles Claude-specific concerns (model translation, arg building, stream event parsing) parallel to the existing `agent-args.ts` for pi.

**Tech Stack:** TypeScript, pi extension API (`@mariozechner/pi-coding-agent`), Claude Code CLI, node:child_process

**Source:** TODO-97a8b7b4
**Spec:** `.pi/designs/2026-04-14-claude-code-dispatch-design.md`

---

## File Structure

- Modify: `agents.ts` — add `dispatch` and `permissionMode` to `AgentConfig`, parse from frontmatter
- Create: `claude-args.ts` — model translation, Claude CLI arg building, stream event parsing, result parsing
- Create: `test/claude-args.test.ts` — unit tests for the above
- Modify: `index.ts` — branch on `dispatch` in `runSingleAgent`, add `getClaudeInvocation`, add `dispatch`/`permissionMode` to all schemas

## Dependencies

- Task 2 depends on: Task 1
- Task 3 depends on: Task 2
- Task 4 depends on: Task 1, Task 3

---

### Task 1: Add dispatch and permissionMode to agent discovery

**Files:**
- Modify: `agents.ts`
- Modify: `test/agents.test.ts`

**Model recommendation:** cheap

- [ ] **Step 1: Add fields to AgentConfig interface**

In `agents.ts`, add `dispatch` and `permissionMode` to the `AgentConfig` interface, after `fallbackModels`:

```typescript
export interface AgentConfig {
    name: string;
    description: string;
    tools?: string[];
    model?: string;
    thinking?: string;
    maxSubagentDepth?: number;
    fallbackModels?: string[];
    dispatch?: string;         // "pi" | "claude" — default: "pi"
    permissionMode?: string;   // "bypassPermissions" | "auto" | "plan" — default: "bypassPermissions"
    systemPrompt: string;
    source: "user" | "project" | "builtin";
    filePath: string;
}
```

- [ ] **Step 2: Parse new fields from frontmatter**

In `loadAgentsFromDir()`, after the existing `fallbackModels` parsing block (line ~75-78), add:

```typescript
const dispatch = frontmatter.dispatch?.trim() || undefined;
const permissionMode = frontmatter.permissionMode?.trim() || undefined;
```

And add both fields to the `agents.push({...})` call:

```typescript
agents.push({
    // ... existing fields ...
    dispatch,
    permissionMode,
    systemPrompt: body,
    source,
    filePath,
});
```

No validation at parse time — `runSingleAgent` validates `dispatch` and `permissionMode` at runtime before branching (see Task 3 Step 3½).

- [ ] **Step 3: Add tests for new frontmatter fields**

In `test/agents.test.ts`, add a test that verifies parsing frontmatter with `dispatch: claude` and `permissionMode: plan` produces the correct `AgentConfig` values.

- [ ] **Step 4: Run tests**

```bash
node --experimental-strip-types --test test/agents.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add agents.ts test/agents.test.ts
git commit -m "feat(agents): add dispatch and permissionMode to AgentConfig"
```

---

### Task 2: Create Claude Code dispatch utilities

**Files:**
- Create: `claude-args.ts`
- Create: `test/claude-args.test.ts`

**Model recommendation:** standard

This task creates the Claude-specific counterpart to `agent-args.ts`. It handles model name translation, CLI argument construction, intermediate stream event parsing for TUI progress, and parsing of Claude Code's final result.

- [ ] **Step 1: Verify Claude Code CLI behavior**

Before writing code, verify two things by running `claude` manually:

1. **`--system-prompt` flag**: does it accept a file path or inline text?
   ```bash
   echo "test" | claude -p --system-prompt "You are helpful." --output-format stream-json --no-session-persistence 2>&1 | head -20
   ```

2. **stream-json event format**: what events are emitted?
   ```bash
   echo "Say hello" | claude -p --output-format stream-json --no-session-persistence 2>&1
   ```

3. **`--system-prompt` with a file path**: does it read the file or treat the path as literal text?
   ```bash
   echo "You are a pirate." > /tmp/test-sysprompt.txt && echo "Introduce yourself in one sentence." | claude -p --system-prompt /tmp/test-sysprompt.txt --output-format stream-json --no-session-persistence 2>&1 | head -20 && rm /tmp/test-sysprompt.txt
   ```

Record the actual event shapes. The implementation below assumes the shapes described in the spec — adjust if they differ.

- [ ] **Step 2: Write failing tests for stripProviderPrefix**

Create `test/claude-args.test.ts`:

```typescript
import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import { stripProviderPrefix, isValidDispatch, isValidPermissionMode } from "../claude-args.ts";

describe("stripProviderPrefix", () => {
    it("strips anthropic/ prefix", () => {
        assert.equal(stripProviderPrefix("anthropic/claude-opus-4-6"), "claude-opus-4-6");
    });

    it("strips any provider prefix", () => {
        assert.equal(stripProviderPrefix("openai-codex/gpt-5.4"), "gpt-5.4");
    });

    it("returns model as-is when no prefix", () => {
        assert.equal(stripProviderPrefix("claude-opus-4-6"), "claude-opus-4-6");
    });

    it("returns undefined for undefined model", () => {
        assert.equal(stripProviderPrefix(undefined), undefined);
    });
});
```

Run, verify they fail (module not found).

- [ ] **Step 3: Write failing tests for isValidDispatch, isValidPermissionMode, and buildClaudeArgs**

Add tests for `isValidDispatch` and `isValidPermissionMode`. Key cases:

- `isValidDispatch("pi")` → true
- `isValidDispatch("claude")` → true
- `isValidDispatch("typo")` → false
- `isValidDispatch("")` → false
- `isValidPermissionMode("bypassPermissions")` → true
- `isValidPermissionMode("auto")` → true
- `isValidPermissionMode("plan")` → true
- `isValidPermissionMode("garbage")` → false

Add tests for `buildClaudeArgs`. Key cases:

- Builds basic args with model and permission mode
- Strips provider prefix from model
- Defaults permissionMode to `"bypassPermissions"`
- Omits `--model` when model is undefined
- Includes `--system-prompt` when system prompt is provided
- Ignores `tools` (not passed to claude CLI)
- Translates `thinking` levels to claude `--effort` levels (off/minimal/low→low, medium→medium, high→high, xhigh→max)

- [ ] **Step 4: Implement stripProviderPrefix and buildClaudeArgs**

Create `claude-args.ts`:

```typescript
/**
 * Claude Code CLI dispatch utilities.
 *
 * Handles model translation, CLI argument building, validation, and output
 * parsing for dispatching subagent tasks via the `claude` CLI instead of `pi`.
 */

const VALID_DISPATCH_VALUES = new Set(["pi", "claude"]);
const VALID_PERMISSION_MODES = new Set(["bypassPermissions", "auto", "plan"]);

export function isValidDispatch(value: string): boolean {
    return VALID_DISPATCH_VALUES.has(value);
}

export function isValidPermissionMode(value: string): boolean {
    return VALID_PERMISSION_MODES.has(value);
}

/**
 * Strip the provider prefix from a pi-normalized model string.
 * "anthropic/claude-opus-4-6" → "claude-opus-4-6"
 */
export function stripProviderPrefix(model: string | undefined): string | undefined {
    if (!model) return undefined;
    const slashIndex = model.indexOf("/");
    return slashIndex !== -1 ? model.substring(slashIndex + 1) : model;
}

const THINKING_TO_EFFORT: Record<string, string> = {
    off: "low",
    minimal: "low",
    low: "low",
    medium: "medium",
    high: "high",
    xhigh: "max",
};

export interface BuildClaudeArgsInput {
    agentModel?: string;
    agentThinking?: string;
    agentTools?: string[];    // ignored — claude has all tools built in
    modelOverride?: string;
    thinkingOverride?: string;
    permissionMode?: string;
    systemPromptPath?: string;
}

export interface BuildClaudeArgsResult {
    args: string[];
    effectiveModel?: string;
    error?: string;
}

/**
 * Build CLI arguments for a Claude Code subprocess.
 * Resolution order for model: tool call override > agent frontmatter > omit (claude default)
 */
export function buildClaudeArgs(input: BuildClaudeArgsInput): BuildClaudeArgsResult {
    const args: string[] = ["-p", "--output-format", "stream-json", "--no-session-persistence"];

    const effectiveModel = stripProviderPrefix(input.modelOverride ?? input.agentModel);
    if (effectiveModel) {
        args.push("--model", effectiveModel);
    }

    args.push("--permission-mode", input.permissionMode || "bypassPermissions");

    // Translate pi thinking level to claude effort level
    const effectiveThinking = input.thinkingOverride ?? input.agentThinking;
    if (effectiveThinking) {
        const effort = THINKING_TO_EFFORT[effectiveThinking];
        if (effort) args.push("--effort", effort);
    }

    if (input.systemPromptPath) {
        args.push("--system-prompt", input.systemPromptPath);
    }

    return { args, effectiveModel };
}
```

Note: The exact `--system-prompt` usage (file path vs inline text) depends on Step 1 verification. Adjust accordingly.

- [ ] **Step 5: Run tests to verify stripProviderPrefix and buildClaudeArgs pass**

```bash
node --experimental-strip-types --test test/claude-args.test.ts
```

- [ ] **Step 6: Write failing tests for parseClaudeStreamEvent**

Add tests for mapping Claude Code's intermediate stream events to message objects for TUI progress. Key cases:

- Parses an `assistant` event into a message with role "assistant" and text content
- Parses a `tool_use` event into a message with tool_use content block
- Parses a `tool_result` event into a message with tool_result content block
- Returns `undefined` for unknown/system event types
- Handles missing fields gracefully

- [ ] **Step 7: Implement parseClaudeStreamEvent**

Add to `claude-args.ts`:

```typescript
export interface ClaudeStreamEvent {
    type: string;
    [key: string]: any;
}

/**
 * Parse an intermediate Claude Code stream-json event into a message
 * suitable for currentResult.messages and TUI progress updates.
 * Returns undefined for events that don't map to user-visible messages.
 */
export function parseClaudeStreamEvent(event: ClaudeStreamEvent): Record<string, any> | undefined {
    if (event.type === "assistant") {
        return {
            role: "assistant",
            content: [{ type: "text", text: event.message || "" }],
        };
    }
    if (event.type === "tool_use") {
        return {
            role: "assistant",
            content: [{ type: "tool_use", id: event.tool_use_id, name: event.name, input: event.input }],
        };
    }
    if (event.type === "tool_result") {
        return {
            role: "tool",
            content: [{ type: "tool_result", tool_use_id: event.tool_use_id, content: event.content }],
        };
    }
    return undefined;
}
```

Note: The exact event type names and shapes depend on Step 1 verification of `stream-json` output. Adjust field names accordingly.

- [ ] **Step 8: Run tests to verify parseClaudeStreamEvent passes**

```bash
node --experimental-strip-types --test test/claude-args.test.ts
```

- [ ] **Step 9: Write failing tests for parseClaudeResult**

Add tests for mapping Claude Code's result JSON to `SingleResult`-compatible fields. Key cases:

- Parses successful result (exitCode 0, extracts usage, cost, turns)
- Parses error result (exitCode 1, extracts error message)
- Handles missing/empty usage gracefully (defaults to 0)

- [ ] **Step 10: Implement parseClaudeResult**

Add to `claude-args.ts`:

```typescript
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
 * Parse Claude Code's final result JSON into structured fields.
 */
export function parseClaudeResult(json: Record<string, any>): ClaudeResult {
    const isError = json.is_error === true || json.subtype === "error";
    const resultText = (json.result as string) || "";
    const usage = json.usage || {};

    const claudeUsage: ClaudeUsage = {
        input: usage.input_tokens || 0,
        output: usage.output_tokens || 0,
        cacheRead: usage.cache_read_input_tokens || 0,
        cacheWrite: usage.cache_creation_input_tokens || 0,
        cost: json.total_cost_usd || 0,
        contextTokens: (usage.input_tokens || 0) + (usage.output_tokens || 0),
        turns: json.num_turns || 0,
    };

    return {
        exitCode: isError ? 1 : 0,
        finalOutput: resultText,
        usage: claudeUsage,
        error: isError ? resultText : undefined,
        model: json.model,
    };
}
```

- [ ] **Step 11: Run all tests**

```bash
node --experimental-strip-types --test test/claude-args.test.ts
```

All should pass.

- [ ] **Step 12: Commit**

```bash
git add claude-args.ts test/claude-args.test.ts
git commit -m "feat: add Claude Code dispatch utilities

Model translation, arg building, stream event parsing, and result
parsing for spawning the claude CLI instead of pi."
```

---

### Task 3: Wire dispatch into subagent execution

**Files:**
- Modify: `index.ts`

**Model recommendation:** capable

This is the core wiring task. `runSingleAgent` branches on `dispatch` to use either the pi path (existing) or the claude path (new).

- [ ] **Step 1: Add getClaudeInvocation function**

In `index.ts`, alongside the existing `getPiInvocation` (line ~224), add:

```typescript
function getClaudeInvocation(args: string[]): { command: string; args: string[] } {
    return { command: "claude", args };
}
```

- [ ] **Step 2: Import claude-args utilities**

Add to the imports at the top of `index.ts`:

```typescript
import { buildClaudeArgs, parseClaudeStreamEvent, parseClaudeResult, isValidDispatch, isValidPermissionMode } from "./claude-args.js";
```

- [ ] **Step 3: Resolve dispatch in runSingleAgent**

In `runSingleAgent()`, add `dispatch` and `permissionMode` parameters to the function signature (after `thinkingOverride`):

```typescript
async function runSingleAgent(
    defaultCwd: string,
    agents: AgentConfig[],
    agentName: string,
    task: string,
    cwd: string | undefined,
    step: number | undefined,
    signal: AbortSignal | undefined,
    onUpdate: OnUpdateCallback | undefined,
    makeDetails: (results: SingleResult[]) => SubagentDetails,
    modelOverride?: string,
    thinkingOverride?: string,
    dispatch?: string,
    permissionMode?: string,
): Promise<SingleResult> {
```

After the agent is found and depth check passes (after line ~282), resolve the effective dispatch:

```typescript
const effectiveDispatch = dispatch || agent.dispatch || "pi";
const effectivePermissionMode = permissionMode || agent.permissionMode || "bypassPermissions";
```

- [ ] **Step 3½: Validate dispatch and permissionMode**

After resolving effective values, validate them before branching. Return a structured error for unsupported values (same pattern as `buildAgentArgs` uses for invalid thinking levels):

```typescript
if (!isValidDispatch(effectiveDispatch)) {
    return {
        ...currentResult,
        exitCode: 1,
        errorMessage: `Invalid dispatch value: "${effectiveDispatch}". Valid values: pi, claude`,
        stopReason: "error",
    } as SingleResult;
}

if (effectiveDispatch === "claude" && !isValidPermissionMode(effectivePermissionMode)) {
    return {
        ...currentResult,
        exitCode: 1,
        errorMessage: `Invalid permissionMode: "${effectivePermissionMode}". Valid values: bypassPermissions, auto, plan`,
        stopReason: "error",
    } as SingleResult;
}
```

Note: `permissionMode` is only validated when `dispatch` is `"claude"` because it is ignored for pi dispatch.

- [ ] **Step 4: Branch on dispatch for arg building and spawning**

After validation, branch the arg building and spawn logic. The existing pi code path stays as the `else` branch:

```typescript
if (effectiveDispatch === "claude") {
    // Claude Code dispatch path
    const { args: claudeArgs, effectiveModel, error: argsError } = buildClaudeArgs({
        agentModel: agent.model,
        agentThinking: agent.thinking,
        agentTools: agent.tools,
        modelOverride,
        thinkingOverride,
        permissionMode: effectivePermissionMode,
        systemPromptPath: tmpPromptPath ?? undefined,
    });

    if (argsError) {
        // return structured error (same pattern as pi path)
    }

    currentResult.model = effectiveModel;
    claudeArgs.push(`Task: ${task}`);

    const invocation = getClaudeInvocation(claudeArgs);
    // spawn + stream parsing (see Step 5)
} else {
    // Existing pi dispatch path (unchanged)
}
```

Note: The temp prompt file is written before the branch (the existing code at lines 330-335 already does this). Move it before the branch point so both paths can use it.

- [ ] **Step 5: Implement Claude Code stream parsing**

The Claude spawn + parsing block follows the same structure as the pi path but parses Claude Code's `stream-json` events:

```typescript
const exitCode = await new Promise<number>((resolve) => {
    const childEnv = buildChildEnv(depthCheck.currentDepth, depthCheck.effectiveMaxDepth, agent.maxSubagentDepth);
    const proc = spawn(invocation.command, invocation.args, {
        cwd: cwd ?? defaultCwd,
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, ...childEnv },
    });
    let buffer = "";

    const processLine = (line: string) => {
        if (!line.trim()) return;
        let event: any;
        try { event = JSON.parse(line); } catch { return; }

        if (event.type === "result") {
            const parsed = parseClaudeResult(event);
            currentResult.usage = parsed.usage;
            currentResult.model = parsed.model || currentResult.model;
            if (parsed.error) {
                currentResult.errorMessage = parsed.error;
                currentResult.stopReason = "error";
            }
            // Build a synthetic assistant message for getFinalOutput()
            currentResult.messages.push({
                role: "assistant",
                content: [{ type: "text", text: parsed.finalOutput }],
                // ... minimal Message fields
            });
            emitUpdate();
        } else {
            // Intermediate events (assistant, tool_use, tool_result) —
            // map to messages for real-time TUI progress
            const msg = parseClaudeStreamEvent(event);
            if (msg) {
                currentResult.messages.push(msg as any);
                emitUpdate();
            }
        }
    };

    // Same stdout buffering, stderr capture, close/error handlers,
    // and signal handling as the pi path
    // ...
});
```

Handle the ENOENT case in the `error` handler:

```typescript
proc.on("error", (error) => {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        currentResult.stderr = "Claude Code CLI not found. Install it or set dispatch to 'pi'.";
    } else {
        currentResult.stderr = error instanceof Error ? error.message : String(error);
    }
    resolve(1);
});
```

- [ ] **Step 6: Update runSingleAgentWithFallback to pass dispatch**

Add `dispatch` and `permissionMode` parameters to `runSingleAgentWithFallback` and forward them to `runSingleAgent`:

```typescript
async function runSingleAgentWithFallback(
    // ... existing params ...
    modelOverride?: string,
    thinkingOverride?: string,
    dispatch?: string,
    permissionMode?: string,
): Promise<SingleResult> {
    const agent = agents.find((a) => a.name === agentName);
    return withModelFallback(
        (overrideModel) => runSingleAgent(
            defaultCwd, agents, agentName, task, cwd, step, signal, onUpdate, makeDetails,
            overrideModel ?? modelOverride, thinkingOverride,
            dispatch, permissionMode,
        ),
        agent?.fallbackModels,
    );
}
```

- [ ] **Step 7: Commit**

```bash
git add index.ts
git commit -m "feat: wire dispatch branching into runSingleAgent

Branches on dispatch value to spawn either pi or claude CLI.
Claude path uses buildClaudeArgs for arg construction and
parseClaudeResult for stream-json output parsing."
```

---

### Task 4: Add dispatch and permissionMode to tool schemas and call sites

**Files:**
- Modify: `index.ts`

**Model recommendation:** standard

This task adds the `dispatch` and `permissionMode` fields to the tool's parameter schemas and threads them through all call sites.

- [ ] **Step 1: Add dispatch and permissionMode to SubagentParams**

```typescript
const SubagentParams = Type.Object({
    // ... existing fields ...
    dispatch: Type.Optional(Type.String({ description: 'CLI to spawn: "pi" (default) or "claude"' })),
    permissionMode: Type.Optional(Type.String({ description: 'Claude Code permission mode: "bypassPermissions" (default), "auto", or "plan"' })),
});
```

- [ ] **Step 2: Add dispatch and permissionMode to TaskItem**

```typescript
const TaskItem = Type.Object({
    agent: Type.String({ description: "Name of the agent to invoke" }),
    task: Type.String({ description: "Task to delegate to the agent" }),
    model: Type.Optional(Type.String({ description: "Model override (takes precedence over agent frontmatter)" })),
    thinking: Type.Optional(Type.String({ description: "Thinking level override: off, minimal, low, medium, high, xhigh" })),
    cwd: Type.Optional(Type.String({ description: "Working directory for the agent process" })),
    dispatch: Type.Optional(Type.String({ description: 'CLI to spawn: "pi" (default) or "claude"' })),
    permissionMode: Type.Optional(Type.String({ description: 'Claude Code permission mode' })),
});
```

- [ ] **Step 3: Add dispatch and permissionMode to ChainItem**

```typescript
const ChainItem = Type.Object({
    agent: Type.String({ description: "Name of the agent to invoke" }),
    task: Type.String({ description: "Task with optional {previous} placeholder for prior output" }),
    cwd: Type.Optional(Type.String({ description: "Working directory for the agent process" })),
    dispatch: Type.Optional(Type.String({ description: 'CLI to spawn: "pi" (default) or "claude"' })),
    permissionMode: Type.Optional(Type.String({ description: 'Claude Code permission mode' })),
});
```

- [ ] **Step 4: Thread dispatch through all call sites**

Update every call to `runSingleAgentWithFallback` to forward `dispatch` and `permissionMode`:

**Single mode:**
```typescript
const result = await runSingleAgentWithFallback(
    ctx.cwd, agents, params.agent, params.task, params.cwd, undefined, signal, onUpdate,
    makeDetails("single"), params.model, params.thinking,
    params.dispatch, params.permissionMode,
);
```

**Parallel mode** (inside `mapWithConcurrencyLimit`):
```typescript
const result = await runSingleAgentWithFallback(
    ctx.cwd, agents, t.agent, t.task, t.cwd, undefined, signal,
    (partial) => { /* per-task update callback */ },
    makeDetails("parallel"), t.model, t.thinking,
    t.dispatch || params.dispatch, t.permissionMode || params.permissionMode,
);
```

**Chain mode:**
```typescript
const result = await runSingleAgentWithFallback(
    ctx.cwd, agents, step.agent, taskWithContext, step.cwd, i + 1, signal, chainUpdate,
    makeDetails("chain"),
    undefined, undefined, // chain doesn't support per-step model/thinking override
    step.dispatch || params.dispatch, step.permissionMode || params.permissionMode,
);
```

- [ ] **Step 5: Update tool description**

Add a line to the description array:

```typescript
'Set dispatch: "claude" to run via Claude Code CLI instead of pi.',
```

- [ ] **Step 6: Run all tests**

```bash
node --experimental-strip-types --test test/*.test.ts
```

All existing tests should still pass (dispatch defaults to pi, no behavior change).

- [ ] **Step 7: Commit**

```bash
git add index.ts
git commit -m "feat: add dispatch/permissionMode to tool schemas

SubagentParams, TaskItem, and ChainItem all accept optional dispatch
and permissionMode fields. Per-task overrides in parallel mode,
per-step overrides in chain mode."
```

---

## Verification

After all tasks are complete, verify end-to-end with real Claude Code dispatch across all three modes:

**Single mode:**
```bash
# In a pi session:
subagent { agent: "scout", task: "List the top-level files in the current directory", dispatch: "claude" }
```
Verify: the task runs via `claude` CLI, returns results, TUI renders real-time progress from intermediate events, usage stats are populated.

**Parallel mode:**
```bash
subagent {
  parallel: [
    { agent: "scout", task: "List files in src/", dispatch: "claude" },
    { agent: "scout", task: "List files in test/", dispatch: "pi" }
  ]
}
```
Verify: both tasks complete, the first dispatches via `claude`, the second via `pi`. Per-task dispatch overrides work correctly.

**Chain mode:**
```bash
subagent {
  chain: [
    { agent: "scout", task: "List the top-level files", dispatch: "claude" },
    { agent: "scout", task: "Summarize this file listing: {previous}" }
  ],
  dispatch: "claude"
}
```
Verify: both steps dispatch via `claude`. The second step inherits `dispatch` from the top-level param. Chain context (`{previous}`) passes through correctly.

## Test Command

```bash
node --experimental-strip-types --test test/*.test.ts
```

## Risk Assessment

| Risk | Mitigation |
|---|---|
| Claude Code `stream-json` event schema differs from assumed | Task 2 Step 1 verifies before coding; parser adjusted accordingly |
| `--system-prompt` flag behavior differs (file vs inline) | Task 2 Step 1 verifies; buildClaudeArgs adapted to actual behavior |
| Claude Code CLI not installed on dev machine | ENOENT handler returns clear error; pi dispatch path is default and unchanged |
| `thinking` → `effort` mapping is lossy (6 levels to 4) | Mapping is documented in spec; off/minimal/low all map to `low`, which is acceptable — fine-grained thinking control is a pi-specific feature |
| Existing tests break from new params | New params are optional with safe defaults; all existing call sites unchanged unless explicitly updated |

## Rollback

All changes are additive. Removing the `dispatch` parameter from tool calls reverts to pi dispatch (the default). No existing agent definitions or skills are modified.
