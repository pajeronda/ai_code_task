"""Chat History Service for AI Code Task.

This service manages the persistent storage of complete chat messages (text and code)
exclusively for the AI Code Task frontend experience.

Features:
- Asynchronous message saving.
- Asynchronous history loading (for frontend sync).
- Automatic cleanup.
- Per-user message storage.
"""

from __future__ import annotations

import time
from typing import Any

from ..const import LOGGER, RECOMMENDED_CHAT_HISTORY_MAX_MESSAGES, DEFAULT_CHAT_HISTORY_SIZE


class ChatHistoryService:
    """Chat history service for AI Code Task.

    Manages full message storage (user prompts + assistant responses) for:
    - Frontend card UI synchronization across devices.
    """

    def __init__(self, hass, storage_path: str, entry=None):
        """Initialize chat history service.

        Args:
            hass: Home Assistant instance
            storage_path: Storage file path
            entry: Config entry (optional)
        """
        from homeassistant.helpers.storage import Store

        self.hass = hass

        # Ensure directory exists if path implies one
        if "/" in storage_path:
            import os

            full_path = hass.config.path(".storage", storage_path.rsplit("/", 1)[0])
            os.makedirs(full_path, exist_ok=True)

        self._store = Store(hass, 1, storage_path)
        self._history: dict[str, dict] = {}
        self._loaded = False

    async def _ensure_loaded(self):
        """Ensure history is loaded from storage."""
        if self._loaded:
            return

        try:
            data = await self._store.async_load()
            if isinstance(data, dict):
                self._history = data
            else:
                self._history = {}
            self._loaded = True
            LOGGER.debug("Chat history loaded: %d conversations", len(self._history))
        except Exception as err:
            LOGGER.warning("Failed to load chat history: %s", err)
            self._history = {}
            self._loaded = True

    def _get_history_key(self, user_id: str) -> str:
        """Build history key for user.

        Args:
            user_id: User ID

        Returns:
            History key string
        """
        return f"user:{user_id}"

    async def _do_save(self, user_id: str, role: str, content: str):
        """Internal save implementation (runs async)."""
        await self._ensure_loaded()

        history_key = self._get_history_key(user_id)

        # Get or create history entry
        if history_key not in self._history:
            self._history[history_key] = {
                "messages": [],
                "created_at": time.time(),
                "last_updated": time.time(),
            }

        # Add message with timestamp
        self._history[history_key]["messages"].append(
            {"role": role, "content": content, "timestamp": time.time()}
        )
        self._history[history_key]["last_updated"] = time.time()

        # Apply limits (keep last N messages max)
        if (
            len(self._history[history_key]["messages"])
            > RECOMMENDED_CHAT_HISTORY_MAX_MESSAGES
        ):
            self._history[history_key]["messages"] = self._history[history_key][
                "messages"
            ][-RECOMMENDED_CHAT_HISTORY_MAX_MESSAGES:]

        # Save to disk (async, non-blocking)
        # Save to disk (async, non-blocking)
        try:
            await self._store.async_save(self._history)
            LOGGER.debug(
                "Chat history saved: %s role=%s len=%d", history_key, role, len(content)
            )
        except Exception as err:
            LOGGER.error("Failed to save chat history: %s", err)

    async def save_message_async(self, user_id: str, role: str, content: str):
        """Save message asynchronously.

        Args:
            user_id: User ID
            role: Message role (user/assistant)
            content: Message content
        """
        await self._do_save(user_id, role, content)

    async def load_history(
        self, user_id: str, limit: int = DEFAULT_CHAT_HISTORY_SIZE
    ) -> list[dict[str, Any]]:
        """Load chat history (for frontend sync).

        Args:
            user_id: User ID
            limit: Maximum number of messages to return

        Returns:
            List of messages with role, content, timestamp
        """
        await self._ensure_loaded()

        # Defensive casting to ensure limit is an integer for slicing
        try:
            limit = int(limit)
        except (ValueError, TypeError):
            limit = DEFAULT_CHAT_HISTORY_SIZE

        history_key = self._get_history_key(user_id)
        history_entry = self._history.get(history_key)

        if not history_entry:
            LOGGER.debug("No chat history found for %s", history_key)
            return []

        messages = history_entry.get("messages", [])

        # Return last N messages
        result = messages[-limit:] if limit else messages

        return result

    async def clear_history(self, user_id: str):
        """Clear chat history for user.

        Args:
            user_id: User ID
        """
        await self._ensure_loaded()

        history_key = self._get_history_key(user_id)

        if history_key in self._history:
            del self._history[history_key]

            try:
                await self._store.async_save(self._history)
                LOGGER.info("Chat history cleared: %s", history_key)
            except Exception as err:
                LOGGER.error("Failed to save after clearing history: %s", err)
        else:
            LOGGER.debug("No chat history to clear for %s", history_key)
