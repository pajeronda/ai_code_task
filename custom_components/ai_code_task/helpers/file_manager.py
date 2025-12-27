"""File manager helper for AI Code Task."""

from __future__ import annotations

import os
import fnmatch
from homeassistant.core import HomeAssistant

from ..const import ALLOWED_FILES_MAP, EXCLUDED_FILES, LOGGER


class FileManager:
    """Class to manage file operations within Home Assistant /config."""

    def __init__(self, hass: HomeAssistant) -> None:
        """Initialize."""
        self.hass = hass
        self.config_dir = hass.config.config_dir

    def _is_excluded(self, filename: str) -> bool:
        """Check if a file should be excluded based on EXCLUDED_FILES patterns."""
        return any(fnmatch.fnmatch(filename, pattern) for pattern in EXCLUDED_FILES)

    def _resolve_path(self, path: str) -> str | None:
        """Resolve and validate path within config directory."""
        # Ensure path is relative and doesn't try to escape config_dir
        # Home Assistant's hass.config.path() handles this well
        full_path = self.hass.config.path(path)

        # Security check: must be inside config_dir
        if not full_path.startswith(self.config_dir):
            LOGGER.warning("Attempted access outside /config: %s", path)
            return None

        # Check if the specific file is excluded
        filename = os.path.basename(full_path)
        if self._is_excluded(filename):
            LOGGER.warning("Attempted access to excluded file: %s", filename)
            return None

        # Check if extension is allowed (only for files)
        if os.path.isfile(full_path):
            _, ext = os.path.splitext(filename)
            if ext.lower() not in ALLOWED_FILES_MAP:
                LOGGER.warning("Attempted access to unallowed file type: %s", filename)
                return None

        return full_path

    async def list_files(self, relative_path: str = "") -> list[dict]:
        """List files and directories in a given path."""
        # We need a custom resolve here because _resolve_path checks basename,
        # but here 'relative_path' is a directory, so we don't want to block listing a folder
        # just because its name matches an excluded file (unlikely for folders but safe to separate).
        # However, checking if the *directory* itself is excluded isn't the requirement,
        # we filter the *content* of the directory.

        full_path = self.hass.config.path(relative_path)
        if not full_path.startswith(self.config_dir):
            return []

        target_path = await self.hass.async_add_executor_job(lambda: full_path)

        if not target_path or not os.path.isdir(target_path):
            return []

        def _list():
            items = []
            try:
                for entry in os.scandir(target_path):
                    # Skip hidden files/dirs (starting with .)
                    if entry.name.startswith("."):
                        continue

                    # Skip excluded files
                    if self._is_excluded(entry.name):
                        continue

                    # Filter files by allowed extensions
                    if entry.is_file():
                        _, ext = os.path.splitext(entry.name)
                        if ext.lower() not in ALLOWED_FILES_MAP:
                            continue

                    items.append(
                        {
                            "name": entry.name,
                            "path": os.path.relpath(entry.path, self.config_dir),
                            "is_dir": entry.is_dir(),
                            "size": entry.stat().st_size if entry.is_file() else None,
                            "mtime": entry.stat().st_mtime,
                        }
                    )
                # Sort: dirs first, then alphabetical
                return sorted(items, key=lambda x: (not x["is_dir"], x["name"].lower()))
            except Exception as err:
                LOGGER.error("Error listing directory %s: %s", target_path, err)
                return []

        return await self.hass.async_add_executor_job(_list)

    async def read_file(self, relative_path: str) -> str | None:
        """Read content of a file."""
        target_path = await self.hass.async_add_executor_job(
            self._resolve_path, relative_path
        )
        if not target_path or not os.path.isfile(target_path):
            return None

        def _read():
            try:
                with open(target_path, "r", encoding="utf-8") as f:
                    return f.read()
            except Exception as err:
                LOGGER.error("Error reading file %s: %s", target_path, err)
                return None

        return await self.hass.async_add_executor_job(_read)

    async def save_file(self, relative_path: str, content: str) -> bool:
        """Save content to a file."""
        target_path = await self.hass.async_add_executor_job(
            self._resolve_path, relative_path
        )
        if not target_path:
            return False

        def _write():
            try:
                # Ensure directory exists
                os.makedirs(os.path.dirname(target_path), exist_ok=True)
                with open(target_path, "w", encoding="utf-8") as f:
                    f.write(content)
                return True
            except Exception as err:
                LOGGER.error("Error writing file %s: %s", target_path, err)
                return False

        return await self.hass.async_add_executor_job(_write)
