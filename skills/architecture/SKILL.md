---
name: architecture
description: Design or review system architecture; use for new systems, major refactors, tech choices, or "how should this be structured" questions.
---
# Architecture

1. **Clarify** goals, users, scale, constraints (team, deadline, existing stack, compliance). State assumptions you cannot confirm.
2. **Map what exists**: read the repo (entry points, modules, data stores, external services, deploy config). Draw the real structure, not the intended one.
3. **Define components and boundaries**: responsibilities, owned data, public interfaces, dependencies. Keep coupling low and dependencies pointing one way.
4. **Trace key flows** end to end (request path, data write path, failure path, auth path).
5. **Generate 2-3 options.** For each: how it works, what it costs (complexity, ops, money), what it makes easy and hard. Use a comparison table.
6. **Recommend one** with the deciding reasons and what would change your mind.
7. **Cover the non-functionals**: failure modes, security, observability, performance limits, data migration, rollback.
8. **Output** a short design doc: context, decision, diagram (Mermaid in a fenced block), components, risks, phased rollout. Record the decision as an ADR if the repo keeps them.

Prefer boring, proven technology and the smallest design that meets the stated needs. Never design for scale nobody asked for.
