---
name: get-shit-done
description: Spec-driven delivery workflow (idea -> requirements -> roadmap -> small planned phases -> atomic tasks -> verification) using a .planning/ folder as durable memory.
---
# Get Shit Done

Durable state lives in `.planning/` so any fresh session can resume cold. Keep files short and factual.

```
.planning/
  PROJECT.md        vision, users, constraints, tech choices
  REQUIREMENTS.md   v1 must-haves (testable), v2 later, out of scope
  ROADMAP.md        phases; each has a goal and success criteria
  STATE.md          current phase, done, decisions, blockers, NEXT ACTION  (auto-loaded every session)
  phases/NN-name/PLAN.md      2-5 atomic tasks
  phases/NN-name/SUMMARY.md   what shipped, deviations, verification
```

## Principles
- **Small plans, fresh context.** A plan has 2-5 tasks, each finishable and verifiable on its own. Never carry a huge context; resume from STATE.md.
- **Atomic tasks.** Each task lists: files, the action, a `verify` command, and `done` criteria. One task = one commit (`feat(phase-01): ...`).
- **Verify, never assume.** Run the verify command and read the output before marking a task done. Check results against the phase's success criteria, working backwards from the goal.
- **Decide, don't dither.** Make reasonable choices, record them in STATE.md, and move on. Ask the user only about things that change scope.
- **No scope creep.** New ideas go to REQUIREMENTS.md under v2, not into the current phase.

## Commands (prompts the app provides)
- **new**: ask at most 5 sharp questions, then write PROJECT, REQUIREMENTS, ROADMAP, STATE; `git init` if needed; commit.
- **plan <phase>**: read the roadmap and code (use `task` for broad research), write the phase PLAN.md, check it covers every success criterion.
- **execute <phase>**: do tasks in order; verify; commit; update STATE.md after each task; write SUMMARY.md at the end.
- **verify <phase>**: goal-backward check against success criteria, run tests, list gaps as new tasks.
- **status**: summarise STATE.md and the next action.
- **quick <task>**: for small jobs: short plan, implement, verify, commit, one-line STATE note.
