# Validation Review: 2026-04-14-claude-code-dispatch

- Plan: `.pi/plans/2026-04-14-claude-code-dispatch.md`
- Spec: `.pi/designs/2026-04-14-claude-code-dispatch-design.md`
- Prior review: `.pi/plans/reviews/2026-04-14-claude-code-dispatch.openai-codex-gpt-5.4.md`
- Reviewer agent: `plan-reviewer`
- Model: `openai-codex/gpt-5.4`

All three files were reviewed in full.

## Prior findings status

| Prior finding | Status | Evidence from current plan | Reasoning |
|---|---|---|---|
| **1. Required Claude stream-event parsing was deferred instead of planned** | **Resolved** | **Task 2 Step 6** adds failing tests for `parseClaudeStreamEvent`; **Task 2 Step 7** implements `parseClaudeStreamEvent`; **Task 2 Step 8** runs tests; **Task 3 Step 5** explicitly maps intermediate Claude `stream-json` events into `currentResult.messages` and calls `emitUpdate()`; **Verification / Single mode** requires that “TUI renders real-time progress from intermediate events.” | The prior gap was that only final-result parsing was planned. The current plan now explicitly covers both the parser implementation and the execution-path wiring needed for real-time TUI progress, matching the spec’s in-scope output parsing behavior. |
| **2. Dependency graph for Task 4 was incorrect** | **Resolved** | **Dependencies** now states: “**Task 4 depends on: Task 1, Task 3**”; **Task 3 Step 6** adds `dispatch` and `permissionMode` parameters to `runSingleAgentWithFallback`; **Task 4 Step 4** updates call sites to pass those parameters. | This directly fixes the earlier sequencing problem. Task 4 now correctly depends on the task that first changes `runSingleAgentWithFallback(...)`, so the declared order is buildable/type-correct. |
| **3. Verification only covered single-mode dispatch, not parallel/chain override paths** | **Resolved** | **Verification / Single mode** tests top-level `dispatch: "claude"`; **Verification / Parallel mode** tests mixed per-task overrides (`dispatch: "claude"` and `dispatch: "pi"` in the same call); **Verification / Chain mode** tests top-level dispatch inheritance plus per-step behavior. | The acceptance plan now exercises the exact override/inheritance paths introduced in **Task 4 Step 4**, so the prior spec-coverage gap is closed. |

## Remaining gaps / newly identified issues

### Warning — Runtime validation is mentioned but not actually planned
- **References:** **Task 1 Step 2**, **Task 3 Step 3**, **Task 3 Step 4**
- **Problem:**  
  **Task 1 Step 2** says there is “No validation at parse time — `runSingleAgent` validates when it uses the values.” But the later implementation steps do not actually plan that validation.
- **Why this matters:**  
  In the current task breakdown:
  - **Task 3 Step 3** only resolves `effectiveDispatch` / `effectivePermissionMode`
  - **Task 3 Step 4** branches on `effectiveDispatch === "claude"` and otherwise falls through to the pi path
  - no step explicitly rejects unsupported `dispatch` values
  - no step explicitly validates `permissionMode` before passing it to Claude
- **Risk:**  
  Unsupported values could be silently accepted, routed to the wrong CLI, or fail only indirectly when the Claude CLI rejects them.

## Overall verdict

All prior review findings are now addressed.

However, there is still one remaining validation gap, so I would not call the plan fully ready yet without adding explicit runtime validation for supported `dispatch` / `permissionMode` values.

**[Issues Found]**
