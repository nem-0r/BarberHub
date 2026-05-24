from __future__ import annotations

import itertools
import os
import threading
import time
from pathlib import Path
from typing import Iterator

try:
    from dotenv import load_dotenv

    load_dotenv(Path(__file__).parent.parent.parent / ".env")
except ImportError:
    pass

import google.generativeai as genai

_MAX_OUTPUT_TOKENS = 300

MODELS = [
    "gemini-3.1-flash-lite-preview",  # best free-tier limits (user-confirmed)
    "gemini-3.1-flash-lite",  # same model, non-preview alias
    "gemini-2.5-flash-lite",  # fast, free tier
    "gemini-2.5-flash",  # slightly smarter, still fast
    "gemini-2.0-flash",  # reliable fallback
    "gemini-2.0-flash-lite",  # fastest fallback
    "gemini-1.5-flash",  # legacy fallback
    "gemini-1.5-flash-8b",  # smallest, last resort
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
    """Rotates (api_key, model) combinations on rate-limit or auth errors."""

    def __init__(self):
        keys = _load_keys()
        valid_models = self._probe_models(keys[0], MODELS)
        if not valid_models:
            print(
                "[Rotator] WARNING: no models passed validation — falling back to full list"
            )
            valid_models = MODELS

        self._lock = threading.Lock()
        combos = list(itertools.product(keys, valid_models))
        self._pool = itertools.cycle(combos)
        self._current_key, self._current_model = next(self._pool)
        self._configure(self._current_key)
        print(
            f"[Rotator] {len(keys)} key(s) x {len(valid_models)} valid models = {len(combos)} combinations"
        )
        print(f"[Rotator] Starting with model: {self._current_model}")

    @staticmethod
    def _probe_models(api_key: str, candidates: list[str]) -> list[str]:
        """Probe each model with a 1-token request; keep those that respond."""
        genai.configure(api_key=api_key)
        good: list[str] = []
        for name in candidates:
            try:
                m = genai.GenerativeModel(
                    model_name=name,
                    generation_config=genai.types.GenerationConfig(max_output_tokens=1),
                )
                m.generate_content("hi")
                good.append(name)
                print(f"  [Rotator] ✓ {name}")
            except Exception as exc:
                msg = str(exc).lower()
                if (
                    "not found" in msg
                    or "does not exist" in msg
                    or "invalid" in msg
                    or "404" in msg
                ):
                    print(f"  [Rotator] ✗ {name} (not available, skipping)")
                else:
                    # Rate limit or auth error — assume model exists.
                    good.append(name)
                    print(f"  [Rotator] ? {name} (probe inconclusive: {exc!s:.60})")
        return good

    def _configure(self, key: str) -> None:
        genai.configure(api_key=key)

    def _next(self) -> tuple[str, str]:
        with self._lock:
            self._current_key, self._current_model = next(self._pool)
            self._configure(self._current_key)
            return self._current_key, self._current_model

    def _get_model(self, system_prompt: str) -> "genai.GenerativeModel":
        return genai.GenerativeModel(
            model_name=self._current_model,
            system_instruction=system_prompt,
            generation_config=genai.types.GenerationConfig(
                temperature=0.1,
                top_p=0.9,
                max_output_tokens=_MAX_OUTPUT_TOKENS,
            ),
        )

    @staticmethod
    def _classify_error(exc: Exception) -> tuple[bool, bool, bool]:
        """Return (is_rate_limit, is_bad_key, is_bad_model) for error routing."""
        msg = str(exc).lower()
        is_rate_limit = (
            "429" in msg or "quota" in msg or "rate" in msg or "exhausted" in msg
        )
        is_bad_key = (
            "api key" in msg
            or "api_key" in msg
            or "invalid" in msg
            or "401" in msg
            or "403" in msg
            or "permission" in msg
            or "unauthorized" in msg
        )
        is_bad_model = (
            "not found" in msg
            or "does not exist" in msg
            or ("model" in msg and ("invalid" in msg or "unsupported" in msg))
        )
        return is_rate_limit, is_bad_key, is_bad_model

    def generate(
        self, system_prompt: str, user_message: str, max_attempts: int = 15
    ) -> str:
        last_error = None

        for attempt in range(max_attempts):
            try:
                model = self._get_model(system_prompt)
                response = model.generate_content(user_message)
                return response.text

            except Exception as exc:
                is_rate_limit, is_bad_key, is_bad_model = self._classify_error(exc)

                if is_rate_limit or is_bad_key or is_bad_model:
                    old_model = self._current_model
                    _, model_name = self._next()
                    reason = (
                        "429/quota"
                        if is_rate_limit
                        else ("bad key" if is_bad_key else "model not found")
                    )
                    print(
                        f"  [Rotator] {reason} on {old_model} -> switching to {model_name}"
                    )
                    if is_rate_limit:
                        time.sleep(0.5)
                    last_error = exc
                else:
                    raise

        raise RuntimeError(
            f"All {max_attempts} combinations exhausted. Last error: {last_error}"
        )

    def generate_stream(
        self,
        system_prompt: str,
        user_message: str,
        max_attempts: int = 15,
    ) -> Iterator[str]:
        """Stream response chunks. Retries only before the first yield."""
        last_error: Exception | None = None

        for attempt in range(max_attempts):
            yielded = False
            try:
                model = self._get_model(system_prompt)
                stream = model.generate_content(user_message, stream=True)
                for chunk in stream:
                    text = getattr(chunk, "text", None)
                    if text:
                        yielded = True
                        yield text
                return

            except Exception as exc:
                if yielded:
                    raise

                is_rate_limit, is_bad_key, is_bad_model = self._classify_error(exc)
                if is_rate_limit or is_bad_key or is_bad_model:
                    old_model = self._current_model
                    _, model_name = self._next()
                    reason = (
                        "429/quota"
                        if is_rate_limit
                        else ("bad key" if is_bad_key else "model not found")
                    )
                    print(
                        f"  [Rotator:stream] {reason} on {old_model} -> switching to {model_name}"
                    )
                    if is_rate_limit:
                        time.sleep(0.5)
                    last_error = exc
                else:
                    raise

        raise RuntimeError(
            f"All {max_attempts} combinations exhausted. Last error: {last_error}"
        )


def rotated_generate_stream(system_prompt: str, user_message: str) -> Iterator[str]:
    yield from get_rotator().generate_stream(system_prompt, user_message)


_rotator: GeminiRotator | None = None
_rotator_init_lock = threading.Lock()


def get_rotator() -> GeminiRotator:
    global _rotator
    if _rotator is None:
        with _rotator_init_lock:
            if _rotator is None:
                _rotator = GeminiRotator()
    return _rotator


def rotated_generate(system_prompt: str, user_message: str) -> str:
    return get_rotator().generate(system_prompt, user_message)
