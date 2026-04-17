# BarberHub RAG Pipeline

A Retrieval-Augmented Generation (RAG) chatbot for the BarberHub barbershop booking platform. Built as part of a university assignment on modern NLP and information retrieval systems.

The system answers questions about platform rules, haircut types, and barbershop pricing in Almaty using two source documents as its knowledge base.

---

## What it does

Users can ask questions like:
- "How do I cancel a booking?"
- "What payment methods are accepted?"
- "What haircut is good for curly hair?"
- "How much does a beard trim cost in Almaty?"

The pipeline retrieves relevant passages from local documents and generates a grounded answer using the Gemini API. Every factual claim is cited with its source file.

---

## Project structure

```
rag_core/
├── data/
│   ├── Platform_Rules.pdf      # knowledge base doc 1 (platform rules, ~4 pages)
│   └── Haircut_Guide.docx      # knowledge base doc 2 (haircut guide + Almaty prices)
│
├── ingest/
│   ├── loader.py               # parses PDF, DOCX, MD files with metadata
│   ├── chunker.py              # two chunking strategies (fixed-size and recursive)
│   └── build_index.py          # CLI: load -> chunk -> embed -> store in ChromaDB
│
├── retrieval/
│   ├── embedder.py             # BGE-M3 multilingual embedding model (singleton)
│   └── vector_db.py            # ChromaDB persistent client, two collections
│
├── generation/
│   ├── prompts.py              # system prompt (grounding, citations, language rules)
│   ├── llm.py                  # wrapper around Gemini API with key rotation
│   ├── rotator.py              # rotates between API keys and models on rate limits
│   └── rag_pipeline.py         # main entry point: answer(query) -> {reply, sources, chunks}
│
├── eval/
│   ├── evaluation_qa.csv       # 30 QA pairs with ground truth answers and sources
│   ├── experiments.py          # runs 5 experiments, computes Precision@K and Faithfulness
│   ├── experiment_log.md       # experiment results table (auto-generated)
│   └── results.json            # raw per-question results (auto-generated)
│
├── chroma_data/                # ChromaDB persistent storage (created on first run)
├── requirements.txt
└── README.md
```

---

## Setup

### Requirements

- Python 3.9+
- ~2.5 GB disk space for the BGE-M3 model (downloaded automatically on first run)
- A Gemini API key from [aistudio.google.com](https://aistudio.google.com)

### Install dependencies

```bash
pip install -r rag_core/requirements.txt
pip install python-dotenv
```

### Set environment variables

Create a `.env` file in the project root (or export variables manually):

```
GEMINI_API_KEY=your_api_key_here
```

Optionally add `GEMINI_API_KEY_2` and `GEMINI_API_KEY_3` for rate limit rotation across multiple keys.

---

## Running the pipeline

All commands should be run from the **project root** (`backend_fastapi/`), not from inside `rag_core/`.

### Step 1 — Add your knowledge base documents

Create the `rag_core/data/` directory if it does not exist, and place your `.pdf`, `.docx`, or `.md` files inside it. The repository already includes two sample documents: `Platform_Rules.pdf` and `Haircut_Guide.docx`.

### Step 2 — Build the vector index

```bash
python -m rag_core.ingest.build_index
```

Loads both documents, splits them using two chunking strategies, embeds every chunk using BGE-M3, and stores the vectors in ChromaDB. On the first run it will download the BGE-M3 model (~2 GB) — this only happens once.

### Step 3 — Quick test

```python
from rag_core.generation.rag_pipeline import answer

result = answer("How do I cancel a booking?")
print(result["reply"])
print("Sources:", result["sources"])
```

### Step 4 — Run evaluation experiments

```bash
python -m rag_core.eval.experiments
```

Runs 5 experiments with different chunking strategies and retrieval settings. Evaluates Precision@K and Faithfulness on 30 QA pairs. Writes results to `eval/experiment_log.md` and `eval/results.json`.

---

## How it works

```
User question
    |
    v
BGE-M3 embed query          (retrieval/embedder.py)
    |
    v
ChromaDB cosine search      (retrieval/vector_db.py)
    |
    v
Build grounded prompt       (generation/prompts.py)
    |
    v
Gemini API generate         (generation/llm.py + rotator.py)
    |
    v
{reply, sources, chunks}
```

### Embedding model

**BAAI/bge-m3** — a multilingual model supporting Russian, Kazakh, English, and 100+ languages. Chosen because the knowledge base contains multilingual content and users may ask questions in any of these languages. Loaded once as a singleton and reused across all calls.

### Chunking strategies

| Strategy | Description | Parameters |
|----------|-------------|------------|
| Fixed-size | Splits text into fixed token windows with overlap | 256 tokens, 38-token overlap (~15%) |
| Recursive | Splits at paragraph then sentence then word boundaries | max 350 tokens, min 100 tokens |

### Vector database

ChromaDB with persistent storage. Two separate collections — one per chunking strategy — so both can be queried independently. Cosine similarity is used for retrieval.

### Generation

Gemini API with temperature 0.1. The system prompt enforces three rules:
1. Answer only from the provided context passages.
2. Cite every factual claim with `[Source: filename]`.
3. Respond in the same language the user used.

If the answer is not in the documents, the model replies: *"I cannot find this in the provided documents."*

### Rate limit handling

`GeminiRotator` cycles through all (api_key, model) combinations. On a 429 or auth error it immediately switches to the next combination. With 3 API keys and 6 models this gives 18 total fallback combinations.

---

## Evaluation results

| # | Strategy | top_k | n | Precision@K | Faithfulness |
|---|----------|-------|---|-------------|--------------|
| Exp1 — Baseline | recursive | 5 | 30 | 0.727 | 0.930 |
| Exp2 | fixed | 5 | 10 | 0.780 | 1.000 |
| Exp3 | recursive | 3 | 10 | 0.933 | 1.000 |
| Exp4 | recursive | 10 | 10 | 0.400 | 1.000 |
| Exp5 | fixed | 3 | 10 | 0.967 | 0.900 |

top_k=10 hurts Precision@K significantly (0.400) because it pulls in off-topic chunks from the other document. top_k=5 with recursive chunking gives the best overall balance and is used in production.

---

## FastAPI integration

The pipeline is integrated into the main FastAPI app:

- `app/rag/service.py` — singleton service, BGE-M3 and ChromaDB loaded once on startup
- `app/rag/routes.py` — `POST /api/chat` endpoint
- `frontend/components/ui/floating-chat.tsx` — floating chat widget on all pages

Blocking embedding and retrieval calls run in a thread pool executor to avoid blocking the async event loop.
