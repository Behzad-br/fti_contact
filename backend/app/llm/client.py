"""
services/minimax.py — MiniMax HTTP client.

Uses the current OpenAI-compatible Chat Completions API, with a fallback
to the older chatcompletion_v2 path. API keys never leave the server.
"""
import json
import logging
from typing import Optional

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

_TIMEOUT = httpx.Timeout(float(getattr(settings, "LLM_TIMEOUT_SECONDS", 45) or 45), connect=6.0)

# Region hosts MiniMax documents. A China key fails on the global host (1004) and vice versa.
_HOSTS = [
    "https://api.minimax.io/v1",
    "https://api.minimaxi.com/v1",
    "https://api.minimax.chat/v1",
]


class MinimaxError(Exception):
    """Raised when the configured LLM API returns an error."""


def _friendly_auth_error(provider: str = "minimax") -> str:
    if provider == "openai":
        return (
            "OpenAI API key was rejected. Check OPENAI_API_KEY / LLM_API_KEY in .env, "
            "billing, and that the key is active, then restart the backend."
        )
    return (
        "MiniMax API key was rejected (login failed). "
        "Create a key at https://platform.minimax.io (global) or "
        "https://platform.minimaxi.com (China), then set MINIMAX_API_KEY in the .env file "
        "and restart the backend."
    )


class MinimaxClient:
    """
    Thin async wrapper around OpenAI-compatible Chat Completions.

    Usage:
        client = MinimaxClient()
        text = await client.chat(system_prompt, user_prompt)
        data = await client.chat_json(system_prompt, user_prompt)
    """

    def __init__(self):
        self.provider = (settings.LLM_PROVIDER or "minimax").strip().lower()
        self.api_key = (settings.LLM_API_KEY or "").strip()
        self.temperature = settings.LLM_TEMPERATURE
        self._working_url: Optional[str] = None
        self._working_path: Optional[str] = None

        if self.provider == "openai":
            if not self.api_key:
                self.api_key = (getattr(settings, "OPENAI_API_KEY", "") or "").strip()
            self.base_urls = [
                (settings.LLM_BASE_URL or "https://api.openai.com/v1").rstrip("/")
            ]
            model = (settings.LLM_MODEL or "").strip()
            self.model = model if model and not model.lower().startswith("minimax") else "gpt-4o-mini"
            self._paths = ["/chat/completions"]
        else:
            if not self.api_key:
                self.api_key = (settings.MINIMAX_API_KEY or "").strip()
            configured = (settings.LLM_BASE_URL or settings.MINIMAX_BASE_URL or "").rstrip("/")
            self.base_urls = []
            if configured:
                self.base_urls.append(configured)
            for host in _HOSTS:
                if host not in self.base_urls:
                    self.base_urls.append(host)
            self.model = settings.LLM_MODEL or settings.MINIMAX_MODEL or "MiniMax-M2.5"
            self._paths = ["/chat/completions", "/text/chatcompletion_v2"]

    def is_configured(self) -> bool:
        return bool(self.api_key)

    def _headers(self) -> dict:
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

    def _payload(self, system_prompt: str, user_prompt: str, json_mode: bool = False) -> dict:
        payload = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "temperature": self.temperature,
            "max_tokens": 4096,
        }
        if json_mode and self.provider == "openai":
            payload["response_format"] = {"type": "json_object"}
        return payload

    def _extract_text(self, data: dict) -> str:
        choices = data.get("choices") or []
        if isinstance(choices, list) and choices:
            msg = choices[0].get("message") or choices[0]
            if isinstance(msg, dict):
                content = msg.get("content", "")
                if isinstance(content, list):
                    # Anthropic-style content blocks
                    parts = [
                        block.get("text", "")
                        for block in content
                        if isinstance(block, dict)
                    ]
                    return "".join(parts).strip()
                return (content or "").strip()
        reply = data.get("reply")
        if isinstance(reply, str):
            return reply.strip()
        return ""

    def _raise_if_business_error(self, data: dict) -> None:
        base = data.get("base_resp") or {}
        code = base.get("status_code")
        if code in (None, 0):
            return
        if code in (1004, 2049):
            raise MinimaxError(_friendly_auth_error())
        msg = base.get("status_msg") or f"MiniMax business error {code}"
        raise MinimaxError(msg)

    async def _post_once(self, url: str, payload: dict) -> dict:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            try:
                response = await client.post(url, headers=self._headers(), json=payload)
            except httpx.TimeoutException as exc:
                raise MinimaxError(f"{self.provider} API request timed out.") from exc
            except httpx.RequestError as exc:
                raise MinimaxError(f"Could not reach {self.provider}: {exc}") from exc

            try:
                data = response.json()
            except Exception:
                data = {"raw": response.text[:300]}

            if response.status_code >= 400:
                if isinstance(data, dict):
                    self._raise_if_business_error(data)
                    err = data.get("error") or {}
                    message = err.get("message") if isinstance(err, dict) else None
                    if message:
                        raise MinimaxError(str(message))
                if response.status_code in (401, 403):
                    raise MinimaxError(_friendly_auth_error(self.provider))
                raise MinimaxError(f"{self.provider} API error {response.status_code}")

            if isinstance(data, dict):
                self._raise_if_business_error(data)
                return data
            raise MinimaxError(f"Unexpected {self.provider} response format.")

    async def chat(
        self,
        system_prompt: str,
        user_prompt: str,
        json_mode: bool = False,
        model: Optional[str] = None,
        max_tokens: Optional[int] = None,
    ) -> str:
        """Send a chat completion request and return the text response."""
        if not self.is_configured():
            key_name = "OPENAI_API_KEY" if self.provider == "openai" else "MINIMAX_API_KEY"
            raise MinimaxError(f"{key_name} is not set. Please add it to your .env file.")

        payload = self._payload(system_prompt, user_prompt, json_mode=json_mode)
        if model:
            payload["model"] = model
        if max_tokens:
            payload["max_tokens"] = max_tokens
        last_error: Optional[Exception] = None

        urls: list[tuple[str, str]] = []
        if self._working_url and self._working_path:
            urls.append((self._working_url, self._working_path))
        for base in self.base_urls:
            for path in self._paths:
                pair = (base, path)
                if pair not in urls:
                    urls.append(pair)

        for base, path in urls:
            try:
                data = await self._post_once(f"{base}{path}", payload)
                text = self._extract_text(data)
                if not text:
                    last_error = MinimaxError(f"{self.provider} returned an empty reply.")
                    continue
                self._working_url = base
                self._working_path = path
                return text
            except MinimaxError as exc:
                last_error = exc
                logger.warning("%s %s%s failed: %s", self.provider, base, path, exc)
                continue

        raise MinimaxError(
            str(last_error) if last_error else _friendly_auth_error(self.provider)
        )

    async def chat_json(
        self,
        system_prompt: str,
        user_prompt: str,
        retries: int = 2,
        model: Optional[str] = None,
        max_tokens: Optional[int] = None,
    ) -> dict:
        """Chat completion expecting a JSON response."""
        last_error: Optional[Exception] = None

        for attempt in range(retries + 1):
            try:
                raw = await self.chat(
                    system_prompt,
                    user_prompt,
                    json_mode=True,
                    model=model,
                    max_tokens=max_tokens,
                )

                cleaned = raw.strip()
                if cleaned.startswith("```"):
                    lines = cleaned.split("\n")
                    lines = lines[1:] if lines[0].startswith("```") else lines
                    lines = lines[:-1] if lines and lines[-1].strip() == "```" else lines
                    cleaned = "\n".join(lines)

                return json.loads(cleaned)

            except json.JSONDecodeError as exc:
                last_error = exc
                logger.warning(
                    "%s returned invalid JSON (attempt %d/%d): %s",
                    self.provider,
                    attempt + 1,
                    retries + 1,
                    str(exc),
                )
            except MinimaxError:
                raise

        raise MinimaxError(
            f"{self.provider} did not return valid JSON after {retries + 1} attempts."
        ) from last_error

    async def speech_mp3(self, text: str, voice: str = "alloy") -> bytes:
        """OpenAI TTS. Used for AI-generated listening recordings."""
        if not self.is_configured():
            raise MinimaxError("API key is not set. Add OPENAI_API_KEY to .env.")
        if self.provider != "openai":
            raise MinimaxError("Listening audio generation needs OpenAI TTS. Set LLM_PROVIDER=openai.")
        payload = {
            "model": "tts-1",
            "voice": voice or "alloy",
            "input": (text or "").strip()[:4000],
            "response_format": "mp3",
        }
        if not payload["input"]:
            raise MinimaxError("Cannot generate audio from an empty script.")
        base = (self.base_urls[0] if self.base_urls else "https://api.openai.com/v1").rstrip("/")
        timeout = httpx.Timeout(float(getattr(settings, "LLM_TIMEOUT_SECONDS", 120) or 120), connect=8.0)
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(
                f"{base}/audio/speech",
                headers=self._headers(),
                json=payload,
            )
        if response.status_code >= 400:
            raise MinimaxError(f"OpenAI TTS failed ({response.status_code}).")
        return response.content


# Singleton instance
minimax_client = MinimaxClient()
