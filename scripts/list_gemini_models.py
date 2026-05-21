"""Print the Gemini models available to a given API key.

Usage (from repo root):
    GEMINI_API_KEY=your_key python3 scripts/list_gemini_models.py

Output groups models by which methods they support — `embedContent` is the
one we need for embeddings, `generateContent` for chat/LLM. Use this to find
the right value for `GEMINI_EMBED_MODEL` in Render env (e.g. when Google
flips a model from v1beta to v1 and the SDK 404s).

Reads from the deprecated google-generativeai SDK on purpose — that's what
the running app uses, so the visible set here is what your prod will see.
"""
from __future__ import annotations

import os
import sys


def main() -> int:
    key = os.environ.get("GEMINI_API_KEY", "").strip()
    if not key:
        print(
            "ERROR: set GEMINI_API_KEY=... before running this script.",
            file=sys.stderr,
        )
        return 1

    try:
        import google.generativeai as genai
    except ImportError:
        print("ERROR: pip install google-generativeai", file=sys.stderr)
        return 1

    genai.configure(api_key=key)

    print(f"Listing models visible to key {key[:6]}...{key[-4:]}\n")

    embed_models: list[str] = []
    gen_models: list[str] = []
    other_models: list[tuple[str, list[str]]] = []

    try:
        for m in genai.list_models():
            methods = list(getattr(m, "supported_generation_methods", []) or [])
            if "embedContent" in methods:
                embed_models.append(m.name)
            elif "generateContent" in methods:
                gen_models.append(m.name)
            else:
                other_models.append((m.name, methods))
    except Exception as exc:
        print(f"list_models() failed: {exc!s}", file=sys.stderr)
        return 1

    print(f"=== EMBEDDING models ({len(embed_models)}) ===")
    for name in embed_models:
        print(f"  {name}")
    print()
    print(f"=== GENERATIVE models ({len(gen_models)}) ===")
    for name in gen_models:
        print(f"  {name}")
    if other_models:
        print()
        print(f"=== OTHER ({len(other_models)}) ===")
        for name, methods in other_models:
            print(f"  {name}  -- {methods}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
