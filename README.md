<div align="center">
  
# AI Code Task
**An integrated development environment for Home Assistant, powered by AI.**

<img width="80%" alt="AI Code Task imagine" src="https://github.com/user-attachments/assets/a4a20524-5b4d-4e11-8ebd-455995f490ea" />
</div>

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

### Via HACS (Recommended)

Click this badge to install **xAI Conversation** via **HACS**

[![Install via your HACS instance.](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=Pajeronda&repository=ai_code_task&category=integration)

Click this badge after restart Home Assistant to configure **xAI Conversation**

[![Open your Home Assistant instance and start setting up the integration.](https://my.home-assistant.io/badges/config_flow_start.svg)](https://my.home-assistant.io/redirect/config_flow_start/?domain=ai_code_task)


**Manual HACS**
1. Open **HACS** in Home Assistant
2. Go to **Integrations** → **Menu (⋮)** → **Custom repositories**
3. Add: `https://github.com/pajeronda/ai_code_task`
4. Category: **Integration**
5. Search for "**AI Code Task**" and click **Download**
6. Restart Home Assistant

### Manual Installation
1. Download the latest release of [AI Code Task](https://github.com/pajeronda/ai_code_task/releases)
   (alternatively, download the zip from the "<> code" badge at the top of this page)
2. Extract and copy the `ai_code_task` folder to `config/custom_components/`
3. Restart Home Assistant

---

## Usage Tips

*   **Panel Mode**: This card works best in "Panel" (single card) view, giving you the full width for the dual-pane layout (Chat on left, Code/Explorer on right).
