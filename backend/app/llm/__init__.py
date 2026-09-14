"""Shared LLM client (OpenAI / MiniMax compatible)."""
from app.llm.client import MinimaxClient, MinimaxError, minimax_client

__all__ = ["MinimaxClient", "MinimaxError", "minimax_client"]
