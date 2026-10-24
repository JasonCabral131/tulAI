---
name: mr-review
description: Review someone's open merge requests (GitLab) or pull requests: correctness, security, tests, risk, with a clear verdict. Read-only unless asked to comment.
---
# Merge request review

Use `gitlab_api` for GitLab (or `github_api` for GitHub). Reads are automatic. If neither is connected, say how to connect it in Settings → Work tools and stop.

1. Find the MRs: if Tulai listed them in the request, use those project ids and iids. Otherwise `GET /api/v4/merge_requests?state=opened&scope=all&author_username=NAME` (look the person up with `GET /api/v4/users?search=NAME` first if you only have a name).
2. For each MR read the description and the changes: `GET /api/v4/projects/ID/merge_requests/IID/changes`. Also check `GET .../discussions` for open comments and the pipeline status when present.
3. Review like a careful senior engineer. In order: **correctness** (logic, edge cases, error paths), **security** (input validation, authz, secrets, injection), **data and migrations**, **tests** (is the change covered? what is missing?), **performance and complexity**, **readability and consistency with the surrounding code**. Quote the file and line for each finding.
4. Per MR give: a one-line summary of what it does, findings grouped as **Blocker / Should fix / Nit**, test gaps, and a verdict: **Approve**, **Approve with comments** or **Request changes**, with the reason in one sentence.
5. Never post comments, approve, or merge on your own. At the end offer: "Want me to draft the review comments for you to post?" and only post after the user says yes (that needs their approval).
6. If a diff is very large, say what you did not read.
