# Tulai vector memory (vector database)

Tulai's long-term memory is a local vector database on this Mac. It stores pieces of text with their embeddings, and returns the ones closest in meaning to what you ask.

## Not Chroma

Tulai does **not** use Chroma (ChromaDB), or Pinecone, FAISS, Qdrant or any other vector database service.

| | What Tulai uses |
|---|---|
| Database | **SQLite**, using macOS's built-in `/usr/bin/sqlite3`. One file, no server, no Python, no cloud account. |
| Embeddings | **Nomic Embed Text v1.5** (Q4_K_M GGUF, 768 dimensions), run locally by the bundled `llama-server`. |
| Search | **Exact cosine similarity** over all stored vectors: no approximate (ANN) index. |
| Code | `vector-memory.js` (database and search), `memory-embeddings.js` (embedder), `bot-memory.js` (what gets indexed). |

Why not Chroma: the memory holds hundreds of short notes, not millions of documents. At that size, exact search over SQLite is fast enough and needs nothing to install or run.

If the memory grows to many thousands of rows, an ANN index (sqlite-vec, or a store such as Chroma) can replace the search step behind `vector-memory.js`. Nothing else would have to change.

## Where it is

- **Database:** `~/Library/Application Support/gateway-chat/bot-memory.sqlite`. The file is owner-only and never committed (`*.sqlite` is git-ignored).
- **Table:** `memories(id, text, source, created_at, model, vector)`.
  - `id`: a stable hash of the text.
  - `model`: the embedding model version.
  - `vector`: the 768 numbers, stored as JSON.
- **Embedding model:** `nomic-embed-text-v1.5.Q4_K_M.gguf` in Tulai's `models` folder. `npm run setup` downloads it (pinned revision, SHA-256-checked), and `npm run build` bundles it into the app.

Look inside with:

```bash
sqlite3 ~/Library/Application\ Support/gateway-chat/bot-memory.sqlite "select source, count(*), sum(vector is not null) as indexed from memories group by source;"
```

## What gets indexed

`bot-memory.js` `corpus()` collects these sources, and the database is kept in sync with them:

1. **Your corrections and preferences** (`bot-learning.json`, editable in Settings). This is the editable source; deleting a note deletes its row and vector.
2. **Chat history**, in chunks (`chat-memory.js`).
3. **Documents** you had Tulai read (`document-work.js`).
4. **Ingested code** from "ingest this folder" (`code-ingest.js`). Secrets, `.env` files, keys and build folders are skipped.
5. **Failure notes and their fixes** (`failure-memory.js`, `failure-research.js`), so the bot does not repeat a mistake.

Settings and permissions are never stored in memory.

## How a search works

1. New or changed rows are embedded. At most 32 per question, so a big import never stalls an answer; the rest are embedded on later questions.
2. Rows are embedded again when the embedding model version changes.
3. The question is embedded and compared with every stored vector (cosine).
4. Matches with a score of at least 0.25 are kept, best first; up to 6 come back.
5. The bot adds up to 4 of them to the request, next to your latest preferences.
6. **Fallbacks:** while rows are still being embedded, keyword ranking fills in. If the embedder is not available, it is keyword ranking only. If SQLite fails, it uses the saved notes directly.

## Privacy

- **Embedder:** it listens only on `127.0.0.1`, on a random port with a random key, and stops after 2 idle minutes. There are no cloud embedding calls.
- **Retrieved notes go into the request** to whichever AI answers:
  - for Tulai Bot, that is always its own local brain;
  - for Tulai Desktop, the company AI only if you switched Desktop to it.
- **Language:** the embedding model mainly targets English. Tagalog retrieval quality has not been measured.

## Check it

- `node scripts/setup-memory.js`: checks the real embedder and the database install.
- `node test/vector-memory.js`: checks ranking, caching, deletion, fallbacks and concurrent deletion.
- `node test/bot-memory.js`: checks that notes persist and can be edited and deleted.
- **In the bot chat:** ask **"memory status"** or **"vector db status"**. It shows how many memories are indexed and the search mode: semantic, semantic + keyword (still indexing), or keyword fallback.

Model: https://huggingface.co/nomic-ai/nomic-embed-text-v1.5-GGUF (Apache 2.0). Its revision and checksum are in `models.json`.
