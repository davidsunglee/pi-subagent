# Re-review: Subagent Migration Remediation

- **Reviewer:** `reviewer` subagent on `gpt-5.4`
- **Repo:** `pi-subagent`
- **Prior review:** `.pi/reviews/2026-04-14-subagent-migration-gpt-5.4-review.md`
- **Remediation range:** `5a6ae0a5b55ebbf6723cfd535762a65de5653298..f860b8aad4066209d8efa9e3211bc9786cadde42`

## Finding Status

### 1) Depth guard blocks `maxSubagentDepth: 0` agents from launching at all
- **Status:** Fixed
- **Evidence:**
  - `index.ts:270` now calls `checkDepth(agentName)` without passing the child agent’s `maxSubagentDepth`.
  - `depth-guard.ts:39-49` checks only current depth vs parent max depth.
  - `index.ts:329` and `depth-guard.ts:61-76` apply `agent.maxSubagentDepth` when building child env, controlling the child’s descendants.
  - `test/depth-guard.test.ts:83-85` verifies a `maxSubagentDepth: 0` agent can be launched.
  - `test/depth-guard.test.ts:154-169` covers `orchestrator -> code-refiner(1) -> code-reviewer(0) -> blocked-from-recursing-further`.
- **Notes:** The semantics now match the intended design: the limit governs descendants, not whether the agent may itself be invoked.

### 2) `Infinity` / `NaN` handling can silently disable the recursion guard
- **Status:** Fixed
- **Evidence:**
  - `depth-guard.ts:9` introduces a finite default max depth of `2`.
  - `depth-guard.ts:28-32` normalizes `PI_SUBAGENT_MAX_DEPTH` and falls back to `2` for invalid values.
  - `depth-guard.ts:75-76` always writes numeric child env values.
  - `test/depth-guard.test.ts:29-53` covers unset, `Infinity`, `NaN`, non-numeric, and zero cases for `PI_SUBAGENT_MAX_DEPTH`.
- **Notes:** This fixes the prior failure mode where `"Infinity"` serialized into env and later parsed as `NaN`.

### 3) Retryable error detection is narrower than the design requires
- **Status:** Partially fixed
- **Evidence:**
  - `model-fallback.ts:69-83` now includes transport/network patterns such as `ECONNRESET`, `ETIMEDOUT`, `ECONNREFUSED`, `socket hang up`, `network error`, and `fetch failed`.
  - `test/model-fallback.test.ts:40-63` adds coverage for those network failures.
- **Notes:** The network/outage portion is fixed. Explicit transient-auth/provider-auth retry handling is still not clearly present in `model-fallback.ts:69-83`.

### 4) Fallback attempt history is not surfaced in results
- **Status:** Fixed
- **Evidence:**
  - `model-fallback.ts:5-16` adds `FallbackAttempt` and `modelAttempts`.
  - `model-fallback.ts:29-57` populates attempt history on success, early non-retryable exit, and exhausted fallbacks.
  - `index.ts:153-156` adds `modelAttempts` to `SingleResult`.
  - `index.ts:430-448` returns the `withModelFallback(...)` result through normal single-agent execution.
  - `test/model-fallback.test.ts:195-250` verifies `modelAttempts` for single-attempt success, fallback success, and exhausted fallbacks.
- **Notes:** This closes the original observability gap.

### 5) `thinking` values are not validated
- **Status:** Partially fixed
- **Evidence:**
  - `agent-args.ts:5-8` defines allowed thinking levels.
  - `agent-args.ts:36-40` validates `effectiveThinking` before adding `--thinking`.
  - `test/agent-args.test.ts:90-128` covers invalid and valid values.
  - `agents.ts:17,67` still stores `thinking` as a raw string from frontmatter.
  - `index.ts:457,476` still accept arbitrary `Type.String(...)` values for tool params.
- **Notes:** Validation exists at subprocess-arg construction time, but not yet at schema/frontmatter parse time.

## New Issues

### Important

1. **Invalid `thinking` values can throw before structured error handling**
   - **Evidence:**
     - `agent-args.ts:37-38` throws on invalid thinking.
     - `index.ts:284-290` calls `buildAgentArgs(...)` before the `try` block at `index.ts:316`.
     - `index.ts:457,476` still allow arbitrary string inputs, and `agents.ts:17,67` still allow arbitrary frontmatter strings.
   - **Why it matters:** A bad `thinking` value from tool params or agent frontmatter can reject execution outright instead of returning a structured `SingleResult` error.

### Minor

1. **`PI_SUBAGENT_DEPTH` is still not sanitized**
   - **Evidence:**
     - `depth-guard.ts:21-22` does a raw `parseInt(process.env.PI_SUBAGENT_DEPTH || "0", 10)` with no `Number.isFinite` fallback.
     - `test/depth-guard.test.ts` adds malformed-value tests for `PI_SUBAGENT_MAX_DEPTH`, but not for `PI_SUBAGENT_DEPTH`.
   - **Why it matters:** A malformed `PI_SUBAGENT_DEPTH` such as `Infinity`, `NaN`, or `abc` can still produce `NaN`, weakening the guard.

## Assessment

**Ready to merge:** With fixes

**Reasoning:** The two original critical issues are fixed, and fallback attempt tracing is now present. However, one original finding is only partially addressed, and the `thinking` validation remediation introduced a new important bug because invalid values can throw before structured error handling.
