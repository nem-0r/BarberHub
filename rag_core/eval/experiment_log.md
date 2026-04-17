# BarberHub RAG — Experiment Log

## Summary Table

| # | Strategy | top_k | n | Precision@K | Faithfulness | Answer Relevance |
|---|----------|-------|---|-------------|--------------|-----------------|
| Exp1 — Baseline: recursive, top_k=5 | recursive | 5 | 30 | 0.727 | 0.930 | 0.793 |
| Exp2 — Fixed chunks, top_k=5 | fixed | 5 | 10 | 0.780 | 1.000 | 0.860 |
| Exp3 — Recursive, top_k=3 (lower recall) | recursive | 3 | 10 | 0.933 | 1.000 | 0.920 |
| Exp4 — Recursive, top_k=10 (higher recall) | recursive | 10 | 10 | 0.400 | 1.000 | 0.870 |
| Exp5 — Fixed chunks, top_k=3 | fixed | 3 | 10 | 0.967 | 0.900 | 0.790 |

---

## Detailed Change Log

| Component Changed | Before | After | Precision@K Before | Precision@K After | Faithfulness Before | Faithfulness After | Answer Relevance Before | Answer Relevance After | Observation |
|-------------------|--------|-------|-------------------|-------------------|--------------------|--------------------|------------------------|------------------------|-------------|
| chunking strategy | recursive | fixed | 0.727 | 0.780 | 0.930 | 1.000 | 0.793 | 0.860 | Fixed chunking slightly improves P@K for simple questions but risks splitting sentences mid-chunk |
| top_k | 5 | 3 | 0.727 | 0.933 | 0.930 | 1.000 | 0.793 | 0.920 | Fewer chunks boost precision — retrieval stays focused. Risk: may miss multi-fact answers |
| top_k | 5 | 10 | 0.727 | 0.400 | 0.930 | 1.000 | 0.793 | 0.870 | More chunks dilute precision sharply (0.40). Off-topic chunks from the second document dominate |
| chunking strategy + top_k | recursive / 5 | fixed / 3 | 0.727 | 0.967 | 0.930 | 0.900 | 0.793 | 0.790 | Fixed + top_k=3 gives best P@K overall but lowest faithfulness — too little context for complex answers |

---

## Conclusion

Recursive chunking with top_k=5 (Exp1 baseline) achieves the best balance across all three metrics.
The most impactful finding is that top_k=10 collapses Precision@K to 0.400 — for a two-document
knowledge base, retrieving too many chunks pulls in noise from the wrong document.
Fixed-size chunking with top_k=3 scores highest on Precision@K but at the cost of Faithfulness,
suggesting that 3 chunks is sometimes not enough context for complete answers.