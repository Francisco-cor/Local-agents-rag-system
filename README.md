# Local Agents

A privacy-first desktop application for local LLM orchestration, multi-agent workflows, and Retrieval-Augmented Generation (RAG). Built entirely in **Rust + Tauri**, with **Ollama** as the inference backend.

---

## Architecture

```
┌─────────────────────────────────┐
│   Frontend  (Vite / React / TS) │
└────────────────┬────────────────┘
                 │ Tauri IPC
┌────────────────▼────────────────┐
│   Rust Backend  (Tauri 2)       │
│                                 │
│  ┌──────────┐  ┌─────────────┐  │
│  │ Workflow  │  │  RAGManager │  │
│  │ Manager  │  │  (SQLite)   │  │
│  └────┬─────┘  └──────┬──────┘  │
│       │               │         │
│  ┌────▼───────────────▼──────┐  │
│  │      InferenceEngine      │  │
│  │   (Ollama HTTP client)    │  │
│  └───────────────────────────┘  │
│                                 │
│  ┌──────────┐  ┌─────────────┐  │
│  │  Arena   │  │  DbManager  │  │
│  │ (ELO)   │  │  (SQLite)   │  │
│  └──────────┘  └─────────────┘  │
└─────────────────────────────────┘
         │
         ▼
   Ollama  (localhost or remote)
```

---

## Features

### Multi-Agent Swarm
A three-stage reasoning pipeline per query:
1. **Provocateur** — generates an initial draft using retrieved context
2. **Critic** — audits the draft for errors and gaps
3. **Synthesizer** — produces the final, refined answer

### PoetIQ Flow
A two-step hypothesis workflow: retrieves context first, then generates a focused response.

### RAG (Retrieval-Augmented Generation)
SQLite-backed vector store — no external toolchain required. Embeddings are generated via `nomic-embed-text` through Ollama and stored as binary blobs. Similarity search uses cosine distance computed in Rust.

### Arena (ELO Leaderboard)
Side-by-side model battles with persistent ELO ratings stored to disk.

### Chat (Raw Mode)
Direct streaming chat with any Ollama model, with full conversation history backed by SQLite.

### Configurable Ollama Endpoint
The Ollama URL can be changed at runtime via `set_ollama_url` — connect to a local instance, a LAN server, or a cloud-hosted endpoint without rebuilding.

---

## Requirements

| Dependency | Purpose |
|---|---|
| [Rust](https://rustup.rs/) 1.77+ | Backend and desktop runtime |
| [Node.js](https://nodejs.org/) 18+ | Frontend build |
| [Ollama](https://ollama.com/) | LLM inference |
| `nomic-embed-text` model | RAG embeddings |

**No Python. No LLVM. No Go toolchain required.**

---

## Getting Started

```bash
# 1. Clone
git clone https://github.com/Francisco-cor/Local-agents-rag-system.git
cd Local-agents-rag-system

# 2. Pull required Ollama models
ollama pull nomic-embed-text
ollama pull llama3.2   # or any model you prefer

# 3. Install frontend dependencies
cd src
npm install

# 4. Run in development mode
npm run tauri dev
```

### Build for production

```bash
cd src
npm run tauri build
```

---

## Tauri Commands (Backend API)

| Command | Description |
|---|---|
| `get_ollama_url` | Returns the current Ollama endpoint URL |
| `set_ollama_url(url)` | Updates the Ollama endpoint at runtime |
| `get_models` | Lists available Ollama models |
| `run_swarm(query, model)` | Runs the Provocateur → Critic → Synthesizer pipeline |
| `run_poetiq(query, model)` | Runs the PoetIQ hypothesis workflow |
| `run_raw(query, model, conversation_id?)` | Streams a direct chat response |
| `run_battle(query, model_a, model_b)` | Runs a side-by-side model battle |
| `ingest_data(file_path)` | Chunks a file and indexes it into the RAG vector store |
| `get_leaderboard` | Returns the ELO leaderboard |
| `record_battle(model_a, model_b, outcome)` | Records a battle result and updates ELO |
| `get_workspaces / create_workspace` | Workspace management |
| `get_folders / create_folder` | Folder management |
| `get_conversations / create_conversation` | Conversation management |
| `get_messages / save_message` | Message persistence |

---

## Verification

Run the built-in verification binary to check Ollama connectivity, RAG indexing/search, and ELO calculations:

```bash
cd src-tauri
cargo run --bin verify
```

---

## License

MIT — see [LICENSE](LICENSE).
