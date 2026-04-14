# Final Re-review: Subagent Migration Remediation Validation

- **Reviewer:** `reviewer` subagent on `gpt-5.4`
- **Repo:** `pi-subagent`
- **Prior re-review:** `.pi/reviews/2026-04-14-subagent-migration-gpt-5.4-rereview.md`
- **Validation range:** `f860b8aad4066209d8efa9e3211bc9786cadde42..004ddd6`

## Finding Status

### 1) Retryable error detection is narrower than the design requires
- **Status:** Fixed
- **Evidence:**
  - `model-fallback.ts:78-86` now covers transport failures plus transient auth/provider-style cases including `ECONNRESET`, `ETIMEDOUT`, `ECONNREFUSED`, `socket hang up`, `network error`, `fetch failed`, `unauthorized.*retry`, `401.*temporarily`, and `auth.*token.*expired`.
  - `test/model-fallback.test.ts:67-78` adds explicit transient-auth positive cases and permanent-auth negative cases.
- **Notes:** This closes the remaining retry-classifier gap from the prior re-review.

### 2) `thinking` values are not validated
- **Status:** Fixed
- **Evidence:**
  - `agents.ts:30,69-70` sanitizes frontmatter so only whitelisted thinking levels are retained.
  - `agent-args.ts:38-44` validates runtime/tool-input values.
  - `index.ts:284-300` turns invalid values into structured errors instead of forwarding them to the subprocess.
  - `test/agents.test.ts:58-85` and `test/agent-args.test.ts:90-106` cover the sanitization and validation behavior.
- **Notes:** Validation is runtime-based rather than schema-enforced in `index.ts`, but the original issue is resolved: invalid values no longer pass through and fail late in the child process.

### 3) Invalid `thinking` values can throw before structured error handling
- **Status:** Fixed
- **Evidence:**
  - `agent-args.ts:38-44` now returns an error object instead of throwing.
  - `index.ts:284-300` detects that error and returns a normal failed `SingleResult`.
  - `test/agent-args.test.ts:90-106` covers the regression path.
- **Notes:** This removes the unhandled pre-`try` throw path identified in the prior re-review.

### 4) `PI_SUBAGENT_DEPTH` is still not sanitized
- **Status:** Fixed
- **Evidence:**
  - `depth-guard.ts:21-25` now parses `PI_SUBAGENT_DEPTH` defensively and falls back to `0` for malformed values.
  - `test/depth-guard.test.ts:27-39` covers `Infinity`, `NaN`, and non-numeric values.
- **Notes:** This addresses the malformed-env weakness called out in the prior re-review.

## New Issues

### Critical
- None found.

### Important
- None found.

### Minor
- None found.

## Assessment

**Ready to merge:** Yes

**Reasoning:** All unresolved items from the prior re-review are now addressed in code and backed by targeted tests. The validation range fixes the transient-auth fallback gap, completes `thinking` validation/sanitization, removes the pre-structured-error throw path, and sanitizes malformed `PI_SUBAGENT_DEPTH` values without introducing new issues.
