"""AI Code Task - AI Task Proxy."""

from __future__ import annotations

from homeassistant.config_entries import ConfigEntry
from homeassistant.const import Platform
from homeassistant.core import HomeAssistant

from .const import DOMAIN
from .websockets import async_setup_websockets
from .helpers import JSModuleRegistration

PLATFORMS: list[Platform] = []


async def async_setup(hass: HomeAssistant, config: dict) -> bool:
    """Set up the AI Code Task component."""
    return True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up AI Code Task from a config entry."""
    hass.data.setdefault(DOMAIN, {})

    # Register websocket commands
    async_setup_websockets(hass)

    # Register Lovelace resource
    js_registration = JSModuleRegistration(hass)
    await js_registration.async_setup()
    hass.data[DOMAIN]["js_registration"] = js_registration

    # Register update listener for options
    entry.async_on_unload(entry.add_update_listener(async_update_options))

    return True


async def async_update_options(hass: HomeAssistant, entry: ConfigEntry) -> None:
    """Update options."""
    await hass.config_entries.async_reload(entry.entry_id)


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload a config entry."""
    # Unload javascript resources
    js_registration = hass.data[DOMAIN].get("js_registration")
    if js_registration:
        await js_registration.async_unload()

    return True
