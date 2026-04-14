# Review

- Range: `004ddd6..HEAD`
- Plan: `.pi/plans/2026-04-14-claude-code-dispatch.md`
- Spec: `.pi/designs/2026-04-14-claude-code-dispatch-design.md`
- Reviewer agent: `code-reviewer`
- Model: `openai-codex/gpt-5.4`

## Strengths
- `dispatch` / `permissionMode` are threaded through agent discovery and all three invocation modes consistently (`agents.ts`, `index.ts`).
- Runtime validation and the explicit ENOENT message for missing Claude Code are good additions.
- The new helper-level test coverage in `test/claude-args.test.ts` is thorough for arg construction and validation paths.

## Findings

1. **Medium — Claude dispatch drops per-agent tool restrictions, which changes agent safety/behavior semantics.**  
   `buildClaudeArgs()` accepts `agentTools` but explicitly ignores them and never forwards any tool restriction to Claude (`claude-args.ts:37-45`, `claude-args.ts:110-117`). That is a real regression for agents whose frontmatter is intentionally constrained, e.g. `planner` is read-only (`agents/planner.md:2-10`) and `reviewer` explicitly says not to mutate files or run builds (`agents/reviewer.md:2-11`). With `dispatch: "claude"`, those agents now get full Claude tool access instead of their configured subset.

2. **Medium — The Claude stream parser/rendering path does not satisfy the “real-time progress” requirement for tool activity.**  
   The parser only passes through top-level `assistant` events (`claude-args.ts:124-128`), and the renderer only understands pi-style assistant content parts with `type === "toolCall"` (`index.ts:180-188`). Claude stream-json emits tool invocations/results in different shapes, so Claude-dispatched runs will not show tool calls/results in the TUI even though that was a key requirement. The tests currently lock in this incomplete behavior by only asserting assistant/system handling (`test/claude-args.test.ts:260-293`).

3. **Minor — Claude result parsing loses actionable error text and misreports usage totals.**  
   `parseClaudeResult()` sets `error` from `subtype` instead of the human-readable `result` payload (`claude-args.ts:135-160`), and `runSingleAgent()` threads that value directly into `errorMessage` (`index.ts:392-416`). On failures, users will see opaque labels like `error_tool` instead of the actual explanation. The same parser also computes `contextTokens` as `input + cacheRead + cacheWrite`, omitting output tokens (`claude-args.ts:150-157`), and the tests codify that incorrect behavior (`test/claude-args.test.ts:383-416`), so Claude usage stats will be misleading.

4. **Minor — The highest-risk Claude execution path has no direct tests.**  
   Most of the new behavior lives in `runSingleAgent()` and the single/parallel/chain threading (`index.ts:246-467`, `index.ts:656-692`, `index.ts:789-923`), but the added tests only cover frontmatter parsing and helper functions (`test/agents.test.ts:1-183`, `test/claude-args.test.ts:1-419`). There is no test exercising dispatch precedence, per-mode override threading, ENOENT handling, or end-to-end Claude stream/result parsing. That gap already shows up in the parser mismatches above.

## Assessment
Ready to merge: With fixes
