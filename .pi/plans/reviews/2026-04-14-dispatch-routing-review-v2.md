# Dispatch Routing Plan Review

## Overall

The revision is much stronger. A repo scan shows the plan now covers every current skill/prompt file that actually contains `subagent { ... }` dispatches:

- `agent/skills/execute-plan/SKILL.md`
- `agent/skills/generate-plan/SKILL.md`
- `agent/skills/refine-code/SKILL.md`
- `agent/skills/refine-code/refine-code-prompt.md`
- `agent/skills/requesting-code-review/SKILL.md`

The verification counts and fallback edits are also mostly aligned with the current files:
- **Task 2** count is correct: `execute-plan` has 2 subagent blocks / 3 call entries.
- **Task 3** count is correct: `generate-plan` has 3 subagent call blocks.
- **Task 4** target text exists: the fallback edge case is present in `refine-code/SKILL.md`.
- **Task 5** count is correct: `refine-code-prompt.md` has 2 subagent blocks and 4 bolded “Dispatch” prose lines.
- The fallback wording updates in **Tasks 3 and 4** are sensible and match real file locations.

## Findings

### Error — Task 6 is still under-scoped for a standalone skill

**Task 6** only adds `dispatch` to the example block in `agent/skills/requesting-code-review/SKILL.md` (current block at lines 49–53), but the skill currently has **no model-matrix read step, no dispatch-resolution instructions, and no default/fallback guidance**.

That makes it inconsistent with the plan’s own architecture (“each skill resolves the dispatch target alongside the model tier”) and with the existing patterns used in `execute-plan`, `generate-plan`, and `refine-code`.

Concretely, after Task 6 as written, the skill would say:

```md
dispatch: "<dispatch for model>"
```

but nowhere explain how to derive that value. The surrounding prose at current lines 46–57 would still only say “Use a capable-tier model...”.

**Recommendation:** Expand Task 6 to add a small “resolve capable model + dispatch from `model-tiers.json`” instruction block, or explicitly cross-reference the canonical algorithm in execute-plan Step 6 and state the default-to-`"pi"` behavior. Also update the prose around the example, not just the code block.

### Warning — File range metadata is still inconsistent in Tasks 4 and 5

The “Files” line ranges do not fully cover the edits described later in the tasks:

- **Task 4** declares `agent/skills/refine-code/SKILL.md:29-63`, but Step 3 edits the Edge Cases section at current line ~85.
- **Task 5** declares `agent/skills/refine-code/refine-code-prompt.md:28-76`, but Steps 7 and 8 edit current lines ~108 and ~118.

This does not block execution, but it is an internal inconsistency in the plan.

**Recommendation:** Broaden those file ranges or remove the narrow ranges so they match the actual touched sections.

### Suggestion — Task 6 lacks the verification parity the other tasks now have

Tasks 2–5 each include an explicit verification/search step tied to actual counts. **Task 6** only has acceptance criteria. Since `requesting-code-review/SKILL.md` currently contains exactly one subagent block, this is easy to verify explicitly and would make the plan more uniform.

**Recommendation:** Add a quick verification step for Task 6, e.g. search for `subagent {` in that file and confirm the single block includes `dispatch:`.

## Verdict

The plan is **close**: coverage of dispatching files is now complete, and the verification/fallback details are mostly corrected. The remaining blocker is that **Task 6 still does not make `requesting-code-review` actionable as a standalone dispatch-routing skill**.

**[Issues Found]**
