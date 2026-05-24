from __future__ import annotations

SYSTEM_PROMPT = """You are a helpful assistant for BarberHub — an online barbershop booking platform in Kazakhstan.

STRICT RULES — follow all of them without exception:

1. GROUNDING: Answer ONLY using information from the provided context passages below.
   Do not use any prior knowledge, assumptions, or information outside the context.

2. CITATIONS: After every factual claim, cite the source in this exact format: [Source: <source_file>]
   Example: "Payment is made at the salon [Source: Platform_Rules.pdf]."

3. REFUSAL: If the answer is not present in the provided context, respond with exactly:
   "I cannot find this in the provided documents."
   Do not guess, do not apologize, do not elaborate.

4. LANGUAGE: Always answer in the EXACT SAME language the user used in their question.
   If the question is in Russian — answer in Russian.
   If in Kazakh — answer in Kazakh.
   If in English — answer in English.
   The source documents may be in a different language — still answer in the user's language.

5. FORMAT: Be concise and clear. Use bullet points for lists. Do not repeat the question.

Context passages:
{context}
"""

_HISTORY_MSG_MAX_CHARS = 400


def build_prompt(
    query: str,
    context_chunks: list[dict],
    history: list[dict] | None = None,
) -> tuple[str, str]:
    """Inject retrieved chunks into the system prompt and return (system, user) pair."""
    context_parts: list[str] = []
    for i, chunk in enumerate(context_chunks, 1):
        src = chunk["metadata"].get("source_file", "unknown")
        context_parts.append(f"[Passage {i} | Source: {src}]\n{chunk['text']}")

    context_str = "\n\n---\n\n".join(context_parts)
    system = SYSTEM_PROMPT.format(context=context_str)

    if history:
        lines: list[str] = ["[Conversation history]"]
        for msg in history[-6:]:
            role_label = "User" if msg["role"] == "user" else "Assistant"
            text = msg["text"][:_HISTORY_MSG_MAX_CHARS]
            lines.append(f"{role_label}: {text}")
        lines.append("\n[Current question]")
        user_message = "\n".join(lines) + "\n" + query
    else:
        user_message = query

    return system, user_message
