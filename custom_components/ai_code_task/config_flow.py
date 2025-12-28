"""Config flow for AI Code Fast integration."""

from __future__ import annotations

import voluptuous as vol
from typing import Any
from homeassistant.data_entry_flow import FlowResult

from homeassistant.config_entries import (
    ConfigEntry,
    ConfigFlow,
    OptionsFlow,
)
from homeassistant.core import callback
from homeassistant.helpers import selector

from .const import (
    CONF_ASSISTANT_NAME,
    CONF_DEFAULT_PROVIDER,
    CONF_SYSTEM_PROMPT,
    CONF_CHAT_HISTORY_SIZE,
    CONF_ADVANCED_MODE,
    CONF_MAX_CONTEXT_CHARS,
    DEFAULT_ASSISTANT_NAME,
    DEFAULT_SYSTEM_PROMPT,
    DEFAULT_CHAT_HISTORY_SIZE,
    DEFAULT_ADVANCED_MODE,
    INTEGRATION_TITLE,
    RECOMMENDED_MAX_CONTEXT_CHARS,
    DOMAIN,
)


class AICodeTaskConfigFlow(ConfigFlow, domain=DOMAIN):
    """Handle a config flow for AI Code Task."""

    VERSION = 1

    async def async_step_user(
        self, user_input: dict[str, Any] | None = None
    ) -> FlowResult:
        """Handle the initial step."""
        if self._async_current_entries():
            return self.async_abort(reason="single_instance_allowed")

        if user_input is not None:
            return self.async_create_entry(
                title=INTEGRATION_TITLE,
                data=user_input,
            )

        # Simple mode for initial setup - just the essentials
        return self.async_show_form(
            step_id="user",
            data_schema=vol.Schema(
                {
                    vol.Optional(CONF_DEFAULT_PROVIDER): selector.EntitySelector(
                        selector.EntitySelectorConfig(domain="ai_task")
                    ),
                    vol.Optional(
                        CONF_ASSISTANT_NAME, default=DEFAULT_ASSISTANT_NAME
                    ): selector.TextSelector(
                        selector.TextSelectorConfig(type=selector.TextSelectorType.TEXT)
                    ),
                }
            ),
        )

    @staticmethod
    @callback
    def async_get_options_flow(
        config_entry: ConfigEntry,
    ) -> AICodeTaskOptionsFlow:
        """Get the options flow for this integration."""
        return AICodeTaskOptionsFlow(config_entry)


class AICodeTaskOptionsFlow(OptionsFlow):
    """Handle options flow for AI Code Task."""

    def __init__(self, config_entry: ConfigEntry) -> None:
        """Initialize options flow."""
        self._config_entry = config_entry

    async def async_step_init(
        self, user_input: dict[str, Any] | None = None
    ) -> FlowResult:
        """Manage the options."""
        # Get current configuration
        config = {**self._config_entry.data, **self._config_entry.options}

        if user_input is not None:
            # Restore default system prompt if submitted empty
            if user_input.get(CONF_SYSTEM_PROMPT) == "":
                user_input[CONF_SYSTEM_PROMPT] = DEFAULT_SYSTEM_PROMPT

            # Check if advanced_mode toggle changed
            current_advanced = config.get(CONF_ADVANCED_MODE, DEFAULT_ADVANCED_MODE)
            new_advanced = user_input.get(CONF_ADVANCED_MODE, current_advanced)

            if current_advanced != new_advanced:
                # Toggle changed - update config and reload form
                self.hass.config_entries.async_update_entry(
                    self._config_entry, options=user_input
                )
                return await self.async_step_init()  # Recursive call to reload form

            return self.async_create_entry(title="", data=user_input)

        is_advanced = config.get(CONF_ADVANCED_MODE, DEFAULT_ADVANCED_MODE)

        # Build schema
        schema_dict = {
            vol.Optional(
                CONF_DEFAULT_PROVIDER,
                description={"suggested_value": config.get(CONF_DEFAULT_PROVIDER)},
            ): selector.EntitySelector(selector.EntitySelectorConfig(domain="ai_task")),
            vol.Optional(
                CONF_ASSISTANT_NAME,
                default=config.get(CONF_ASSISTANT_NAME, DEFAULT_ASSISTANT_NAME),
            ): selector.TextSelector(
                selector.TextSelectorConfig(type=selector.TextSelectorType.TEXT)
            ),
        }

        # Show System Prompt only in Advanced Mode
        if is_advanced:
            current_prompt = config.get(CONF_SYSTEM_PROMPT, DEFAULT_SYSTEM_PROMPT)
            schema_dict[
                vol.Optional(
                    CONF_SYSTEM_PROMPT,
                    default=current_prompt,
                )
            ] = selector.TemplateSelector(selector.TemplateSelectorConfig())

        # Common fields
        schema_dict.update(
            {
                vol.Optional(
                    CONF_CHAT_HISTORY_SIZE,
                    default=config.get(
                        CONF_CHAT_HISTORY_SIZE, DEFAULT_CHAT_HISTORY_SIZE
                    ),
                ): selector.NumberSelector(
                    selector.NumberSelectorConfig(
                        min=0,
                        max=50,
                        step=1,
                        mode=selector.NumberSelectorMode.SLIDER,
                    )
                ),
                vol.Optional(
                    CONF_ADVANCED_MODE,
                    default=is_advanced,
                ): selector.BooleanSelector(),
                vol.Optional(
                    CONF_MAX_CONTEXT_CHARS,
                    default=config.get(
                        CONF_MAX_CONTEXT_CHARS, RECOMMENDED_MAX_CONTEXT_CHARS
                    ),
                ): selector.NumberSelector(
                    selector.NumberSelectorConfig(
                        min=1000,
                        max=100000,
                        step=1000,
                        mode=selector.NumberSelectorMode.BOX,
                    )
                ),
            }
        )

        return self.async_show_form(
            step_id="init",
            data_schema=vol.Schema(schema_dict),
        )
