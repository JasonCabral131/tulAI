---
name: harness
description: Design, build or improve an LLM agent harness (tool loop, tools, permissions, context management, error recovery, evals).
---
# Agent harness design

**Loop**: send messages + tool schemas, stream the reply, execute requested tools, append results, repeat until the model stops calling tools. Cap iterations, honour cancellation everywhere, and always return a result for every tool call (even errors) so history stays valid.

**Tools**: few, sharp and composable (read, search, edit, run, fetch). Clear names, strict JSON schemas, descriptions that say when *not* to use them. Return concise, actionable errors with hints ("old_string matches 3 times; add context"). Truncate large outputs with a note.

**Permissions**: classify tools (read-only / edits / execute / network). Ask before side effects, with a preview (diff, command). Enforce hard deny rules in code regardless of mode (protected paths, dangerous commands, workspace-only writes). Offer modes: ask, accept-edits, plan (read-only), full-auto.

**Context**: keep history valid and small. Trim old tool output, drop old images, summarise long sessions, load instructions (CLAUDE.md, skills) on demand rather than all up front. Delegate broad exploration to sub-agents with fresh context.

**Reliability**: retry transient failures with backoff, detect repeated identical calls, continue cut-off replies, time out stalled streams, snapshot files before edits so changes can be undone.

**Observability and evals**: log every tool call and result, show progress to the user, and keep a small suite of scripted scenarios (mock model + real tools) that you rerun after every change.
