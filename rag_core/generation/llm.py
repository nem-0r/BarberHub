from rag_core.generation.rotator import rotated_generate


def generate(system_prompt: str, user_message: str, timeout: int = 20) -> str:
    try:
        return rotated_generate(system_prompt, user_message)
    except Exception as exc:
        raise RuntimeError(f"Gemini API error: {exc}") from exc
