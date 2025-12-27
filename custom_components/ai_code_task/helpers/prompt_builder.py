"""Helper for Prompt Construction for AI Code Task"""

from __future__ import annotations

import json
from ..const import (
    CONF_ASSISTANT_NAME,
    CONF_SYSTEM_PROMPT,
    CONF_ADVANCED_MODE,
    DEFAULT_ASSISTANT_NAME,
    DEFAULT_SYSTEM_PROMPT,
    DEFAULT_ADVANCED_MODE,
    SYSTEM_PROMPT_IDENTITY,
)


class PromptBuilder:
    """Helper to build prompts for the LLM."""

    def __init__(self, config: dict):
        """Initialize with configuration."""
        self.config = config

    def build_system_prompt(self) -> str:
        """Construct the system prompt based on configuration."""
        assistant_name = self.config.get(CONF_ASSISTANT_NAME) or DEFAULT_ASSISTANT_NAME
        is_advanced = self.config.get(CONF_ADVANCED_MODE, DEFAULT_ADVANCED_MODE)

        # Build Identity
        identity = SYSTEM_PROMPT_IDENTITY.format(assistant_name=assistant_name)

        # Build Instructions
        if is_advanced:
            instructions = self.config.get(CONF_SYSTEM_PROMPT, DEFAULT_SYSTEM_PROMPT)
        else:
            instructions = DEFAULT_SYSTEM_PROMPT

        return f"{identity}\n{instructions}"

    def build_conversation_context(
        self,
        system_prompt: str,
        history_messages: list[dict],
        user_prompt: str,
        code_context: str = "",
        file_path: str = "",
        attachments: list[dict] | None = None,
        entity_context: str = "",
    ) -> str:
        """Assemble the full prompt text including history and context."""

        full_conversation_text = ""

        # Process History
        for msg in history_messages:
            role = msg["role"].upper()
            content = msg["content"]
            # Try to parse strict JSON content if it came from us
            try:
                parsed = json.loads(content)
                text = parsed.get("response_text", "")
                code = parsed.get("response_code", "")

                content_display = text
                # HISTORY SLIMMING
                if code and not code_context:
                    content_display += f"\n```\n{code}\n```"
                elif code and code_context:
                    content_display += (
                        "\n[Code omitted for brevity, refer to CURRENT CONTEXT]"
                    )
            except (json.JSONDecodeError, TypeError):
                content_display = content

            full_conversation_text += f"{role}: {content_display}\n\n"

        # Current Request
        current_request_text = f"USER: {user_prompt}"
        if code_context:
            file_info = f" (File: {file_path})" if file_path else ""
            current_request_text += (
                f"\n\nCURRENT CODE CONTEXT{file_info}:\n```\n{code_context}\n```"
            )

        # Attachments
        if attachments:
            current_request_text += "\n\nUPLOADED FILES:"
            for att in attachments:
                filename = att.get("filename", "unknown")
                content = att.get("content", "")
                if content:
                    current_request_text += (
                        f"\n\n--- FILE: {filename} ---\n```\n{content}\n```"
                    )

        # Final Payload
        return (
            (
                f"## ROLE\n{system_prompt}\n\n"
                f"## ENTITY CONTEXT (States & Attributes)\n{entity_context}\n\n"
                f"## HISTORY\n{full_conversation_text}\n"
                f"## TASK\n{current_request_text}\n\n"
                f"RESPONSE:"
            )
            if entity_context
            else (
                f"## ROLE\n{system_prompt}\n\n"
                f"## HISTORY\n{full_conversation_text}\n"
                f"## TASK\n{current_request_text}\n\n"
                f"RESPONSE:"
            )
        )
