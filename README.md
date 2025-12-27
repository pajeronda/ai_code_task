# AI Code Task

**An integrated development environment for Home Assistant, powered by AI.**

Stop copy-pasting code between ChatGPT and your specialized editors. AI Code Task brings your AI assistant directly into your dashboard, with full access to your configuration files and entity states.

---

## What is this?

This is a custom Lovelace card that combines three tools into one cohesive interface:
1.  **A Chat Interface** for talking to your LLMs.
2.  **A Code Editor** for viewing and modifying your configuration.
3.  **A File Explorer** for navigating your `/config` directory.

It is designed to streamline the workflow of writing automations, fixing scripts, and managing your Home Assistant configuration.

## Key Features

### 1. Real Context (Entity Selector)
AI models often hallucinate entity names. This card solves that.
*   **Attach Entities:** Use the "Database" icon to search and select your actual Home Assistant entities (e.g., `light.living_room`, `sensor.temperature`).
*   **Live State:** The AI receives the current state and attributes of those entities.
*   **Result:** The code it generates uses your *actual* entity IDs and respects their current capabilities.

### 2. Built-in File Explorer
You don't need to leave the dashboard to check a file path or read an existing script.
*   **Browse `/config`:** Navigate your configuration directory directly from the card.
*   **Open & Edit:** Click any compatible file to open it in the built-in editor.
*   **Context for AI:** You can "upload" local files from the explorer to the chat so the AI can analyze them (e.g., "Why is this automation in `automations.yaml` not triggering?").

### 3. Smart Code Interaction
The chat and editor are linked.
*   **One-Click Open:** If the AI generates code for a specific file, a clickable badge appears. One click opens that file in the editor.
*   **Diff & Save:** Review the generated code in the editor, make manual tweaks if needed, and save directly to disk.
*   **Snippet vs File:** The interface distinguishes between a generic code example (Snippet) and a modification to an actual file, reducing confusion.

### 4. AI Agnostic
This card doesn't care which AI you use. It sits on top of Home Assistant's conversation agent platform.
*   **Works with Everything:** OpenAI, Google Gemini, Anthropic, or local LLMs (via Ollama/LocalAI). If it's configured in Home Assistant, it works here.
*   **Switch on the Fly:** You can switch providers instantly from the dropdown menu to compare responses.

---

## Installation

1.  **HACS** (Recommended): Add this repository as a custom repository in HACS and install.
2.  **Manual**: Copy the `ai_code_task` directory to your `www/community/` folder.
3.  **Add to Dashboard**: Add the `AI Code Task Card` to any dashboard view.

## Usage Tips

*   **Panel Mode**: This card works best in "Panel" (single card) view, giving you the full width for the dual-pane layout (Chat on left, Code/Explorer on right).
*   **Permissions**: Ensure the user accessing the card has permissions to read/write to the `/config` directory.
