# Re-review: Claude Code Dispatch Plan

- Plan: `.pi/plans/2026-04-14-claude-code-dispatch.md`
- Spec: `.pi/designs/2026-04-14-claude-code-dispatch-design.md`
- Initial review: `.pi/plans/reviews/2026-04-14-claude-code-dispatch.openai-codex-gpt-5.4.md`
- Validation review: `.pi/plans/reviews/2026-04-14-claude-code-dispatch.openai-codex-gpt-5.4.validation.md`
- Reviewer agent: `plan-reviewer`
- Model: `openai-codex/gpt-5.4`

## Strengths
- The revised plan now covers the main spec seams end-to-end: frontmatter parsing, Claude-specific arg/result handling, execution branching, schema threading, and multi-mode verification.
- Previously missing runtime validation is now explicitly planned, which materially improves buildability and failure behavior.

## Prior findings status

| Prior finding | Source | Status | Evidence from current plan | Assessment |
|---|---|---:|---|---|
| Required Claude stream-event parsing was deferred instead of planned | Initial review | **Resolved** | **Task 2 Step 6** adds failing tests for `parseClaudeStreamEvent`; **Task 2 Step 7** implements `parseClaudeStreamEvent`; **Task 2 Step 8** runs those tests; **Task 3 Step 5** maps intermediate Claude `stream-json` events into `currentResult.messages` and calls `emitUpdate()`; **Verification / Single mode** requires “TUI renders real-time progress from intermediate events.” | The plan now explicitly includes both the parser and the execution-path wiring required by the spec’s in-scope real-time TUI progress behavior. |
| Dependency graph for Task 4 was incorrect | Initial review | **Resolved** | **Dependencies** now says **“Task 4 depends on: Task 1, Task 3”**; **Task 3 Step 6** adds `dispatch` / `permissionMode` parameters to `runSingleAgentWithFallback`; **Task 4 Step 4** updates call sites to pass them. | The sequencing problem is fixed. Task 4 now correctly depends on the task that changes the called function signature. |
| Verification only covered single-mode dispatch, not parallel/chain override paths | Initial review | **Resolved** | **Verification / Single mode** covers top-level `dispatch: "claude"`; **Verification / Parallel mode** covers mixed per-task overrides; **Verification / Chain mode** covers top-level inheritance plus per-step behavior. | The acceptance section now exercises the exact override/inheritance paths introduced by **Task 4 Step 4**. |
| Runtime validation was mentioned but not actually planned | Validation review | **Resolved** | **Task 1 Step 2** now explicitly points to runtime validation in **Task 3 Step 3½**; **Task 3 Step 3½** validates both `dispatch` and, when `dispatch === "claude"`, `permissionMode`, returning structured errors for invalid values. | This closes the prior gap. The plan now clearly specifies where and how invalid values are rejected. |

## Remaining gaps / newly introduced issues

### Suggestion — system-prompt verification example does not explicitly test file-path behavior
- **References:** **Task 2 Step 1**, **Task 2 Step 4**, **Spec / System Prompt**
- **Observation:**  
  **Task 2 Step 1** says to verify whether Claude’s `--system-prompt` accepts a file path or inline text, but the sample command only exercises inline text. Since **Task 2 Step 4** and **Task 3 Step 4** currently thread a temp prompt path, an explicit file-path check would make this verification tighter.
- **Severity rationale:**  
  This is not a blocker because the plan already acknowledges the uncertainty and says to adjust implementation accordingly, but the verification instruction could be more directly aligned with the implementation path.

## Overall verdict

All previously identified findings are now addressed. I do not see any remaining blocking plan defects.

The plan appears ready to execute, with only the minor verification tightening suggestion above.

**[Approved]**
