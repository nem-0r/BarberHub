from __future__ import annotations

import itertools
import os
import time
from pathlib import Path

try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).parent.parent.parent / ".env")
except ImportError:
    pass

import google.generativeai as genai

# Ordered by quality; all available on the free tier
MODELS = [
    "gemini-3.1-flash-lite-preview",
    "gemini-3.1-flash-preview",
    "gemini-3-flash-preview",
    "gemini-2.5-flash-lite",
    "gemini-2.5-flash",
    "gemma-4-31b-it",
]


def _load_keys() -> list[str]:
    keys = []
    for env_var in ("GEMINI_API_KEY", "GEMINI_API_KEY_2", "GEMINI_API_KEY_3"):
        val = os.getenv(env_var, "").strip()
        if val and val != "YOUR_SECOND_KEY_HERE" and val != "YOUR_THIRD_KEY_HERE":
            keys.append(val)
    if not keys:
        raise RuntimeError("No valid GEMINI_API_KEY found in environment.")
    return keys


class GeminiRotator:
    """
    Cycles through all (api_key, model) combinations on rate limit or auth errors.
    Gives up only after exhausting every combination.
    """

    def __init__(self):
        keys = _load_keys()
        combos = list(itertools.product(keys, MODELS))
        self._pool = itertools.cycle(combos)
        self._current_key, self._current_model = next(self._pool)
        self._configure(self._current_key)
        print(f"[Rotator] {len(keys)} key(s) x {len(MODELS)} models = {len(combos)} combinations")

    def _configure(self, key: str) -> None:
        genai.configure(api_key=key)

    def _next(self) -> tuple[str, str]:
        self._current_key, self._current_model = next(self._pool)
        self._configure(self._current_key)
        return self._current_key, self._current_model

    def generate(self, system_prompt: str, user_message: str, max_attempts: int = 15) -> str:
        last_error = None

        for attempt in range(max_attempts):
            try:
                model = genai.GenerativeModel(
                    model_name=self._current_model,
                    system_instruction=system_prompt,
                    generation_config=genai.types.GenerationConfig(
                        temperature=0.1,
                        max_output_tokens=1024,
                    ),
                )
                response = model.generate_content(user_message)
                return response.text

            except Exception as exc:
                msg = str(exc).lower()
                is_rate_limit = "429" in msg or "quota" in msg or "rate" in msg or "exhausted" in msg
                is_bad_key    = "api key" in msg or "api_key" in msg or "invalid" in msg or "401" in msg or "403" in msg or "permission" in msg or "unauthorized" in msg
                is_bad_model  = "not found" in msg or "does not exist" in msg or "model" in msg and ("invalid" in msg or "unsupported" in msg)

                if is_rate_limit or is_bad_key or is_bad_model:
                    old_model = self._current_model
                    _, model_name = self._next()
                    reason = "429/quota" if is_rate_limit else ("bad key" if is_bad_key else "model not found")
                    print(f"  [Rotator] {reason} on {old_model} -> switching to {model_name}")
                    time.sleep(2)
                    last_error = exc
                else:
                    raise

        raise RuntimeError(f"All {max_attempts} combinations exhausted. Last error: {last_error}")


_rotator: GeminiRotator | None = None


def get_rotator() -> GeminiRotator:
    global _rotator
    if _rotator is None:
        _rotator = GeminiRotator()
    return _rotator


def rotated_generate(system_prompt: str, user_message: str) -> str:
    return get_rotator().generate(system_prompt, user_message)
