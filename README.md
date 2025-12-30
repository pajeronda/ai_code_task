<div align="center">
  
# AI Code Task
**A lightweight and fast integrated development environment (IDE) for Home Assistant, powered by artificial intelligence.**

<img width="80%" alt="AI Code Task imagine" src="https://github.com/user-attachments/assets/a4a20524-5b4d-4e11-8ebd-455995f490ea" />
</div>

Stop copy-pasting code between ChatGPT and your specialized editors. AI Code Task brings your AI assistant directly into your dashboard, with full access to your configuration files and entity states.


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
This card doesn't care which AI you use. It sits on top of Home Assistant's AI TASK platform.
*   **Works with Everything:** Grok xAI, OpenAI, Google Gemini, Anthropic, or local LLMs (via Ollama/LocalAI). If it's configured in Home Assistant, it works here.
*   **Switch on the Fly:** You can switch providers instantly from the dropdown menu to compare responses.

---

## Installation

### Via HACS (Recommended)

Click this badge to install **AI CODE TASK** via **HACS**

[![Install via your HACS instance.](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=Pajeronda&repository=ai_code_task&category=integration)

Click this badge after restart Home Assistant to configure **AI CODE TASK** and select default **Provider AI**:

[![Open your Home Assistant instance and start setting up the integration.](https://my.home-assistant.io/badges/config_flow_start.svg)](https://my.home-assistant.io/redirect/config_flow_start/?domain=ai_code_task)
<div align="center">
<img width="80%" alt="configure AI CODE TASK" src="https://github.com/user-attachments/assets/1684d769-1e00-4e93-a9e1-3bb1510d4baf" />
</div>

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
## CONFIGURATION FRONTEND:
I recommend using it in a dashboard in "Panel" mode (full screen) to optimize the split view between chat and editor, but it works in all dashboard modes and on all device types.

<div align="center">
<img width="80%" alt="configure panel mode" src="https://github.com/user-attachments/assets/d2881338-a9dd-49e6-a653-1c74bb24e293" />
</div>

```yaml
- type: panel
    path: code
    title: AI CODE TASK
    cards:
      - type: custom:ai-code-task-card
        theme: <your theme>
```

### Add card:
<div align="center">
<img width="80%" alt="add card frontend" src="https://github.com/user-attachments/assets/b038c5e7-67a6-42af-b82e-d40f936d0b7c" />
</div>

**IMPORTANT**:
* If you don't see the card after the install/update, try refreshing your browser cache! On PC, press Ctrl + F5 (or Cmd + Shift + R on Mac). If you're using the Home Assistant app, try closing and reopening it.


---
<div align="center">
  
[![📖 Wiki](https://github.com/Pajeronda/ai_code_task/wiki)] | [![🐞 Issues](https://github.com/Pajeronda/ai_code_task/issues)]
  
</div>

