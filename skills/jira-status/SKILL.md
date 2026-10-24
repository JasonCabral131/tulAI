---
name: jira-status
description: Check the status of the user's Jira work (what is open, in progress, blocked, overdue) and say what needs attention.
---
# Jira status

Use `jira_api` (reads are automatic). If it says Jira is not connected, tell the user to add the address and token in Settings → Work tools, and stop.

1. Fetch the user's open issues: `GET /rest/api/3/search/jql?jql=assignee = currentUser() AND statusCategory != Done ORDER BY updated DESC&fields=summary,status,labels,priority,duedate,issuetype,project` (URL-encode the query). On Jira Server/Data Center use `/rest/api/2/search?jql=...`. If the user asked about "all" issues, a team, a project or a sprint, adjust the JQL (`project = X`, `sprint in openSprints()`, `assignee = "Name"`).
2. Group by status, then priority. Count each group.
3. Flag: overdue (`duedate` before today), high or highest priority not yet in progress, issues untouched for 7+ days, anything in a blocked-like status.
4. Answer with the headline first (for example "9 open: 4 in progress, 3 to do, 2 in review; 2 overdue"), then a short list of what needs attention today with the issue keys. Keep it scannable.
5. Never change an issue unless the user asks. If they do, show the exact change first and wait for approval.
