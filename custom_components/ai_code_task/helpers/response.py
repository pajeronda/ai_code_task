"""Response parsing utilities for AI Code Task.

This module provides modular parsing strategies for handling
structured JSON response formats from AI providers.
"""

from __future__ import annotations

import json
import re
from collections.abc import Callable


# ==============================================================================
# COMPILED REGEX PATTERNS
# ==============================================================================
_JSON_FENCE_PATTERN = re.compile(r"```(?:json)?\s*([\s\S]*?)```", re.IGNORECASE)
_CODE_BLOCK_PATTERN = re.compile(r"```(?:\w+)?\s*\n?(.*?)```", re.DOTALL)

# AI Code Patterns (Legacy Support & Robustness)
_RESPONSE_TEXT_PATTERN = re.compile(
    r'"response_text"\s*:\s*"(.*?)"(?=\s*,\s*"response_code"|\s*})', re.DOTALL
)
_RESPONSE_CODE_PATTERN = re.compile(r'"response_code"\s*:\s*"(.*?)"\s*}', re.DOTALL)
_RESPONSE_CLEANUP_PREFIX = re.compile(r'^\s*{"response_text"\s*:\s*"')
_RESPONSE_CLEANUP_MIDDLE = re.compile(r'"\s*,?\s*"response_code".*$', re.DOTALL)
_RESPONSE_CLEANUP_SUFFIX = re.compile(r'"\s*}?\s*$')


# ==============================================================================
# BASE PARSING STRATEGIES
# ==============================================================================


def parse_strict_json(text: str) -> dict | None:
    """Strategy 1: Strict JSON parsing."""
    try:
        return json.loads(text)
    except (json.JSONDecodeError, ValueError):
        return None


def parse_json_fenced(text: str) -> dict | None:
    """Strategy 2: Extract JSON from markdown code fence."""
    fence = _JSON_FENCE_PATTERN.search(text)
    if fence:
        inner = fence.group(1).strip()
        return parse_strict_json(inner)
    return None


def parse_balanced_braces(text: str) -> dict | None:
    """Strategy 3: Extract first balanced {{...}} or [...] and parse as JSON."""

    def _find_balanced(s: str) -> str | None:
        opens = "{[ "
        closes = "}] "
        stack = []
        start = -1
        for i, ch in enumerate(s):
            if ch in opens:
                if not stack:
                    start = i
                stack.append(ch)
            elif ch in closes and stack:
                if (stack[-1] == "{" and ch == "}") or (stack[-1] == "[" and ch == "]"):
                    stack.pop()
                    if not stack and start != -1:
                        return s[start : i + 1]
                else:
                    stack.clear()
                    start = -1
        return None

    candidate = _find_balanced(text)
    if candidate:
        return parse_strict_json(candidate)
    return None


def parse_with_strategies(
    text: str,
    strategies: list[Callable[[str], dict | None]],
    validator: Callable[[dict], bool] | None = None,
) -> dict | None:
    """Apply parsing strategies in order."""
    for strategy in strategies:
        try:
            result = strategy(text)
            if result is not None:
                if validator is None or validator(result):
                    return result
        except Exception:
            continue
    return None


# ==============================================================================
# STRUCTURED RESPONSE PARSER
# ==============================================================================


def parse_structured_response(response_data: str) -> tuple[str, str]:
    """Parse structured code response to extract text and code components.

    Args:
        response_data: Raw response string from LLM provider

    Returns:
        Tuple of (response_text, response_code)
    """

    # Validator: Check if parsed JSON has required structure
    def _validate_code_structure(data: dict) -> bool:
        """Validate that dict has response_text or response_code fields."""
        return isinstance(data, dict) and (
            "response_text" in data or "response_code" in data
        )

    # Strategy: Regex for tolerant extraction
    def _code_regex_strategy(text: str) -> dict | None:
        text_match = _RESPONSE_TEXT_PATTERN.search(text)
        code_match = _RESPONSE_CODE_PATTERN.search(text)

        if text_match or code_match:
            return {
                "response_text": text_match.group(1) if text_match else "",
                "response_code": code_match.group(1) if code_match else "",
            }
        return None

    # Try parsing using modular strategies
    parsed = parse_with_strategies(
        response_data,
        strategies=[
            parse_strict_json,
            parse_json_fenced,
            parse_balanced_braces,
            _code_regex_strategy,
        ],
        validator=_validate_code_structure,
    )

    if parsed:
        response_text = parsed.get("response_text", "")
        response_code = parsed.get("response_code", "")

        # Handle double-nested JSON
        if isinstance(response_text, str) and response_text.strip().startswith("{"):
            try:
                inner_parsed = json.loads(response_text)
                if _validate_code_structure(inner_parsed):
                    response_text = inner_parsed.get("response_text", "")
                    response_code = inner_parsed.get("response_code", response_code)
            except (json.JSONDecodeError, ValueError):
                pass

        if not isinstance(response_text, str):
            response_text = str(response_text)
        if not isinstance(response_code, str):
            response_code = str(response_code)

        # Unicode escape fix
        if "\\" in response_code and not isinstance(parsed, dict):
            try:
                response_code = response_code.encode("utf-8").decode("unicode_escape")
            except Exception:
                pass

        return response_text, response_code

    # Fallback: Try to extract code blocks from plain text
    code_blocks = _CODE_BLOCK_PATTERN.findall(response_data)

    if code_blocks:
        response_code = code_blocks[0].strip()
        response_text = _CODE_BLOCK_PATTERN.sub("", response_data).strip()

        # CLEANUP regex artifacts
        response_text = _RESPONSE_CLEANUP_PREFIX.sub("", response_text)
        response_text = _RESPONSE_CLEANUP_MIDDLE.sub("", response_text)
        response_text = _RESPONSE_CLEANUP_SUFFIX.sub("", response_text)

        return response_text, response_code

    # Final fallback
    return response_data, ""
