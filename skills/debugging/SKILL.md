---
name: debugging
description: Find and fix the root cause of a bug, failing test or error; use before proposing any fix.
---
# Debugging

1. **Reproduce** the failure with the smallest command or test. If you cannot reproduce it, say so and gather more evidence instead of guessing.
2. **Read the evidence**: full error, stack trace, logs, recent changes (`git log -p`, `git diff`).
3. **Form hypotheses**, rank by likelihood, and test the cheapest first by reading code, adding a temporary log or running a targeted check.
4. **Find the root cause**, not the symptom. Explain why it happens in one or two sentences.
5. **Fix minimally** at the cause. Add a regression test that fails before the fix and passes after.
6. **Verify**: rerun the original repro, the new test and the wider suite. Remove temporary logging.
7. **Report** cause, fix, verification, and anything related you noticed but did not change.
