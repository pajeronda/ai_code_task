"""AI Code Task Javascript module registration."""

from __future__ import annotations

from pathlib import Path

from homeassistant.components.http import StaticPathConfig
from homeassistant.core import HomeAssistant
from homeassistant.helpers.event import async_call_later
from homeassistant.loader import async_get_integration

from ..const import DOMAIN, JS_MODULES, URL_BASE, LOGGER

JS_URL = f"/{URL_BASE}/js"


class JSModuleRegistration:
    """Register Javascript modules."""

    def __init__(self, hass: HomeAssistant) -> None:
        """Initialise."""
        self.hass = hass
        self.lovelace = self.hass.data.get("lovelace")

    async def async_setup(self) -> bool:
        """Register ai_code_task path and modules."""
        await self._async_register_path()

        # If lovelace is not available (e.g. during very early startup or specialized installs)
        # we might need to skip or wait.
        if not self.lovelace:
            LOGGER.debug(
                "Lovelace not found in hass.data, skipping resource registration"
            )
            return True

        if self.lovelace.mode == "storage":
            await self._async_wait_for_lovelace_resources()
        return True

    async def async_unload(self) -> bool:
        """Unload javascript module registration."""
        if self.lovelace and self.lovelace.mode == "storage":
            await self.async_unregister()
        return True

    async def _async_register_path(self):
        """Register resource path if not already registered."""
        try:
            # We map /ai_code_fast/js to the frontend directory
            path = Path(self.hass.config.path(f"custom_components/{DOMAIN}/frontend"))
            await self.hass.http.async_register_static_paths(
                [StaticPathConfig(JS_URL, str(path), False)]
            )
            LOGGER.debug("Registered resource path %s from %s", JS_URL, path)
        except RuntimeError:
            LOGGER.debug("Resource path %s already registered", JS_URL)

    async def _async_wait_for_lovelace_resources(self) -> None:
        """Wait for lovelace resources to have loaded."""

        async def _check_lovelace_resources_loaded(now):
            if self.lovelace.resources.loaded:
                await self._async_register_modules()
            else:
                LOGGER.debug(
                    "Lovelace resources not yet loaded. Trying again in 5 seconds"
                )
                async_call_later(self.hass, 5, _check_lovelace_resources_loaded)

        await _check_lovelace_resources_loaded(0)

    async def _async_register_modules(self):
        """Register modules if not already registered."""
        integration = await async_get_integration(self.hass, DOMAIN)
        version = integration.version

        # Get all registered resources to check for HACS or previous versions
        all_resources = list(self.lovelace.resources.async_items())

        for module in JS_MODULES:
            filename = module.get("filename")
            url = f"{JS_URL}/{filename}"
            versioned_url = f"{url}?v={version}"

            found_resource = None
            # Check for any resource that ends with our filename
            for resource in all_resources:
                res_url = resource["url"].split("?")[0]
                if res_url.endswith(f"/{filename}"):
                    found_resource = resource
                    break

            if found_resource:
                # Check version or URL mismatch (e.g. HACS path vs our path)
                current_url = found_resource["url"]
                if current_url != versioned_url:
                    LOGGER.debug(
                        "Updating resource %s (current: %s) to versioned URL %s",
                        module.get("name"),
                        current_url,
                        versioned_url,
                    )
                    await self.lovelace.resources.async_update_item(
                        found_resource.get("id"),
                        {
                            "res_type": "module",
                            "url": versioned_url,
                        },
                    )
            else:
                LOGGER.debug(
                    "Registering %s as version %s",
                    module.get("name"),
                    version,
                )
                await self.lovelace.resources.async_create_item(
                    {"res_type": "module", "url": versioned_url}
                )

    async def async_unregister(self):
        """Unload lovelace module resource."""
        if not self.lovelace or not self.lovelace.resources:
            return

        resources = [
            resource
            for resource in self.lovelace.resources.async_items()
            if resource["url"].startswith(JS_URL)
        ]
        for resource in resources:
            LOGGER.debug("Removing lovelace resource: %s", resource["url"])
            await self.lovelace.resources.async_delete_item(resource.get("id"))
