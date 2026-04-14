# Hybrid Re-Review (`6a5bf05..HEAD`)

- Prior review: `.pi/reviews/2026-04-14-claude-code-dispatch-004ddd6-HEAD.openai-codex-gpt-5.4.md`
- Plan: `.pi/plans/2026-04-14-claude-code-dispatch.md`
- Spec: `.pi/designs/2026-04-14-claude-code-dispatch-design.md`
- Reviewer agent: `code-reviewer`
- Model: `openai-codex/gpt-5.4`

## Strengths
- Claude-dispatched agents now at least forward tool restrictions into CLI args instead of ignoring them entirely (`index.ts:322-329`, `claude-args.ts:126-135`).
- Final result parsing is materially better: human-readable error text is preserved and output tokens are included in usage totals (`claude-args.ts:169-195`).

## Finding Status

### 1. Claude dispatch dropping per-agent tool restrictions
**Status: Partially Resolved**

- `runSingleAgent()` now passes `agent.tools` into `buildClaudeArgs()` (`index.ts:322-329`).
- `buildClaudeArgs()` now emits `--allowedTools` from those restrictions (`claude-args.ts:126-135`).

However, the new mapping still changes safety semantics for read-only agents:
- `PI_TO_CLAUDE_TOOLS` maps `ls` to `Bash` (`claude-args.ts:10-19`).
- The built-in `planner` agent is explicitly read-only and only declares `tools: read, grep, find, ls` (`agents/planner.md:2-10`).

So Claude dispatch no longer drops restrictions wholesale, but it still widens `planner` from directory listing to arbitrary shell execution.

### 2. Claude stream parser/rendering not satisfying real-time tool activity progress
**Status: Partially Resolved**

- The remediation now transforms `tool_use` blocks embedded inside assistant messages into pi-style `toolCall` parts (`claude-args.ts:149-159`).
- The existing TUI path already renders `toolCall` items (`index.ts:182-190`, `index.ts:1006-1012`).

But the implementation is still incomplete for the requirement:
- `parseClaudeStreamEvent()` still ignores every non-`assistant` event (`claude-args.ts:146-163`), so top-level `tool_use`, `tool_result`, or other progress events are still dropped.
- The display layer only understands `text` and `toolCall` items (`index.ts:180-190`), so there is still no explicit render path for tool results/progress beyond embedded assistant blocks.

### 3. Claude result parsing losing human-readable error text / misreporting usage totals
**Status: Resolved**

- `parseClaudeResult()` now uses `json.result` as the error text with subtype fallback (`claude-args.ts:182-195`).
- It also includes output tokens in `contextTokens` (`claude-args.ts:185-193`).
- `runSingleAgent()` continues to surface that parsed error/usage into the live result (`index.ts:392-417`).

This addresses both halves of the original finding.

## Regressions / New Issues Introduced by the Remediation Diff

- **Medium — `ls` now expands to `Bash` under Claude dispatch.**  
  `claude-args.ts:10-19` maps `ls` to `Bash`, and `claude-args.ts:126-135` forwards that into `--allowedTools`. For `planner`, that widens a read-only agent (`agents/planner.md:2-10`) into one with unrestricted shell access.

- **Minor — Claude tool-call names are not normalized for the existing formatter.**  
  `parseClaudeStreamEvent()` preserves Claude tool names as-is (`claude-args.ts:154`), while `formatToolCall()` only special-cases lowercase names like `"bash"`, `"read"`, `"grep"` (`index.ts:78-127`). Claude tool calls will therefore fall back to the generic renderer instead of the existing nicer per-tool formatting.

## Assessment
Ready to merge: With fixes

Findings 1 and 2 are improved but not fully closed; finding 3 is fixed.
