---
name: implementation
description: Implement an approved plan or a clear request safely: small steps, follow conventions, test after each step, verify before finishing.
---
# Implementation

1. If there is a plan, load it into `todo_write` and work through it in order, one item `in_progress` at a time.
2. **Read before you edit.** Match the surrounding code's style, naming, error handling and comment density. Reuse existing helpers instead of adding new ones.
3. **Make focused edits** with `edit_file`. Do not reformat unrelated code, rename things you were not asked to, or add speculative features.
4. **Verify after each meaningful step**: run the build, linter and the relevant tests with `bash`. Fix failures at the root cause; never weaken or delete a test to make it pass.
5. **Handle edge cases**: empty input, errors, concurrency, large inputs, security-sensitive paths. No secrets in code.
6. **Review your own diff** (`git diff`) before finishing for bugs, leftovers (debug prints, TODOs) and missing tests.
7. **Report**: what changed (files), what you verified (commands and results), what you did not do, and any risks. Do not claim something works unless you ran it.

Work on a branch, commit in logical units with clear messages, and ask before pushing.
