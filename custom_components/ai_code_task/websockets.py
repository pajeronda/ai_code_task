"""Websocket API for AI Code Task."""

from __future__ import annotations

import json
from datetime import datetime
from typing import Any

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback
from homeassistant.exceptions import HomeAssistantError
import homeassistant.helpers.config_validation as cv

from .const import (
    AI_TASK_OUTPUT_SCHEMA,
    ALLOWED_FILES_MAP,
    CONF_CHAT_HISTORY_SIZE,
    CONF_DEFAULT_PROVIDER,
    CONF_MAX_CONTEXT_CHARS,
    DEFAULT_CHAT_HISTORY_SIZE,
    DOMAIN,
    EVENT_CODE_RESPONSE,
    RECOMMENDED_MAX_CONTEXT_CHARS,
)
from .helpers import (
    ChatHistoryService,
    FileManager,
    PromptBuilder,
    ProviderManager,
    parse_structured_response,
)


@callback
def async_setup_websockets(hass: HomeAssistant) -> None:
    """Set up the websocket API."""
    websocket_api.async_register_command(hass, ws_get_config)
    websocket_api.async_register_command(hass, ws_get_providers)
    websocket_api.async_register_command(hass, ws_generate)
    websocket_api.async_register_command(hass, ws_sync_history)
    websocket_api.async_register_command(hass, ws_clear_history)
    websocket_api.async_register_command(hass, ws_file_list)
    websocket_api.async_register_command(hass, ws_file_read)
    websocket_api.async_register_command(hass, ws_file_save)


def _get_entry(hass: HomeAssistant) -> ConfigEntry:
    """Get the first config entry for AI Code Task."""
    entries = hass.config_entries.async_entries(DOMAIN)
    if not entries:
        raise HomeAssistantError("Integration not set up")
    return entries[0]


@websocket_api.websocket_command(
    {
        vol.Required("type"): "ai_code_task/get_config",
    }
)
@callback
def ws_get_config(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Handle get config command."""
    connection.send_result(
        msg["id"],
        {
            "allowed_files": ALLOWED_FILES_MAP,
            "version": "1.0.0",
        },
    )


@websocket_api.websocket_command(
    {
        vol.Required("type"): "ai_code_task/get_providers",
    }
)
@websocket_api.async_response
async def ws_get_providers(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Handle get providers command."""
    try:
        entry = _get_entry(hass)
    except HomeAssistantError as err:
        connection.send_error(msg["id"], "not_setup", str(err))
        return

    config = {**entry.data, **entry.options}
    provider_manager = ProviderManager(hass, config)

    providers = provider_manager.get_all_providers()
    default_provider = config.get(CONF_DEFAULT_PROVIDER)

    connection.send_result(
        msg["id"], {"default_provider": default_provider, "providers": providers}
    )


@websocket_api.websocket_command(
    {
        vol.Required("type"): "ai_code_task/generate",
        vol.Required("prompt"): cv.string,
        vol.Optional("provider_id"): vol.Any(cv.string, None),
        vol.Optional("code"): vol.Any(cv.string, None),
        vol.Optional("file_path"): vol.Any(cv.string, None),
        vol.Optional("attachments"): vol.Any(vol.All(cv.ensure_list, [dict]), None),
        vol.Optional("include_entities"): vol.Any(
            vol.All(cv.ensure_list, [cv.entity_id]), None
        ),
        vol.Optional("user_id"): vol.Any(cv.string, None),
    }
)
@websocket_api.async_response
async def ws_generate(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Handle generate code command."""
    try:
        entry = _get_entry(hass)
    except HomeAssistantError as err:
        connection.send_error(msg["id"], "not_setup", str(err))
        return

    prompt = msg.get("prompt")
    provider_id_override = msg.get("provider_id")
    code_context = msg.get("code", "")
    file_path = msg.get("file_path")
    attachments = msg.get("attachments")
    include_entities = msg.get("include_entities", [])
    user_id = msg.get("user_id") or connection.context.user_id

    config = {**entry.data, **entry.options}
    history_service = ChatHistoryService(hass, f"{DOMAIN}/chat_history", entry)
    prompt_builder = PromptBuilder(config)
    provider_manager = ProviderManager(hass, config)

    provider_id = provider_id_override or config.get(CONF_DEFAULT_PROVIDER)
    if not provider_id:
        connection.send_error(msg["id"], "no_provider", "No provider selected")
        return

    system_prompt = prompt_builder.build_system_prompt()
    history_size = int(config.get(CONF_CHAT_HISTORY_SIZE, DEFAULT_CHAT_HISTORY_SIZE))

    hist_messages = []
    if user_id:
        hist_messages = await history_service.load_history(
            str(user_id), limit=history_size
        )

    entity_context = ""
    if include_entities:
        entity_context = "The user has provided the following entities for context:\n"
        for entity_id in include_entities:
            state = hass.states.get(entity_id)
            if state:
                safe_attrs = {
                    k: (v.isoformat() if isinstance(v, datetime) else v)
                    for k, v in state.attributes.items()
                }
                entity_context += f"- {entity_id}: state='{state.state}', attributes={json.dumps(safe_attrs)}\n"
            else:
                entity_context += f"- {entity_id}: [ENTITY NOT FOUND]\n"

    final_instructions = prompt_builder.build_conversation_context(
        system_prompt=system_prompt,
        history_messages=hist_messages,
        user_prompt=prompt,
        code_context=code_context,
        file_path=file_path,
        attachments=attachments,
        entity_context=entity_context,
    )

    max_context_chars = config.get(
        CONF_MAX_CONTEXT_CHARS, RECOMMENDED_MAX_CONTEXT_CHARS
    )
    if len(final_instructions) > max_context_chars:
        connection.send_error(
            msg["id"],
            "context_too_large",
            f"Context too large ({len(final_instructions)} chars)",
        )
        return

    try:
        response = await provider_manager.generate_response(
            provider_id, final_instructions, AI_TASK_OUTPUT_SCHEMA
        )
    except Exception as err:
        connection.send_error(msg["id"], "generation_failed", str(err))
        return

    if not response:
        connection.send_error(msg["id"], "no_response", "No response from provider")
        return

    result_data = response
    if isinstance(response, dict):
        if "data" in response:
            result_data = response["data"]
        elif "value" in response:
            result_data = response["value"]

    resp_text = ""
    resp_code = ""
    if isinstance(result_data, dict):
        resp_text = result_data.get("response_text", "")
        resp_code = result_data.get("response_code", "")
        if not resp_text and not resp_code and len(result_data) > 0:
            first_val = next(iter(result_data.values()))
            if isinstance(first_val, dict):
                resp_text = first_val.get("response_text", "")
                resp_code = first_val.get("response_code", "")
        if not resp_text and not resp_code:
            resp_text, resp_code = parse_structured_response(json.dumps(result_data))
    else:
        resp_text, resp_code = parse_structured_response(str(result_data))

    resp_text = str(resp_text) if resp_text is not None else ""
    resp_code = str(resp_code) if resp_code is not None else ""
    provider_name = provider_manager.get_provider_name(provider_id)

    if user_id:
        user_json = json.dumps(
            {
                "response_text": prompt,
                "response_code": code_context,
                "file_path": file_path,
                "attachments": attachments,
                "include_entities": include_entities,
            }
        )
        await history_service.save_message_async(str(user_id), "user", user_json)

        assist_json = json.dumps(
            {
                "response_text": resp_text,
                "response_code": resp_code,
                "provider_name": provider_name,
            }
        )
        await history_service.save_message_async(str(user_id), "assistant", assist_json)

    hass.bus.async_fire(
        EVENT_CODE_RESPONSE,
        {
            "prompt": prompt,
            "provider_name": provider_name,
            "response_code": resp_code,
            "response_text": resp_text,
            "timestamp": datetime.now().isoformat(),
        },
    )

    connection.send_result(
        msg["id"],
        {
            "provider_name": provider_name,
            "response_code": resp_code,
            "response_text": resp_text,
        },
    )


@websocket_api.websocket_command(
    {
        vol.Required("type"): "ai_code_task/sync_history",
        vol.Optional("user_id"): vol.Any(cv.string, None),
        vol.Optional("limit"): vol.Any(cv.positive_int, None),
    }
)
@websocket_api.async_response
async def ws_sync_history(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Handle sync history command."""
    try:
        entry = _get_entry(hass)
    except HomeAssistantError as err:
        connection.send_error(msg["id"], "not_setup", str(err))
        return

    user_id = msg.get("user_id") or connection.context.user_id
    limit = msg.get("limit", 50)
    if not user_id:
        connection.send_result(msg["id"], {"messages": []})
        return

    history_service = ChatHistoryService(hass, f"{DOMAIN}/chat_history", entry)
    messages = await history_service.load_history(str(user_id), limit=limit)
    connection.send_result(msg["id"], {"messages": messages})


@websocket_api.websocket_command(
    {
        vol.Required("type"): "ai_code_task/clear_history",
        vol.Optional("user_id"): vol.Any(cv.string, None),
    }
)
@websocket_api.async_response
async def ws_clear_history(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Handle clear history command."""
    try:
        entry = _get_entry(hass)
    except HomeAssistantError as err:
        connection.send_error(msg["id"], "not_setup", str(err))
        return

    user_id = msg.get("user_id") or connection.context.user_id
    if not user_id:
        connection.send_result(msg["id"], {"success": True})
        return

    history_service = ChatHistoryService(hass, f"{DOMAIN}/chat_history", entry)
    await history_service.clear_history(str(user_id))
    hass.bus.async_fire(f"{DOMAIN}.history_cleared", {"user_id": user_id})
    connection.send_result(msg["id"], {"success": True})


@websocket_api.websocket_command(
    {
        vol.Required("type"): "ai_code_task/file_list",
        vol.Optional("path"): vol.Any(cv.string, None),
    }
)
@websocket_api.async_response
async def ws_file_list(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Handle file list command."""
    path = msg.get("path", "")
    file_manager = FileManager(hass)
    items = await file_manager.list_files(path)
    connection.send_result(msg["id"], {"items": items})


@websocket_api.websocket_command(
    {
        vol.Required("type"): "ai_code_task/file_read",
        vol.Required("path"): cv.string,
    }
)
@websocket_api.async_response
async def ws_file_read(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Handle file read command."""
    path = msg.get("path")
    file_manager = FileManager(hass)
    content = await file_manager.read_file(path)
    if content is None:
        connection.send_error(msg["id"], "read_failed", f"Could not read file: {path}")
        return
    connection.send_result(msg["id"], {"content": content})


@websocket_api.websocket_command(
    {
        vol.Required("type"): "ai_code_task/file_save",
        vol.Required("path"): cv.string,
        vol.Required("content"): cv.string,
    }
)
@websocket_api.async_response
async def ws_file_save(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Handle file save command."""
    path = msg.get("path")
    content = msg.get("content")
    file_manager = FileManager(hass)
    success = await file_manager.save_file(path, content)
    if not success:
        connection.send_error(msg["id"], "save_failed", f"Could not save file: {path}")
        return
    connection.send_result(msg["id"], {"success": True})
