"""Helper for AI Task Provider management."""

from __future__ import annotations

from homeassistant.core import HomeAssistant
from homeassistant.helpers import entity_registry as er
from homeassistant.exceptions import HomeAssistantError

from ..const import LOGGER, DEFAULT_TASK_NAME


class ProviderManager:
    """Manages AI Task providers."""

    def __init__(self, hass: HomeAssistant, config: dict):
        """Initialize the provider manager."""
        self.hass = hass
        self.config = config

    def get_all_providers(self) -> dict[str, str]:
        """Return a dict of entity_id -> friendly_name for all ai_task providers."""
        providers = {}

        # 1. Get from States (active entities)
        for state in self.hass.states.async_all():
            if state.domain == "ai_task":
                friendly_name = state.attributes.get("friendly_name")
                providers[state.entity_id] = (
                    friendly_name if friendly_name else state.entity_id
                )

        # 2. Get from Entity Registry (inactive/unavailable entities)
        ent_reg = er.async_get(self.hass)
        for entity in ent_reg.entities.values():
            if entity.domain == "ai_task" and entity.entity_id not in providers:
                name = entity.name or entity.original_name or entity.entity_id
                providers[entity.entity_id] = name

        return providers

    def get_provider_name(self, provider_id: str) -> str:
        """Resolve a friendly name for a provider ID."""
        # Try state first
        state = self.hass.states.get(provider_id)
        if state:
            return state.attributes.get("friendly_name") or provider_id

        # Try registry
        ent_reg = er.async_get(self.hass)
        entry_item = ent_reg.async_get(provider_id)
        if entry_item:
            return entry_item.name or entry_item.original_name or provider_id

        return provider_id

    async def generate_response(
        self, provider_id: str, instructions: str, structure: dict
    ) -> dict | None:
        """Call the provider to generate a response."""
        service_payload = {
            "entity_id": provider_id,
            "task_name": DEFAULT_TASK_NAME,
            "instructions": instructions,
            "structure": structure,
        }

        try:
            response = await self.hass.services.async_call(
                "ai_task",
                "generate_data",
                service_payload,
                blocking=True,
                return_response=True,
            )
            return response
        except Exception as err:
            LOGGER.error("Error calling provider %s: %s", provider_id, err)
            raise HomeAssistantError(f"Provider error: {err}")
