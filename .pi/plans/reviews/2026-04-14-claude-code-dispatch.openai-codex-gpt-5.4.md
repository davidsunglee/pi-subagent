# Review: 2026-04-14-claude-code-dispatch

- Plan: `.pi/plans/2026-04-14-claude-code-dispatch.md`
- Spec: `.pi/designs/2026-04-14-claude-code-dispatch-design.md`
- Reviewer agent: `plan-reviewer`
- Model: `openai-codex/gpt-5.4`

## Strengths
- The plan is well-structured around the main design seams: agent discovery, Claude-specific arg building, execution wiring, and tool schema updates.
- File targeting is mostly accurate and maps cleanly to the spec’s module structure.
- The plan usefully calls out two implementation unknowns from the spec (`--system-prompt` behavior and actual `stream-json` event shapes) and includes an upfront verification step for them.
- Precedence handling for invocation-time overrides vs. frontmatter defaults is covered in the task descriptions.

## Issues

1. **Error — Required Claude stream-event parsing is deferred instead of planned**
   - **References:** Task 2 Steps 6–8; Task 3 Step 5
   - Task 2 only plans tests/implementation for `stripProviderPrefix`, `buildClaudeArgs`, and `parseClaudeResult`.
   - Task 3 Step 5 explicitly leaves intermediate Claude events as `TODO` / “post-MVP enhancement”.
   - The spec makes this part of the in-scope behavior, not a follow-up:
     - `claude-args.ts` is supposed to include `parseClaudeStreamEvent()`
     - intermediate assistant/tool events should be mapped into `currentResult.messages`
     - real-time TUI progress via `stream-json` parsing is in scope
   - As written, the plan would only surface the final result, so it does not fully cover the spec’s required output parsing behavior.

2. **Error — Dependency graph for Task 4 is incorrect**
   - **References:** Dependencies section; Task 3 Step 6; Task 4 Step 4
   - The Dependencies section says **Task 4 depends on: Task 1**.
   - But Task 4 Step 4 updates all `runSingleAgentWithFallback(...)` call sites to pass `dispatch` and `permissionMode`, while Task 3 Step 6 is where `runSingleAgentWithFallback` actually gains those parameters.
   - If someone executes the plan in the declared dependency order, Task 4 cannot stand alone after Task 1; it also depends on Task 3 to remain buildable/type-correct.

3. **Warning — Verification only covers single-mode dispatch, not the new parallel/chain override paths**
   - **References:** Task 4 Step 4; Verification section
   - Task 4 Step 4 adds new threading logic for:
     - single-mode top-level overrides
     - per-task overrides in parallel mode
     - per-step overrides in chain mode
   - The Verification section only exercises a single-mode example:
     - `subagent { agent: "scout", ..., dispatch: "claude" }`
   - That leaves the newly introduced parallel/chain precedence paths unverified. This is not a structural blocker, but it is a meaningful spec-coverage gap in the acceptance plan.

## Verdict
[Issues Found]
