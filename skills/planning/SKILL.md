---
name: planning
description: Turn a request into a verified, step-by-step implementation plan before touching code; use for any multi-file or risky change.
---
# Planning

1. **Restate the goal** in one sentence and define "done" as checks you can run (tests pass, command output, behaviour you can observe).
2. **Explore first** (read-only): find the files, patterns, tests and conventions involved. Use the `task` tool for broad searches.
3. **List risks and unknowns**: breaking changes, data loss, security, performance, things you could not confirm. Ask the user only about decisions that change the plan.
4. **Write the plan** as ordered steps. Each step: the file(s), the change, and how you will verify it. Keep steps small enough to finish and check on their own. Put the riskiest step early.
5. **Test strategy**: which existing tests cover this, which new tests to add, which commands to run.
6. **Present it**: in plan mode call `exit_plan_mode` with the plan in markdown; otherwise show it and track it with `todo_write`.

A good plan is specific (real paths and names), minimal, and ordered so the project works after every step.
