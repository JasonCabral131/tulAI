---
name: daily-standup
description: Prepare the user's daily standup and day plan from Jira, merge requests, meetings and recent commits.
---
# Daily standup and plan

Gather what you can (skip a source that is not connected, and say which you skipped):
1. **Jira**: `jira_api` open issues assigned to the user (`assignee = currentUser() AND statusCategory != Done`) and issues they moved to Done in the last day (`assignee = currentUser() AND status changed to Done AFTER -1d`).
2. **Merge requests**: `gitlab_api` the user's open MRs (`state=opened&scope=created_by_me`) and MRs waiting for their review (`reviewer_username` / `scope=assigned_to_me`).
3. **Meetings**: `calendar_events` for today.
4. **Commits**: if a workspace is set, `git log --since=yesterday --author=<git user.name> --oneline` with `bash`.

Write it in the classic three parts, short enough to read aloud in under a minute:
- **Yesterday**: what was finished.
- **Today**: the 3 most important things, in order, each tied to an issue key or MR. Put anything overdue or blocking others first. Note meetings that eat time.
- **Blockers**: anything waiting on someone else, with the name.

Then add a one-line suggestion for where to start. Do not change Jira or GitLab.
