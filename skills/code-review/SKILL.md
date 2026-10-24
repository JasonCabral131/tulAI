---
name: code-review
description: Review code or a diff for bugs, security issues, and maintainability; read-only.
---
# Code review

Read the change (`git diff`, `git status`) and the surrounding code it touches. Do not modify files.

Check, in order: **correctness** (logic, off-by-one, null/empty, error paths, concurrency), **security** (input validation, injection, authz, secrets, unsafe deserialization), **data safety** (migrations, deletes, irreversible actions), **tests** (coverage of new behaviour and edge cases), **performance** (N+1, unbounded loops or memory), **maintainability** (naming, duplication, dead code, consistency with the codebase).

Report findings by severity (blocker / should fix / nit). For each: file and line, what is wrong, why it matters, a concrete fix. Skip style opinions that the project's linter does not enforce. End with a one-line verdict.
