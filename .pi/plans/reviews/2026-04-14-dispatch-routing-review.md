# Dispatch Routing Plan Review

## Overall

The structure is good and most file targets are real, but there are a few blockers and several internal consistency issues.

## Findings

### 1) Error — missing `requesting-code-review` coverage

The plan updates `execute-plan`, `generate-plan`, and `refine-code`, but it **does not cover** `agent/skills/requesting-code-review/SKILL.md`.

That file currently has a direct subagent call:
- `agent/skills/requesting-code-review/SKILL.md:44-52`

It dispatches `code-reviewer` with a capable-tier model and no `dispatch:` field. So the goal “route Anthropic-model subagent calls through Claude Code CLI” would still be incomplete.

**Recommendation:** add a task for `agent/skills/requesting-code-review/SKILL.md` to resolve and pass `dispatch` there too.

### 2) Warning — `refine-code` fallback dispatch isn’t spelled out

Task 4 adds dispatch resolution for the initial `code-refiner` call, but it does **not** explicitly say what happens when the outer `refine-code` skill falls back from `standard` to `capable`.

That matters because today:
- `standard` is `openai-codex/gpt-5.4`
- `capable` is `anthropic/claude-opus-4-6`

So the `dispatch` target changes too.

**Recommendation:** mirror `generate-plan`’s fallback wording and explicitly say the fallback model must re-resolve dispatch.

### 3) Warning — Task 3 acceptance criteria count is wrong

Task 3 says:

> “All 4 subagent call examples include `dispatch`”

But `agent/skills/generate-plan/SKILL.md` currently has **3** actual subagent call blocks/examples:
- planner
- plan-reviewer
- planner

The fallback is text, not a fourth code example.

**Recommendation:** change the count to 3, or add a fourth explicit call example if you really want to count the retry path.

### 4) Warning — Task 5’s verification counts don’t match the file

Task 5 says there are:
- 2 subagent call blocks
- 2 `"Dispatch"` text references

But `refine-code-prompt.md` currently has **4** prose lines using `Dispatch` as the verb:
- iteration 1 code-reviewer
- remediator
- iteration 2..N code-reviewer
- final verification code-reviewer

The task only updates 2 of those prose lines, so the verification is internally inconsistent.

**Recommendation:** either update all 4 prose lines, or narrow the verification to the 2 lines you actually intend to change.

### 5) Minor — Task 2’s verification wording is a bit imprecise

Task 2 says to search for `subagent {` and confirm every occurrence has `dispatch:`.

That works loosely, but it’s slightly awkward because `execute-plan` has:
- 2 `subagent {` blocks
- 3 actual calls inside them

**Recommendation:** say “2 subagent blocks / 3 calls” to make the check clearer.

## Bottom line

Good plan skeleton, but I’d fix these before execution:

1. Add `requesting-code-review`
2. Tighten the fallback dispatch wording in `refine-code`
3. Fix the count mismatches in Tasks 3 and 5

**[Issues Found]**
