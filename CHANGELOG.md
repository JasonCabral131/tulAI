# Changelog

## Unreleased

## 1.1.0 (2026-10-10)
- Installer: Tulai.dmg with a drag-to-Applications window; first launch opens a setup window (bot progress ring) that downloads the local AI. Source code is compiled, not readable in the app.
- Background browser: sign in once per account (Outlook, Google, Teams, any site); Tulai reads mail, Teams and pages in the background, searches mail by topic, one live browser per account with Inspect. Read-only.
- Memory skills for the local AI (recall, 'not saved', newest note wins, no secrets, saved style) with a 10-case memory check (trained model: 10/10); add your own examples and checks, or download a public GitHub training pack. Passwords, keys and card numbers are never saved.
- Warnings and confirmations in Settings, Train your local bot AI: before Restore previous model, Switch and Train you see what each model passed and whether it has the memory skills.
- Fixes: reminder spam from empty calendar slots, 'listen to my meetings' starts meeting notes, 'read the text in that image' explains the screenshot, clicking the Tulai icon always opens Tulai Desktop, right-click the robot to hide it.

## 1.0.0
- Two separate programs: Tulai Desktop (company AI) and Tulai Bot (local models, always on).
- Voice: whisper large-v3-turbo on device, "Hey Tulai" with mishearing recovery, a local language model that understands and decides, follow-up questions without repeating the wake word, echo protection.
- Work tools: Jira, GitLab, calendar reading (Outlook/Google/Teams) in a background browser, reminders, meeting notes (microphone and the Mac's sound, so it works with a headset), skills for MR review, Jira reports by label, standup, email triage, meeting minutes.
- Robot: 3D bot with 25 moves and feelings, memory-pressure smoke.
- Production hardening: local API guard against other websites, owner-only secrets, engine supervisor, error log, health panel, `npm run verify` and `npm run smoke`.
