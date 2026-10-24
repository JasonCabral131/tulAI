# Tulai training pack

Free training examples for the local Tulai AI. Every Tulai install can download this folder from GitHub and add it to its own local fine-tuning (Settings, Train your local bot AI, "Your own training", GitHub training pack).

**Files**

- `*.jsonl` – one JSON per line.
  - An example: `{"prompt":"who do I report to?","answer":"Your manager is Ana.","memory":["my manager is Ana"]}` (`memory` is optional: the notes Tulai has saved for that example).
  - A check (used to test a trained model, never trained on): `{"check":true,"prompt":"...","match":"words|or|pattern","not":"words it must not say","maxWords":20}`.
- `index.json` – the list of files with checksums. Make it with `node scripts/make-training-pack.js` and push it together with the files.

**Rules.** No passwords, keys, tokens or card numbers (they are dropped automatically). No private company data: this folder is public. Each install checks every file against its checksum and every row before using it; nothing is ever sent back to GitHub.
