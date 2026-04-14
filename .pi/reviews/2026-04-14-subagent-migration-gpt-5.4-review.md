# Code Review: Subagent Migration Changes

- **Reviewer:** `reviewer` subagent on `gpt-5.4`
- **Repo:** `pi-subagent`
- **Range:** `5a32ec0e328fd7e3428280bf93b7d8bc5de85c49..5a6ae0a5b55ebbf6723cfd535762a65de5653298`
- **Spec:** `../pi-config/docs/superpowers/specs/2026-04-14-subagent-migration-design.md`
- **Plan:** `../pi-config/docs/superpowers/plans/2026-04-14-subagent-migration.md`

## Strengths

- Nice refactor direction: `agent-args.ts`, `depth-guard.ts`, and `model-fallback.ts` make the new behavior easier to reason about and unit test.
- Per-task `model`/`thinking` plumbing is cleanly threaded through single + parallel execution while leaving chain schema unchanged.
- `mergeAgentsByPriority()` and builtin discovery are straightforward and the agent parsing tests are thorough for the happy-path/frontmatter cases.

## Issues

### Critical (Must Fix)

1. **Depth guard blocks `maxSubagentDepth: 0` agents from launching at all**
   - **File:** `index.ts:269-280`, `depth-guard.ts:31-47`, `test/depth-guard.test.ts:67-70,93-96`
   - **What's wrong:** The depth guard is applied to the target agent before spawn, using that agent’s `maxSubagentDepth`. That means an agent configured with `maxSubagentDepth: 0` is blocked from being invoked at all, including the spec’s documented `code-refiner -> code-reviewer/coder` case.
   - **Why it matters:** This contradicts the approved design’s example that `code-refiner (1)` can dispatch `code-reviewer/coder (0)`, while those children simply cannot recurse further. As implemented, those children never launch. The current tests codify the wrong behavior.
   - **How to fix:** Make an agent’s depth setting govern its ability to spawn descendants, not whether it may itself be launched. Clamp/pass the child’s inherited budget in env on spawn, and add an end-to-end test for `code-refiner(1) -> code-reviewer(0)`.

2. **`Infinity`/`NaN` handling can silently disable the recursion guard**
   - **File:** `depth-guard.ts:22-25,33-36,53-56`, `index.ts:328-336`, `test/depth-guard.test.ts:42-43`
   - **What's wrong:** When no limit is set, `effectiveMaxDepth` becomes `Infinity`, which is serialized into `PI_SUBAGENT_MAX_DEPTH`. In the child, `parseInt("Infinity", 10)` becomes `NaN`, so later checks compare against `NaN` and the guard effectively stops working. This also misses the design’s stated default of `2`.
   - **Why it matters:** In the common unconfigured case, the safety guard silently disables itself instead of protecting against runaway recursion.
   - **How to fix:** Normalize env parsing with `Number.isFinite`, apply a real finite default, and never write `Infinity`/`NaN` into env. If unbounded behavior is truly desired, omit the env var instead of serializing `Infinity`.

### Important (Should Fix)

1. **Retryable error detection is narrower than the design requires**
   - **File:** `model-fallback.ts:53-63`
   - **What's wrong:** `isRetryableError()` only matches rate-limit/capacity-style failures. The approved design also calls out transient auth/network failures, but common transport errors like `ECONNRESET`, `ETIMEDOUT`, `socket hang up`, and `network error` are not covered.
   - **Why it matters:** Model fallback will not activate for a meaningful class of transient provider failures, so resilience is weaker than specified.
   - **How to fix:** Expand the retryable classifier and add tests for transient network/provider outage cases. If auth failure is meant to be retryable only for specific provider-side messages, encode those explicitly.

2. **Fallback attempt history is not surfaced in results**
   - **File:** `index.ts:145-157,429-449`, `model-fallback.ts:18-47`
   - **What's wrong:** Fallback attempt history is not exposed anywhere in the tool result. The code only preserves a final `model`, and if all fallbacks fail it returns the original result without visibility into which fallbacks were attempted.
   - **Why it matters:** This misses an explicit observability requirement from the design and makes production debugging much harder.
   - **How to fix:** Add a field like `modelAttempts` or `fallbackTrace` to `SingleResult` and populate it inside the fallback wrapper.

### Minor (Nice to Have)

1. **`thinking` values are not validated**
   - **File:** `agents.ts:17,67`, `index.ts:456,475`
   - **What's wrong:** `thinking` is treated as an arbitrary string in both frontmatter and tool params, even though the design constrains it to `off|minimal|low|medium|high|xhigh`.
   - **Why it matters:** Invalid values are forwarded to the subprocess and fail late instead of being validated locally.
   - **How to fix:** Use a typed union/enum in `AgentConfig` and schema validation for tool inputs/frontmatter.

## Recommendations

- Add integration tests around `index.ts` that mock subprocess spawning and verify:
  - single/parallel pass `--model` and `--thinking`
  - chain mode remains unchanged
  - fallback is used in all three dispatch modes
  - the documented recursion scenario works
- Add malformed-env tests for `PI_SUBAGENT_DEPTH` / `PI_SUBAGENT_MAX_DEPTH` such as `abc`, `Infinity`, and `NaN`.
- Attach Task 7 verification evidence separately; this review did not find repo evidence of the baseline plus `generate-plan` / `execute-plan` / `refine-code` reruns.

## Assessment

**Ready to merge:** No

**Reasoning:** The override/refactor work is solid, but the recursion guard currently does not implement the approved behavior and can silently disable itself. That is a core safety feature, so this is not production-ready until corrected and revalidated.
