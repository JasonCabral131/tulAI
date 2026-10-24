# How to run Tulai

Tulai is one Electron app that runs as two programs:

- **Tulai Desktop**: the chat app with the coding agent.
- **Tulai Bot**: the floating robot, voice, meeting notes and reminders. It answers with its own trained AI on this Mac.

Starting Desktop also starts the Bot. The source lives in `map-governance-ui/tools/extra/tulai/`: edit, test and deploy from there. The old `~/Desktop/gateway-chat` folder is no longer used.

## 1. What you need

- **Mac:** Apple Silicon (M1 or newer), recent macOS, about 10 GB free disk.
- **Node.js 22 or newer:** `brew install node`.
- **Homebrew:** setup uses it to install `llama.cpp` and `whisper-cpp` if they are missing.
- **Python 3:** only needed to train the bot's AI.
- **Company VPN:** only for Jira, GitLab and the company AI gateway.

## 2. First time setup

```bash
cd tools/extra/tulai
```

```bash
./setup.sh
```

`./setup.sh` is the same as `npm run setup`. It does five things:

1. Installs `llama.cpp` and `whisper-cpp` with Homebrew, if they are missing.
2. Downloads the speech and understanding models listed in `models.json`. Downloads resume if interrupted and are checked with sha256.
3. Runs `npm install`.
4. Installs the trainer.
5. Trains the bot's first brain, which takes about 10 minutes.

To skip the first training and do it later, use:

```bash
npm run setup -- --skip-first-training
```

Models, trained weights, `node_modules` and your private data are never committed. Every clone downloads or builds its own.

## 3. Run it from the source

Quit the installed `Tulai.app` first. Otherwise both copies try to use the same ports (39391 for Desktop, 39393 for the Bot).

```bash
npm start
```

To start only the Bot:

```bash
npx electron . --bot
```

To run a second copy next to the installed app, give it other ports:

```bash
TULAY_PORT=39491 TULAY_BOT_PORT=39493 npm start
```

Both copies keep their data in `~/Library/Application Support/gateway-chat/`: settings, chats, meeting notes and the trained brains.

## 4. Build the app

```bash
npm run build
```

`npm run build` creates `dist/mac-arm64/Tulai.app`. It downloads missing models, compiles the helpers (OCR, PDF text, listening) and bundles the engines into the app. Install the result with:

```bash
cp -R dist/mac-arm64/Tulai.app ~/Desktop/Tulai.app
```

To make an installer instead:

```bash
npm run dmg
```

The app is unsigned. On another Mac, right-click it and choose **Open** the first time.

## 5. First run checklist

Open **Settings → Diagnostics → Tulai health** and fix any red dot:

1. **Microphone:** allow it when macOS asks.
2. **Screen & System Audio Recording:** needed for meeting notes to hear other people while you wear a headset, and for Mac control.
3. **Settings → Connection:** your company AI gateway address and key. This is only for Tulai Desktop when you switch it to the company AI. The bot never uses it.
4. Optional: **Work tools** (Jira, GitLab), **Calendars**, **Chat apps**.

## 6. Check that everything works

```bash
npm run verify
```

`npm run verify` checks syntax and that every file gets packaged, then runs all tests. It needs no microphone, network or gateway.

To run the tests on their own:

```bash
npm test
```

On a fresh clone, two picture-reading tests fail until the helpers are built: run `npm run build` once.

## 7. Train the bot's AI

```bash
npm run training:setup
```

```bash
npm run training:skills
```

You can also say it in the bot chat:

- **"train your skills"** starts training.
- **"stop training"** stops it.
- **"keep training"** keeps it going.

How training works:

- **Base model:** Qwen2.5-3B, fine-tuned on this Mac with MLX LoRA.
- **Starts from the latest brain:** every round continues from the best brain so far. It never rebuilds from the base model.
- **Learns from mistakes:** each try practises on examples similar to the checks the previous try failed. The check questions themselves are never trained on.
- **Quality gate:** a new brain is switched on only if it passes every check. That means at least 85% overall, no skill pack under 80%, and 8/10 per pack.
- **When it stops:** once the brain in use passes every check, training stops. It starts again only for a newly selected skill pack, or when you say "keep training".
- **Safety:** a new round never starts while meeting notes are recording.

Trained brains are saved in `~/Library/Application Support/gateway-chat/training/runs/`. Training progress is logged in `training/chat-training.log` in that same folder.

## 8. Update the installed app from your source (developers)

```bash
zsh scripts/dev-patch-app.sh
```

`scripts/dev-patch-app.sh` copies the source into `~/Desktop/Tulai.app` and restarts it. It refuses to run while meeting notes are recording or a training check is running. `FORCE=1` overrides that; use it only if you really mean it.

## AI engines: choose which AI answers

Each window (Tulai Bot, Tulai Desktop) has its own choice. The default is always **our trained AI**: Qwen2.5-3B, fine-tuned on this Mac.

You can choose in **Settings → AI engines**, or say it in the chat:

| Say | What happens |
|---|---|
| `what models can I use` | Lists every engine and whether it is ready |
| `use claude` / `use chatgpt` / `use qwen` / `use gemini` | Your own subscription, through its official command-line tool |
| `log in to claude` (or `install codex`) | Opens a real terminal in the chat to log in or install |
| `use groq llama-3.3-70b-versatile` | A provider with an API key (key in Settings → AI engines) |
| `groq models` | Lists that provider's models |
| `search model qwen coder 7b` → `download 1` → `use Qwen2.5-Coder-7B-Instruct` | A Hugging Face model, run on this Mac |
| `back to default` | Our trained AI again |

What each kind of engine does:

- **Command-line AIs (Claude Code, Codex, Qwen Code, Gemini CLI):**
  - They get Tulai's browser as tools (`browser_read`, `browser_snapshot`), so they can open a page and check it with a snapshot.
  - They work in the chat's project folder.
  - In **ask** mode they only read. In **auto** mode they can edit.
  - They are never allowed to `git push`.
- **Hugging Face models:**
  - Search covers GGUF models only.
  - Tulai picks the 4-bit file that fits your memory (about 60% of RAM).
  - Downloads resume if interrupted and are checked with SHA-256.
  - Models live in `~/Library/Application Support/gateway-chat/models/hf/` and run on port 39658.
- **Privacy:**
  - With an online engine, your prompts go to that company under your account.
  - API keys stay in `config.json` on this Mac, which is owner-only and never shown back.
  - Tulai Bot never uses the company AI.
- **Usage:** the Usage page shows every engine separately.

## Memory (vector database)

Tulai remembers with a **local vector database: SQLite plus Nomic Embed Text v1.5 embeddings, searched with exact cosine similarity. It is not Chroma**, and there is no database server to install.

- **Database:** `~/Library/Application Support/gateway-chat/bot-memory.sqlite`, created by `npm run setup`.
- **What it indexes:** your corrections, chat history, documents and ingested code, and past mistakes with their fixes.
- **Check it:** ask the bot "memory status".

Full details are in [VECTOR-MEMORY.md](VECTOR-MEMORY.md).

## Where things are

| What | Where |
|---|---|
| Settings, chats, logs | `~/Library/Application Support/gateway-chat/` |
| Vector database (memory) | `~/Library/Application Support/gateway-chat/bot-memory.sqlite` (SQLite, not Chroma) |
| Meeting notes | `~/Documents/Tulai Meetings/` |
| Reports (charts are embedded in the `.md`) | `~/Documents/Tulai Reports/` |
| Bot's AI server | `127.0.0.1:39656` (32K context); long brain on `39657` (100K), started when needed |
| Usage (our AI vs company AI, always kept apart) | Settings → Usage |

## If something is wrong

- **"Port in use"**: another Tulai is running. Quit it, or use other ports (step 3).
- **The bot does not answer**: open Settings → Diagnostics. The bot's AI server log is `brain.log` in the data folder.
- **Picture or PDF reading fails**: the helpers are not built yet. Run `npm run build`.
- **Jira or GitLab errors**: connect to the VPN.
