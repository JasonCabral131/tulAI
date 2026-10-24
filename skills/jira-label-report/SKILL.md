---
name: jira-label-report
description: Build a high-level progress report from Jira issues grouped by labels, for a manager or stakeholder.
---
# High-level report by Jira labels

Inputs: the labels the user named (and optionally a project, sprint or date range). If Tulai already pasted Jira data in the request, use it. Otherwise use `jira_api`; if it is not connected, use the `browser` tool to open Jira and read the filtered list (the user may need to sign in once in the Browser tab; if so, say so and stop).

1. Query: `labels in ("a","b") ORDER BY status` (add `AND project = KEY` if given). Fields: summary, status, statusCategory, assignee, priority, duedate, labels, issuetype, updated.
2. For each label: total, done, in progress, to do, blocked/at risk, overdue. Compute percent complete.
3. Write the report for a non-technical reader, in this order: **Headline** (one sentence: overall progress and mood: on track / at risk / behind), **Progress by label** (a small table), **Highlights** (what finished), **Risks and blockers** (with issue keys and owners), **Next steps** (2 to 4 concrete items with owners).
4. Keep it to one page. Use outcomes, not ticket jargon. Include issue keys only where they help someone act.
5. Offer to copy it to a note, an email draft or a Confluence-style page. Do not create or edit Jira issues unless asked.
