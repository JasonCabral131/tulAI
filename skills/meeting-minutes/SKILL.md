---
name: meeting-minutes
description: Turn meeting notes or a transcript into clear minutes: summary, decisions, action items with owners, open questions, and Jira ticket drafts.
---
# Meeting minutes

Input: a notes file path from Tulai (read it with `read_file`), or notes pasted in the chat. Tulai's transcripts come from speech recognition, so fix obvious mishearings from context and mark anything uncertain with "(?)".

Write, in this order:
1. **Summary**: 3 to 5 sentences: purpose, main discussion, outcome.
2. **Decisions**: bullet list, each with who decided if known.
3. **Action items**: a table with action, owner, due date (write "unspecified" when none was said). Do not invent owners or dates.
4. **Open questions and risks**.
5. **Next meeting / follow-ups** if mentioned.

Then offer: "Want me to draft Jira tickets for the action items?" If yes, show a draft for each (title, description, labels, assignee guess) and only create them in Jira (`jira_api` POST) after the user approves. Offer to save the minutes into the Tulai Meetings folder.
