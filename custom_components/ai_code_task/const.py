"""Constants for the AI Code Task integration."""

import logging

DOMAIN = "ai_code_task"
INTEGRATION_TITLE = "AI Code Task"
LOGGER = logging.getLogger(DOMAIN)

# Configuration keys
CONF_ADVANCED_MODE = "advanced_mode"
CONF_ASSISTANT_NAME = "assistant_name"
CONF_CHAT_HISTORY_SIZE = "chat_history_size"
CONF_DEFAULT_PROVIDER = "default_provider"
CONF_MAX_CONTEXT_CHARS = "max_context_chars"
CONF_SYSTEM_PROMPT = "system_prompt"

# Defaults
DEFAULT_ADVANCED_MODE = False
DEFAULT_ASSISTANT_NAME = "Code Assistant"
DEFAULT_CHAT_HISTORY_SIZE = 20
DEFAULT_MAX_RESPONSE_TOKENS = 4096
DEFAULT_TASK_NAME = "AI Code Task Generation"

# Events
EVENT_CODE_RESPONSE = "ai_code_task_response"


# System prompt
DEFAULT_SYSTEM_PROMPT = "Provide high-quality, efficient code solutions. OUTPUT FORMAT: Always return JSON with: 'response_text': Your explanation, analysis, or comments; 'response_code': The complete corrected/generated code (if any)."
SYSTEM_PROMPT_IDENTITY = (
    "You are {assistant_name}, a specialized Home Assistant developer tool."
)

# AI Task Output Schema
AI_TASK_OUTPUT_SCHEMA = {
    "response_text": {
        "description": "The explanation, reasoning, or conversational response.",
        "selector": {"text": {"multiline": True}},
    },
    "response_code": {
        "description": "The generated code, if any. Leave empty if no code is generated.",
        "selector": {"text": {"multiline": True}},
    },
}

# Context Limits
RECOMMENDED_MAX_CONTEXT_CHARS = 32000  # ~8k tokens
# Storage limits
RECOMMENDED_CHAT_HISTORY_MAX_MESSAGES = 250


# Frontend
URL_BASE = DOMAIN
JS_MODULES = [
    {
        "name": "AI Code Task Card",
        "filename": "ai_code_task.js",
    },
]

# Storage
STORAGE_VERSION = 1
STORAGE_KEY = f"{DOMAIN}.storage"

# Security
EXCLUDED_FILES = {
    "secrets.yaml",
}

ALLOWED_FILES_MAP = {
    ".py": ["text/x-python", "application/x-python-code"],
    ".yaml": ["text/yaml", "application/x-yaml"],
    ".yml": ["text/yaml", "application/x-yaml"],
    ".jinja": ["text/jinja"],
    ".jinja2": ["text/jinja2"],
    ".log": ["text/plain"],
    ".txt": ["text/plain"],
    ".md": ["text/markdown"],
    ".js": ["text/javascript", "application/javascript"],
    ".css": ["text/css"],
    ".json": ["application/json", "text/json"],
    ".conf": ["text/plain"],
    ".sh": ["text/x-sh", "application/x-sh"],
    ".html": ["text/html"],
    ".htm": ["text/html"],
    ".xml": ["text/xml", "application/xml"],
    ".csv": ["text/csv"],
    ".toml": ["text/x-toml", "application/toml"],
    ".ini": ["text/plain"],
}
