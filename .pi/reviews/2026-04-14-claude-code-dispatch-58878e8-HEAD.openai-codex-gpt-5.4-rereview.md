# Hybrid Re-Review (`58878e8..HEAD`)

- Prior re-review: `.pi/reviews/2026-04-14-claude-code-dispatch-6a5bf05-HEAD.openai-codex-gpt-5.4-rereview.md`
- Addendum: `.pi/reviews/2026-04-14-claude-code-dispatch-6a5bf05-HEAD.openai-codex-gpt-5.4-rereview-addendum.md`
- Plan: `.pi/plans/2026-04-14-claude-code-dispatch.md`
- Spec: `.pi/designs/2026-04-14-claude-code-dispatch-design.md`
- Reviewer agent: `code-reviewer`
- Model: `openai-codex/gpt-5.4`

## Finding Status

### 1. `ls` mapping to Claude `Bash`, widening read-only agent tool permissions
**Status: Resolved**

The remediation changes the Claude tool mapping for `ls` from `Bash` to `Glob` in `PI_TO_CLAUDE_TOOLS` (`claude-args.ts:11-18`). Those mapped tools are what `buildClaudeArgs()` forwards into `--allowedTools` (`claude-args.ts:126-135`).

That closes the permission-widening issue for read-only agents such as `planner`, which still declares only `read, grep, find, ls` in frontmatter (`agents/planner.md:1-5`). Under the current code, Claude dispatch no longer turns `ls` access into arbitrary shell execution.

### 2. Claude tool-call names not normalized for the existing formatter / TUI rendering path
**Status: Partially Resolved**

The remediation now lowercases Claude tool names when converting `tool_use` blocks into pi-style `toolCall` parts (`claude-args.ts:152-155`). That fixes formatter matching for tools whose formatter cases already exist in lowercase, such as `bash`, `read`, `write`, `edit`, and `grep` (`index.ts:78-127`).

However, the normalization is still incomplete for Claude `Glob` calls:

- current mapping sends both `find` and `ls` to Claude `Glob` (`claude-args.ts:17-18`)
- the display pipeline forwards the parsed tool name as-is into rendering (`index.ts:182-188`)
- `formatToolCall()` has cases for `ls` and `find`, but no case for `glob` (`index.ts:78-127`)

So Claude `Glob` tool activity still falls back to the generic formatter instead of the existing specialized `ls` / `find` rendering path.

## Regressions / New Issues Introduced by This Remediation Diff

No additional regressions identified in `58878e8..HEAD` beyond the still-open partial normalization gap for Claude `Glob` tool calls described above.

## Assessment

Ready to merge: With fixes

Item 1 is fixed. Item 2 is improved but not fully closed because `Glob` tool calls still do not normalize onto the existing `ls` / `find` formatter path.
