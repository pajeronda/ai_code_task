/**
 * AI Code Task Card
 * Custom Lovelace card for AI Code Task integration
 * Agnostic AI Task Orchestrator Interface
 * 
 * Features:
 * - Dynamic Provider Selection
 * - Code Editor with Syntax Highlighting
 * - Chat Interface with History
 * - File Uploads (Attachments supported via ai_task)
 */
window.customCards = window.customCards || [];
if (!window.customCards.some(card => card.type === 'ai-code-task-card')) {
  window.customCards.push({
    type: "ai-code-task-card",
    name: "AI Code Task Card",
    description: "AI-powered code assistant interface",
    preview: true,
  });
}

const run = async () => {
  // Wait for ha-panel-lovelace to be defined
  let lovelace = customElements.get("ha-panel-lovelace");
  while (!lovelace) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    lovelace = customElements.get("ha-panel-lovelace");
  }

  const LitElement = Object.getPrototypeOf(lovelace);
  if (!LitElement || !LitElement.prototype) {
    console.error("AI Code Task Card: Could not determine LitElement from ha-panel-lovelace");
    return;
  }
  const html = LitElement.prototype.html;
  const css = LitElement.prototype.css;



  class AICodeTaskCard extends LitElement {

    static async getConfigElement() {
      return document.createElement("ai-code-task-card-editor");
    }

    static getStubConfig() {
      return {};
    }

    static CONSTANTS = {
      VERSION: '1.0.0',
      BASE_URL: '/ai_code_task/js',
      STORAGE_KEY: 'ai_code_task_data',
      DOMAIN: 'ai_code_task',
      WS: {
        GENERATE: 'ai_code_task/generate',
        CLEAR_HISTORY: 'ai_code_task/clear_history',
        SYNC_HISTORY: 'ai_code_task/sync_history',
        GET_PROVIDERS: 'ai_code_task/get_providers',
        FILE_LIST: 'ai_code_task/file_list',
        FILE_READ: 'ai_code_task/file_read',
        FILE_SAVE: 'ai_code_task/file_save',
        GET_CONFIG: 'ai_code_task/get_config',
      },
      RETRY: {
        ATTEMPTS: 3,
        DELAY_MS: 1000,
      },
      UI: {
        BANNER_DURATION_MS: 7500,
        BANNER_ANIMATION_MS: 400,
        SAVE_DEBOUNCE_MS: 500,
        SCROLL_UPDATE_MS: 100,
      },
      FILE: {
        MAX_SIZE_BYTES: 102400,
        MAX_HISTORY: 250,
      }
    };

    static get properties() {
      return {
        _hass: { type: Object },
        _config: { type: Object },
        _chatHistory: { type: Array, state: true },
        _currentCode: { type: String, state: true },
        _sendOnEnter: { type: Boolean, state: true },
        _isEditorFallback: { type: Boolean, state: true },
        _isCodeUserModified: { type: Boolean, state: true },
        _pendingAttachments: { type: Array, state: true },
        _isLoading: { type: Boolean, state: true },
        _error: { type: String, state: true },
        _errorType: { type: String, state: true },
        _errorClosing: { type: Boolean, state: true },
        _confirmDialogOpen: { type: Boolean, state: true },
        // New Properties
        _providers: { type: Object, state: true },
        _selectedProvider: { type: String, state: true },
        // Explorer Properties
        _explorerOpen: { type: Boolean, state: true },
        _explorerItems: { type: Array, state: true },
        _currentExplorerPath: { type: String, state: true },
        _activeFilePath: { type: String, state: true },
        _explorerLoading: { type: Boolean, state: true },
        // Entity Selector Properties
        _selectedEntities: { type: Array, state: true },
        _entitySelectorOpen: { type: Boolean, state: true },
        _entitySelectorSearchQuery: { type: String, state: true },
        _translations: { type: Object, state: true },
        _allowedFilesMap: { type: Object, state: true },
        _configLoaded: { type: Boolean, state: true }
      };
    }

    constructor() {
      super();
      this._config = {};
      this._chatHistory = [];
      this._currentCode = '';
      this._sendOnEnter = false;
      this._isEditorFallback = false;
      this._isCodeUserModified = false;
      this._pendingAttachments = [];
      this._appliedThemeVars = [];
      this._isLoading = false;
      this._error = null;
      this._errorType = null;
      this._errorClosing = false;
      this._errorTimeout = null;
      this._saveDebounceTimeout = null;
      this._storageKey = null;

      // Providers
      this._providers = {};
      this._selectedProvider = '';

      // Explorer
      this._explorerOpen = false;
      this._explorerItems = [];
      this._currentExplorerPath = '';
      this._activeFilePath = null;
      this._explorerLoading = false;
      this._selectedEntities = [];
      this._entitySelectorOpen = false;
      this._entitySelectorSearchQuery = '';
      this._translations = {};
      this._language = '';
      this._allowedFilesMap = {};
      this._configLoaded = false;

      // Confirmation Dialog
      this._confirmDialogOpen = false;
      this._confirmDialogTitle = '';
      this._confirmDialogText = '';
      this._confirmDialogConfirmText = '';
      this._confirmDialogCancelText = '';
      this._confirmDialogAction = null;

      this._promptInput = null;
      this._chatHistoryEl = null;
      this._codeEditorContainer = null;

      this._handleClickOutside = this._handleClickOutside.bind(this);
    }

    connectedCallback() {
      super.connectedCallback();
      window.addEventListener('click', this._handleClickOutside);
    }

    disconnectedCallback() {
      super.disconnectedCallback();
      window.removeEventListener('click', this._handleClickOutside);
    }


    async _loadTranslations(language) {
      if (this._language === language && Object.keys(this._translations).length > 0) return;

      this._language = language;
      try {
        const response = await fetch(`${AICodeTaskCard.CONSTANTS.BASE_URL}/localize/${language}.json`);
        if (response.ok) {
          this._translations = await response.json();
        } else {
          // Fallback to English
          if (language !== 'en') {
            await this._loadTranslations('en');
          }
        }
      } catch (e) {
        console.error("AI Code Task - Error loading translations:", e);
        if (language !== 'en') {
          await this._loadTranslations('en');
        }
      }
    }

    _localize(key) {
      return this._translations[key] || key;
    }

    get _allowedFileExtensions() {
      return Object.keys(this._allowedFilesMap || {});
    }

    async _loadConfig() {
      if (this._configLoaded) return;
      try {
        const response = await this._hass.connection.sendMessagePromise({
          type: AICodeTaskCard.CONSTANTS.WS.GET_CONFIG
        });

        if (response) {
          this._allowedFilesMap = response.allowed_files || {};
          this._configLoaded = true;
          this.requestUpdate();
        }
      } catch (e) {
        console.error("AI Code Task - Error loading config:", e);
      }
    }


    setConfig(config) {
      this._config = config || {};
    }

    set hass(hass) {
      const wasFirstSet = !this._hass;
      const oldLanguage = this._hass?.language;
      this._hass = hass;

      if (hass?.language && hass.language !== oldLanguage) {
        this._loadTranslations(hass.language);
      }

      if (wasFirstSet) {
        this._loadConfig();
        if (hass?.user?.id) {
          this._storageKey = `${AICodeTaskCard.CONSTANTS.STORAGE_KEY}_${hass.user.id}`;
          this._loadFromStorage();
        }
        this._loadProviders();
      }
    }

    firstUpdated(changedProperties) {
      super.firstUpdated(changedProperties);
      this._promptInput = this.shadowRoot.querySelector('#prompt-input');
      this._chatHistoryEl = this.shadowRoot.querySelector('.chat-history');
      this._codeEditorContainer = this.shadowRoot.querySelector('#code-editor-container');
      this._createCodeEditor();
      this._setupPasteListener();
    }

    _setupPasteListener() {
      if (!this._promptInput) return;
      this._promptInput.addEventListener('paste', async (e) => {
        const items = (e.clipboardData || e.originalEvent.clipboardData).items;
        for (const item of items) {
          // Check if item is a file (exclude images specifically now)
          if (item.kind === 'file') {
            const file = item.getAsFile();
            if (file) {
              if (file.type.startsWith('image/')) {
                continue;
              }
              await this._processFile(file);
            }
          }
        }
      });
    }

    updated(changedProperties) {
      if (changedProperties.has('_chatHistory')) {
        this._smoothScrollToBottom('smooth');
      }
      if (changedProperties.has('_isLoading')) {
        setTimeout(() => this._smoothScrollToBottom('smooth'), AICodeTaskCard.CONSTANTS.UI.SCROLL_UPDATE_MS);
      }
      if (changedProperties.has('_config') || changedProperties.has('_hass')) {
        this._applyTheme();
      }
    }

    // ==================== PROVIDER MANAGEMENT ====================

    async _loadProviders() {
      try {
        const response = await this._hass.connection.sendMessagePromise({
          type: AICodeTaskCard.CONSTANTS.WS.GET_PROVIDERS
        });

        if (response?.providers) {
          this._providers = response.providers;
          const backendDefault = response.default_provider;
          console.debug("AI Code Task - Loaded providers:", this._providers, "Backend default:", backendDefault);

          // Priority: 1. Current valid selection, 2. Backend default, 3. First available
          if (!this._selectedProvider || !this._providers[this._selectedProvider]) {
            if (backendDefault && this._providers[backendDefault]) {
              this._selectedProvider = backendDefault;
            } else {
              const first = Object.keys(this._providers)[0];
              if (first) {
                this._selectedProvider = first;
              }
            }
            this._saveToStorage();
          }
          // Force re-render to update dropdown
          this.requestUpdate();
        } else {
          console.warn("AI Code Task - get_providers response:", response);
        }
      } catch (e) {
        console.warn("AI Code Task - Failed to load providers:", e);
      }
    }

    _handleProviderChange(e) {
      const newValue = e.target.value;
      if (newValue && this._providers[newValue]) {
        this._selectedProvider = newValue;
        this._saveToStorage();
      }
    }

    // ==================== FILE EXPLORER MANAGEMENT ====================

    async _toggleExplorer() {
      this._explorerOpen = !this._explorerOpen;
      if (this._explorerOpen && this._explorerItems.length === 0) {
        await this._loadDirectory('');
      }
    }

    async _loadDirectory(path) {
      this._explorerLoading = true;
      try {
        const response = await this._hass.connection.sendMessagePromise({
          type: AICodeTaskCard.CONSTANTS.WS.FILE_LIST,
          path
        });

        if (response?.items) {
          this._explorerItems = response.items;
          this._currentExplorerPath = path;
        }
      } catch (e) {
        console.error("AI Code Task - Failed to load directory:", e);
        this._showError(this._localize('error.dir_load'));
      } finally {
        this._explorerLoading = false;
      }
    }

    async _openExplorerFile(path) {
      this._explorerLoading = true;
      try {
        const response = await this._hass.connection.sendMessagePromise({
          type: AICodeTaskCard.CONSTANTS.WS.FILE_READ,
          path
        });

        if (response?.content !== undefined) {
          this._currentCode = response.content;
          this._activeFilePath = path;
          this._isCodeUserModified = false;

          const editor = this.shadowRoot.querySelector('ha-code-editor');
          if (editor) { editor.value = this._currentCode; }

          this._showError(`${this._localize('msg.loaded')}: ${path.split('/').pop()}`, 'success', 2000);

          // Close explorer to focus on code
          this._explorerOpen = false;
        }
      } catch (e) {
        console.error("AI Code Task - Failed to read file:", e);
        this._showError(this._localize('error.file_read'));
      } finally {
        this._explorerLoading = false;
      }
    }

    async _saveActiveFile() {
      if (!this._activeFilePath) return;

      this._isLoading = true;
      try {
        await this._hass.connection.sendMessagePromise({
          type: AICodeTaskCard.CONSTANTS.WS.FILE_SAVE,
          path: this._activeFilePath,
          content: this._currentCode
        });

        this._isCodeUserModified = false;
        this._showError(`${this._localize('msg.saved')}: ${this._activeFilePath.split('/').pop()}`, 'success', 3000);
      } catch (e) {
        console.error("AI Code Task - Failed to save file:", e);
        this._showError(this._localize('error.file_save'));
      } finally {
        this._isLoading = false;
      }
    }

    _navigateBack() {
      if (!this._currentExplorerPath) return;
      const parts = this._currentExplorerPath.split('/');
      parts.pop();
      this._loadDirectory(parts.join('/'));
    }

    _closeActiveFile() {
      if (this._isCodeUserModified) {
        this._showConfirmationDialog({
          title: this._localize('dialog.unsaved.title'),
          text: this._localize('dialog.unsaved.text'),
          confirmText: this._localize('dialog.unsaved.confirm'),
          cancelText: this._localize('dialog.unsaved.cancel'),
          confirmAction: () => this._performCloseFile()
        });
      } else {
        this._performCloseFile();
      }
    }

    _handleClickOutside(e) {
      if (!this._explorerOpen) return;

      const path = e.composedPath();
      const explorer = this.shadowRoot.querySelector('.section-explorer');
      const toggleBtn = this.shadowRoot.querySelector('#explorer-toggle');

      // Close if click is NOT inside the explorer AND NOT on the toggle button
      if (explorer && !path.includes(explorer) && toggleBtn && !path.includes(toggleBtn)) {
        this._explorerOpen = false;
      }
    }

    _performCloseFile() {
      this._activeFilePath = null;
      this._currentCode = '';
      this._isCodeUserModified = false;

      const editor = this.shadowRoot.querySelector('ha-code-editor');
      if (editor) { editor.value = ''; }
      const textarea = this.shadowRoot.querySelector('.code-output');
      if (textarea) { textarea.value = ''; }

      this._saveToStorage();
      this._showError(this._localize('msg.file_closed'), 'success', 2000);
    }

    // ==================== THEME & STYLING ====================

    _applyTheme() {
      if (!this._config || !this._hass) return;

      if (this._appliedThemeVars) {
        for (const varName of this._appliedThemeVars) {
          this.style.removeProperty(varName);
        }
      }
      this._appliedThemeVars = [];

      if (this._config.theme) {
        const themeData = this._hass.themes.themes[this._config.theme];
        if (themeData) {
          for (const [key, value] of Object.entries(themeData)) {
            const varName = `--${key}`;
            this.style.setProperty(varName, value);
            this._appliedThemeVars.push(varName);
          }
        }
      }
    }

    static get styles() {
      return css`
      :host{display:block;position:relative;container-type:inline-size;box-sizing:border-box;--spacing:16px;--spacing-small:12px;--border-radius-small:4px;--border-radius-medium:8px;--border-radius-pill:16px;--font-size-xs:10px;--font-size-sm:12px;--font-size-base:14px;--transition-fast:0.2s ease;height:100%;color:var(--primary-text-color);font-family:var(--primary-font-family,inherit)}:host *{box-sizing:border-box}ha-card{height:100%;min-height:calc(100vh - 56px);display:flex;flex-direction:column;overflow:visible;background:var(--ha-card-background,var(--card-background-color,#fff));border-radius:var(--ha-card-border-radius,12px);box-shadow:var(--ha-card-box-shadow,none);border:var(--ha-card-border-width,1px) solid var(--ha-card-border-color,var(--divider-color,#e0e0e0))}.error-banner{position:absolute;top:0;left:0;right:0;padding:12px;color:var(--text-primary-color,#fff);text-align:center;cursor:pointer;background-color:var(--error-color,#db4437);z-index:9999;box-shadow:var(--ha-card-box-shadow,0 2px 8px rgb(0 0 0 / .15));animation:slideDownFade 0.4s ease-out}.error-banner.warning{background-color:var(--warning-color,#ffa600);color:var(--primary-text-color,#000)}.error-banner.success{background-color:var(--success-color,#43a047)}.error-banner.closing{animation:slideUpFade 0.4s ease-in forwards}@keyframes slideDownFade{from{opacity:0;transform:translateY(-100%)}to{opacity:1;transform:translateY(0)}}@keyframes slideUpFade{from{opacity:1;transform:translateY(0)}to{opacity:0;transform:translateY(-100%)}}.card-content{padding:var(--spacing);flex:1;display:flex;flex-direction:column;gap:var(--spacing)}@container (min-width:1025px){.card-content{flex-direction:row;gap:var(--spacing);align-items:stretch}.area-left{display:grid;grid-template-rows:1fr auto;flex:1;min-width:0;gap:var(--spacing);order:1;height:calc(100vh - 176px)}.area-right{display:flex;flex-direction:column;flex:2;min-width:0;order:2}.section-chat{display:flex;flex-direction:column;min-height:0;margin-bottom:0;overflow:hidden}.chat-container{flex:1;display:flex;flex-direction:column;min-height:0;position:relative;overflow:hidden}.section-prompt{margin-bottom:0}.chat-history{max-height:none;flex:1;min-height:0}.area-right .section{flex:1;display:flex;flex-direction:column;min-width:0}#code-editor-container{overflow:auto;min-width:0;max-width:100%;flex:1}}@container (max-width:1024px){.card-content{flex-direction:column}.area-left,.area-right{width:100%}.chat-history{max-height:400px}#code-editor-container{max-height:450px;overflow:auto}}@container (max-width:600px){.card-content{padding:var(--spacing-small);gap:var(--spacing-small)}.header-main{padding:var(--spacing-small);flex-direction:column;align-items:center;gap:8px}.header-info{display:flex;flex-direction:column;align-items:center;width:100%;text-align:center}.header-main h2{font-size:18px;justify-content:center}.header-main .subtitle{font-size:11px}.provider-selector{margin-left:0;width:100%;justify-content:center;gap:12px}.provider-selector select{max-width:none;flex:1}ha-icon{--mdc-icon-size:20px}.footer{padding:4px var(--spacing-small) var(--spacing-small) var(--spacing-small)}.section-title{font-size:12px}.chat-history{max-height:250px}#code-editor-container{max-height:300px}}ha-icon{--mdc-icon-size:20px;vertical-align:middle}.header-main h2 ha-icon,.header-section ha-icon{margin-right:8px;color:var(--primary-color)}.header-row{display:flex;align-items:center;justify-content:space-between;flex-shrink:0}.header-main{padding:var(--spacing) var(--spacing) var(--spacing-small) var(--spacing);border-bottom:1px solid var(--divider-color)}.header-main h2{margin:0;font-family:var(--ha-card-header-font-family,inherit);font-size:var(--ha-card-header-font-size,24px);color:var(--ha-card-header-color,var(--primary-text-color));font-weight:400;display:flex;align-items:center;gap:0}.subtitle{color:var(--secondary-text-color);font-size:var(--font-size-sm,12px);margin-top:2px;font-weight:400;font-style:italic}.provider-selector{margin-left:auto;display:flex;align-items:center;gap:8px;flex-shrink:1;min-width:0}.provider-selector select{padding:4px 8px;border-radius:var(--border-radius, 4px);border:1px solid var(--divider-color,#e0e0e0);background:var(--card-background-color,#fff);color:var(--primary-text-color);font-size:14px;max-width:150px;flex-shrink:1}.footer{display:flex;justify-content:space-between;align-items:center;font-size:10px;color:var(--secondary-text-color);opacity:.7;font-style:italic;padding:4px var(--spacing) var(--spacing-small) var(--spacing);flex-shrink:0;gap:8px}.footer-left{display:flex;align-items:center;gap:8px;flex-shrink:0}.footer-left label{display:flex;align-items:center;gap:4px;cursor:pointer;font-style:normal}.footer-left input[type="checkbox"]{cursor:pointer}.footer-right{font-style:italic;flex-shrink:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.section{margin-bottom:var(--spacing)}.section:last-of-type{margin-bottom:8px}.header-section{font-family:var(--paper-font-subhead_-_font-family,inherit);font-weight:500;color:var(--primary-text-color);font-size:16px;margin-bottom:8px;min-height:32px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px}.header-section > span{display:flex;align-items:center}.btn-base,.btn-flat,.btn-solid,.btn,.btn-ghost,.btn-filled,.btn-copy-chat,.chip__close,.btn-icon{display:inline-flex;align-items:center;justify-content:center;border:none;cursor:pointer;font-family:inherit;font-weight:500;transition:all var(--transition-fast,0.2s ease);outline:none;text-decoration:none;gap:4px}.btn-flat,.btn-ghost,.btn-sync,.btn-upload,.btn-icon{background:#fff0;color:var(--primary-color);padding:4px 8px;border-radius:var(--border-radius, 4px);font-size:var(--font-size-sm,12px);border:none}.btn-flat:hover,.btn-ghost:hover,.btn-sync:hover,.btn-upload:hover,.btn-icon:hover{background:rgba(var(--rgb-primary-color,0,0,0),.1)}#code-editor-container{border:1px solid var(--divider-color,#e0e0e0);border-radius:var(--ha-card-border-radius,4px);min-height:100px;overflow:auto;display:flex;flex-direction:column;background:var(--code-editor-background-color,var(--card-background-color,#fff))}#code-editor-container ha-code-editor{flex:1;min-height:100px}@container (min-width:1025px){#code-editor-container,#code-editor-container ha-code-editor{height:100%}}.btn-copy{position:absolute;top:8px;right:8px;background:var(--primary-color);color:var(--text-primary-color,#fff);border:none;padding:6px 12px;border-radius:var(--border-radius, 4px);cursor:pointer;font-size:12px;z-index:1}.chat-container{position:relative}.chat-history{background:var(--secondary-background-color,#f5f5f5);padding:var(--spacing-small);border-radius:var(--ha-card-border-radius,8px);border:1px solid var(--divider-color,#e0e0e0);overflow-y:auto;scroll-behavior:smooth;user-select:text;-webkit-user-select:text}.chat-message{margin-bottom:8px;padding:8px 10px;border-radius:var(--ha-card-border-radius,8px);word-break:break-word;animation:slideIn 0.3s ease-out;user-select:text;-webkit-user-select:text}@keyframes slideIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}.chat-message.user{background:var(--primary-color);color:var(--text-primary-color,#fff);margin-left:15%}.chat-message.assistant{background:var(--card-background-color,#fff);border:1px solid var(--divider-color,#e0e0e0);color:var(--primary-text-color);margin-right:15%}.chat-message .role{font-weight:600;margin-bottom:8px;font-size:11px;display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:var(--border-radius, 8px);line-height:1;background:rgba(var(--rgb-primary-color,3,169,244),.1);color:var(--primary-color);border:1px solid rgba(var(--rgb-primary-color,3,169,244),.2)}.chat-message.user .role{background:rgba(255,255,255,0.2);color:#fff;border-color:rgba(255,255,255,0.3)}.chat-message .role ha-icon{--mdc-icon-size:14px}.chat-message .content{line-height:1.4;font-size:14px;margin:0}.chat-message .code-snippet,.chat-message .chip{background:var(--card-background-color,#fff);color:var(--primary-color);padding:6px 12px;border-radius:var(--border-radius, 8px);font-size:11px;display:flex;align-items:center;justify-content:space-between;gap:8px;border:1px solid rgba(var(--rgb-primary-color,3,169,244),.2);cursor:pointer;transition:all 0.2s;margin-top:12px;width:100%;box-sizing:border-box;font-family:inherit;line-height:1}.chat-message.user .code-snippet,.chat-message.user .chip{background:rgba(255,255,255,0.15);color:#fff;border-color:rgba(255,255,255,0.3)}.chat-message .code-snippet:hover,.chat-message .chip:hover{background:rgba(var(--rgb-primary-color,3,169,244),.05)}.chat-message.user .code-snippet:hover,.chat-message.user .chip:hover{background:rgba(255,255,255,0.25)}.btn-copy-chat{background:var(--primary-color);color:#fff;border-radius:50%;width:24px;height:24px;padding:0;margin-left:4px;flex-shrink:0}.btn-copy-chat:hover,.btn-copy-chat:focus{transform:scale(1.3)}.btn-copy-chat ha-icon{--mdc-icon-size:14px;transition:color 0.2s}.prompt-input{width:100%;min-height:40px;padding:10px var(--spacing-small);background:var(--card-background-color,#fff);color:var(--primary-text-color);border:2px solid var(--divider-color,#e0e0e0);border-radius:var(--border-radius, 8px);font-family:inherit;font-size:14px;resize:vertical;box-sizing:border-box;transition:border-color 0.2s}.prompt-input:focus{outline:none;border-color:var(--primary-color)}.button-row{display:flex;justify-content:space-between;margin-top:8px}.btn-solid,.btn-filled,.btn,.btn-primary,.btn-danger,.btn-copy,.dialog-buttons button{padding:6px 12px;border-radius:var(--border-radius, 12px);font-size:var(--font-size-base,14px);color:var(--text-primary-color,#fff);border:none;box-shadow:var(--ha-card-box-shadow,none);line-height:1}.btn-solid:hover,.btn-filled:hover,.btn:hover,.btn-primary:hover,.btn-danger:hover,.btn-copy:hover{opacity:.85;box-shadow:0 2px 4px rgba(0,0,0,0.1)}.btn-primary,.btn-filled--primary,.btn-copy,.dialog-buttons button.confirm-btn{background:var(--primary-color);color:var(--text-primary-color,#fff)}.btn-danger,.btn-filled--danger{background:var(--error-color,#db4437);color:var(--text-primary-color,#fff)}.btn-save.modified:hover{opacity:.85}.btn-primary ha-icon{color:inherit}.empty-state{text-align:center;padding:calc(var(--spacing) * 2);color:var(--secondary-text-color)}.attachments{margin-top:8px}.chip{display:inline-flex;align-items:center;border-radius:var(--border-radius, 8px);padding:6px 12px;font-size:var(--font-size-sm,12px);margin-right:8px;margin-bottom:8px;background:var(--card-background-color,#fff);color:var(--primary-color);border:1px solid rgba(var(--rgb-primary-color,3,169,244),.2)}.chip--attachment{border-style:solid}.chip--entity{border-style:dashed}.chip__close{background:#fff0;border:none;cursor:pointer;margin-left:4px;padding:0;font-size:14px;color:inherit;opacity:.7;transition:opacity 0.2s;display:flex;align-items:center;justify-content:center}.chip__close:hover{opacity:1}.chip span{max-width:150px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.modal-overlay,.confirm-overlay,.entity-selector-modal,.loading-overlay{position:fixed;top:0;left:0;right:0;bottom:0;background:rgb(0 0 0 / .5);display:flex;align-items:center;justify-content:center;z-index:10000;animation:fadeIn 0.2s ease-out}.modal-dialog,.confirm-dialog,.entity-selector-content{background:var(--card-background-color,#fff);border-radius:var(--ha-card-border-radius,12px);padding:24px;box-shadow:var(--ha-card-box-shadow,0 4px 20px rgb(0 0 0 / .3));animation:slideUp 0.2s ease-out}.confirm-dialog{max-width:400px;width:90%}@keyframes fadeIn{from{opacity:0}to{opacity:1}}@keyframes slideUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}.confirm-dialog h3{margin:0 0 12px 0;color:var(--primary-text-color);font-size:20px}.confirm-dialog p{margin:0 0 20px 0;color:var(--primary-text-color);line-height:1.5}.dialog-buttons{display:flex;gap:12px;justify-content:flex-end}.dialog-buttons button{padding:10px 20px;border:none;border-radius:var(--ha-card-border-radius,12px);cursor:pointer;font-size:14px;font-weight:500;transition:opacity 0.2s}.dialog-buttons button:hover{opacity:.8}.dialog-buttons button:first-child{background:var(--secondary-background-color,#f5f5f5);color:var(--primary-text-color)}.dialog-buttons button.confirm-btn{background:var(--primary-color);color:var(--text-primary-color,#fff)}.loading-overlay{position:absolute;z-index:100;background:rgb(0 0 0 / .7);flex-direction:column}.loading-spinner{width:40px;height:40px;border:4px solid var(--divider-color,#e0e0e0);border-top-color:var(--primary-color);border-radius:50%;animation:spin 1s linear infinite}@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}.loading-text{color:var(--text-primary-color,#fff);margin-top:16px;font-size:14px;font-weight:500}.provider-name{font-size:10px;opacity:.7;margin-left:4px;font-weight:400}.section-explorer{display:flex;flex-direction:column;background:var(--card-background-color,#fff);border:1px solid var(--divider-color,#e0e0e0);border-radius:var(--ha-card-border-radius,12px);margin-bottom:12px;overflow:hidden;transition:all 0.3s ease}.explorer-header{display:flex;align-items:center;justify-content:space-between;padding:8px 12px;border-bottom:1px solid var(--divider-color);color:var(--primary-text-color);font-weight:500;font-size:14px}.explorer-header span{display:flex;align-items:center;gap:6px}.explorer-list{max-height:200px;overflow-y:auto;padding:4px 0}.explorer-item{display:flex;align-items:center;padding:6px 12px;cursor:pointer;font-size:13px;transition:background 0.2s;gap:8px;color:var(--primary-text-color)}.explorer-item:hover{background:var(--secondary-background-color,#f5f5f5)}.explorer-item.directory{color:var(--primary-color);font-weight:500}.explorer-item ha-icon{--mdc-icon-size:18px}.entity-selector-modal{z-index:10001}.entity-selector-content{max-width:500px;width:95%;display:flex;flex-direction:column;gap:16px}.entity-selector-list{max-height:300px;overflow-y:auto;display:flex;flex-direction:column;gap:8px;margin-top:8px}.selected-entity-item{display:flex;align-items:center;justify-content:space-between;padding:8px;background:var(--secondary-background-color,#f5f5f5);border-radius:4px;font-size:13px}ha-entity-picker{display:block;width:100%;min-height:50px}.entity-search-results{max-height:200px;overflow-y:auto;border:1px solid var(--divider-color,#e0e0e0);border-radius:4px;margin-top:4px}.entity-search-item{padding:8px 12px;cursor:pointer;transition:background 0.2s;font-size:13px;border-bottom:1px solid var(--divider-color,#e0e0e0)}.entity-search-item:last-child{border-bottom:none}.entity-search-item:hover{background:var(--secondary-background-color,#f5f5f5)}.entity-search-item .entity-id{font-size:11px;opacity:.7;display:block}.chat-message .text-content h1,.chat-message .text-content h2,.chat-message .text-content h3{margin:8px 0 4px 0;line-height:1.2}.chat-message .text-content h1{font-size:1.4em}.chat-message .text-content h2{font-size:1.2em}.chat-message .text-content h3{font-size:1.1em}.chat-message .text-content p{margin:4px 0}.chat-message .text-content ul{padding-left:20px;margin:4px 0}.chat-message .text-content li{margin-bottom:2px}.chat-message .text-content code{background:rgba(0,0,0,0.1);padding:2px 4px;border-radius:3px;font-family:monospace;font-size:0.9em}.chat-message.user .text-content code{background:rgba(255,255,255,0.2)}
      .provider-no-providers{font-size:12px;color:var(--secondary-text-color);}.explorer-path{opacity:0.6;font-weight:400;font-size:12px;margin-left:4px;}.loading-spinner-sm{width:16px;height:16px;border-width:2px;}.content{min-height:1.2em;}.code-snippet-meta{white-space:nowrap;display:flex;align-items:center;gap:4px;}.opacity-50{opacity:0.5;}.opacity-70-sm{opacity:0.7;font-size:10px;}.mt-8{margin-top:8px;}.icon-sm{--mdc-icon-size:14px;margin-right:4px;}.entity-chip-container{margin-top:8px;display:flex;flex-wrap:wrap;gap:4px;}.chip--entity{margin:0;border-style:dashed;}.icon-white{color:white;}.spacer-8{height:8px;}.section-title{margin:0 0 12px 0;}.no-entities-message{padding:8px;font-size:12px;opacity:0.7;}.entity-selector-list{margin-top:16px;}.selected-label{font-size:12px;font-weight:bold;margin-bottom:8px;opacity:0.8;}`;
    }

    // ==================== RENDERING METHODS ====================

    render() {
      return html`
      <ha-card>
        ${this._error ? html`
          <div class="error-banner ${this._errorType} ${this._errorClosing ? 'closing' : ''}" @click=${() => this._hideError()}>
            ${this._error}
          </div>
        ` : ''}
        <div class="header-main header-row">
          <div class="header-info">
            <h2><ha-icon icon="mdi:robot-outline"></ha-icon> ${this._localize('card.title')}</h2>
            <div class="subtitle">${this._localize('card.subtitle')}</div>
          </div>
          <div class="provider-selector flex-center">
            ${Object.keys(this._providers).length > 0 ? html`
              <select @change=${this._handleProviderChange} title="${this._localize('provider.select_title')}" class="provider-select">
                ${Object.entries(this._providers).map(([id, name]) => html`
                  <option value="${id}" ?selected=${id === this._selectedProvider}>${name}</option>
                `)}
              </select>
            ` : html`<span class="provider-no-providers">${this._localize('provider.no_providers')}</span>`}
            <button class="btn-base btn-flat" title="${this._localize('provider.refresh_title')}" @click=${this._loadProviders}>
              <ha-icon icon="mdi:refresh"></ha-icon>
            </button>
          </div>
        </div>

        <div class="card-content">
          <div class="area-right">
            ${this._explorerOpen ? this._renderExplorer() : ''}
            <div class="section">
              <div class="header-section header-row">
                <div class="flex-column">
                  <span><ha-icon icon="mdi:code-braces-box"></ha-icon> ${this._localize('editor.title')}
                    ${this._activeFilePath ? html`<span class="chip chip--attachment" @click=${this._closeActiveFile} title="${this._localize('editor.detach_title')}"><ha-icon icon="mdi:file-document-outline" class="icon-sm"></ha-icon> ${this._activeFilePath.split('/').pop()} <span class="chip__close">×</span></span>` : ''}
                  </span>
                  <div class="subtitle">${this._activeFilePath ? `${this._localize('editor.editing')} ${this._activeFilePath}` : this._localize('editor.subtitle')}</div>
                </div>
                <div class="flex-center">
                  <button id="explorer-toggle" class="btn-base btn-flat" @click=${this._toggleExplorer} title="${this._localize('editor.toggle_explorer')}">
                    <ha-icon icon="mdi:folder-open-outline"></ha-icon> ${this._localize('explorer.title')}
                  </button>
                  ${this._activeFilePath ? html`
                    <button class="btn-base ${this._isCodeUserModified ? 'btn-primary' : 'btn-flat'} btn-save" @click=${this._saveActiveFile} title="${this._localize('editor.save_title')}"><ha-icon icon="mdi:content-save-outline"></ha-icon> ${this._localize('editor.save')}</button>
                  ` : ''}
                  ${this._currentCode ? html`
                    <button class="btn-base btn-flat" @click=${this._clearCodeEditor} title="${this._localize('editor.clear_title')}">
                       <ha-icon icon="mdi:delete-outline"></ha-icon> ${this._localize('editor.clear')}
                    </button>
                  ` : ''}
                </div>
              </div>
              <div class="relative-full-height">
                ${this._currentCode && this._isEditorFallback ? html`<button class="btn-copy" @click=${this._copyCode}><ha-icon icon="mdi:content-copy" class="icon-white"></ha-icon> ${this._localize('editor.copy')}</button>` : ''}
                <div id="code-editor-container"></div>
              </div>
            </div>
          </div>
          <div class="area-left">
            ${this._renderChatSection()}
            ${this._renderPromptSection()}
          </div>
        </div>

        <div class="footer">
          <div class="footer-left">
            <label>
              <input type="checkbox" .checked=${this._sendOnEnter} @click=${this._toggleSendOnEnter}>
              ${this._localize('input.send_on_enter')}
            </label>
          </div>
          <div class="footer-right">
            v${AICodeTaskCard.CONSTANTS.VERSION}
          </div>
        </div>
      </ha-card>
      ${this._confirmDialogOpen ? this._renderConfirmationDialog() : ''}
      ${this._entitySelectorOpen ? this._renderEntitySelectorModal() : ''}
    `;
    }

    _renderConfirmationDialog() {
      return html`
        <div class="confirm-overlay">
          <div class="confirm-dialog">
            <h3>${this._confirmDialogTitle}</h3>
            <p>${this._confirmDialogText}</p>
            <div class="dialog-buttons">
              <button @click=${this._handleConfirmCancel}>${this._confirmDialogCancelText}</button>
              <button class="confirm-btn" @click=${this._handleConfirmAccept}>${this._confirmDialogConfirmText}</button>
            </div>
          </div>
        </div>
      `;
    }

    _renderChatSection() {
      return html`
      <div class="section section-chat">
        <div class="header-section header-row">
          <span><ha-icon icon="mdi:forum-outline"></ha-icon> ${this._localize('chat.title')}</span>
          <button class="btn-base btn-flat" @click=${this._syncChatHistory} .disabled=${this._isLoading} title="${this._localize('chat.sync_title')}"><ha-icon icon="mdi:sync"></ha-icon> ${this._localize('chat.sync')}</button>
        </div>
        <div class="chat-container">
          <div class="chat-history">
            ${this._chatHistory.length === 0 && !this._isLoading
          ? html`<div class="empty-state">${this._localize('chat.empty')}</div>`
          : this._chatHistory.map(msg => this._renderMessage(msg))
        }
          </div>
          ${this._isLoading ? html`
            <div class="loading-overlay">
              <div class="loading-spinner"></div>
              <div class="loading-text">${this._localize('chat.thinking')}</div>
            </div>
          ` : ''}
        </div>
      </div>
    `;
    }

    _renderExplorer() {
      return html`
        <div class="section-explorer">
          <div class="explorer-header">
            <span>
              ${this._currentExplorerPath ? html`
                <button class="btn-icon" @click=${this._navigateBack} title="${this._localize('explorer.back')}">
                  <ha-icon icon="mdi:chevron-left"></ha-icon>
                </button>
              ` : html`<ha-icon icon="mdi:folder-outline"></ha-icon>`}
              <span class="explorer-title">${this._localize('explorer.title') === 'explorer.title' ? 'File' : this._localize('explorer.title')}</span>
              <span class="explorer-path">
                (/config${this._currentExplorerPath ? `/${this._currentExplorerPath}` : ''})
              </span>
            </span>
            ${this._explorerLoading ? html`<div class="loading-spinner loading-spinner-sm"></div>` : html`
              <button class="btn-icon" @click=${() => this._loadDirectory(this._currentExplorerPath)} title="${this._localize('explorer.refresh')}">
                <ha-icon icon="mdi:refresh"></ha-icon>
              </button>
            `}
          </div>
          <div class="explorer-list">
            ${this._explorerItems.length === 0 && !this._explorerLoading ? html`<div class="explorer-empty">${this._localize('explorer.empty')}</div>` : ''}
            ${this._explorerItems.map(item => html`
              <div class="explorer-item ${item.is_dir ? 'directory' : 'file'}" 
                   @click=${() => item.is_dir ? this._loadDirectory(item.path) : this._openExplorerFile(item.path)}>
                <ha-icon icon="${item.is_dir ? 'mdi:folder' : 'mdi:file-code-outline'}"></ha-icon>
                <span>${item.name}</span>
              </div>
            `)}
          </div>
        </div>
      `;
    }

    _renderMessage(msg) {
      return html`
      <div class="chat-message ${msg.role}">
        <div class="role">
          <ha-icon icon="${msg.role === 'user' ? 'mdi:account' : 'mdi:robot-outline'}"></ha-icon>
          <span>${msg.role === 'user' ? this._localize('chat.you') : this._localize('chat.ai')}</span>
          ${msg.providerName ? html`<span class="provider-name">(${msg.providerName})</span>` : ''}
        </div>
        <div class="content" style="min-height: 1.2em;">
          <div class="text-content">${this._renderMarkdownFallback(msg.content || msg.text || "")}</div>
          ${msg.code ? html`
            ${msg.filepath ? html`
              <div class="chip chip--attachment interactable" 
                   @click=${() => this._openExplorerFile(msg.filepath, true)}
                   title="${this._localize('chat.open_file_title') || 'Open file'}">
                 <ha-icon icon="mdi:file-document-outline" style="--mdc-icon-size: 14px; margin-right: 4px;"></ha-icon>
                 <span style="font-weight: 500;">${msg.filepath.split('/').pop()}</span>
              </div>
            ` : html`
              <div class="code-snippet" @click=${() => this._loadCodeFromMessage(msg)} title="${this._localize('chat.load_code_title')}">
                <div class="flex-center overflow-hidden">
                  <span style="white-space: nowrap; display: flex; align-items: center; gap: 4px;"><ha-icon icon="mdi:code-tags" style="--mdc-icon-size: 16px;"></ha-icon> ${this._localize('chat.code_snippet')} [${msg.code.split('\n').length} ${this._localize('chat.lines')}]</span>
                  <span style="opacity: 0.5;">•</span>
                  <span style="opacity: 0.7; font-size: 10px;">${this._formatTime(msg.timestamp)}</span>
                </div>
                <button class="btn-copy-chat" @click=${(e) => { e.stopPropagation(); this._copyChatCodeToClipboard(msg.code); }} title="${this._localize('chat.copy_code')}">
                  <ha-icon icon="mdi:content-copy"></ha-icon>
                </button>
              </div>
            `}
          ` : ''}
          ${msg.attachments && msg.attachments.length > 0 ? html`
            <div style="margin-top: 8px;">
              ${msg.attachments.map(att => html`
                <div class="chip chip--attachment interactable" 
                     @click=${() => this._loadAttachmentIntoEditor(att)}
                     title="${this._localize('chat.load_attachment_title') || 'Load into editor'}">
                  <ha-icon icon="mdi:file-document-outline" style="--mdc-icon-size: 14px; margin-right: 4px;"></ha-icon>
                  <span>${att.filename}</span>
                </div>
              `)}
            </div>
          ` : ''}
          ${msg.include_entities && msg.include_entities.length > 0 ? html`
            <div style="margin-top: 8px; display: flex; flex-wrap: wrap; gap: 4px;">
              ${msg.include_entities.map(ent => html`
                <div class="chip chip--entity" style="margin: 0; border-style: dashed;">
                  <ha-icon icon="mdi:tag-outline" style="--mdc-icon-size: 14px; margin-right: 4px;"></ha-icon>
                  <span>${ent}</span>
                </div>
              `)}
            </div>
          ` : ''}
        </div>
      </div>
    `;
    }

    _renderPromptSection() {
      return html`
      <div class="section">
        <div class="header-section header-row">
          <span><ha-icon icon="mdi:pencil-outline"></ha-icon> ${this._localize('input.title')}</span>
          <div class="flex-center">
            <label class="btn-base btn-flat" title="${this._localize('input.upload')} ${this._allowedFileExtensions.join(', ')}">
              <ha-icon icon="mdi:upload-outline"></ha-icon>
              ${this._pendingAttachments.length === 0 ? this._localize('input.upload') : `${this._localize('input.upload_files')} (${this._pendingAttachments.length})`}
              <input type="file" multiple hidden id="file-input" @change=${this._handleFileSelect} accept=${this._allowedFileExtensions.join(',')}>
            </label>
            <button class="btn-base btn-flat" @click=${this._toggleEntitySelector} title="${this._localize('input.add_entity')}">
              <ha-icon icon="mdi:database-search-outline"></ha-icon>
              ${this._selectedEntities.length === 0 ? this._localize('input.add_entity') : `${this._localize('input.entities')} (${this._selectedEntities.length})`}
            </button>
          </div>
        </div>
        <div class="attachments">
          ${this._selectedEntities.map(entityId => html`
            <div class="chip chip--entity">
              <ha-icon icon="mdi:tag-outline" class="icon-sm"></ha-icon>
              <span>${entityId}</span>
              <button class="chip__close" @click=${() => this._removeEntityFromSelection(entityId)} title="${this._localize('input.remove_attachment')}">×</button>
            </div>
          `)}
          ${this._pendingAttachments.map((file, index) => html`
            <div class="chip chip--attachment">
              <ha-icon icon="mdi:file-document-outline" class="icon-sm"></ha-icon>
              <span>${file.filename}</span>
              <button class="chip__close" @click=${() => this._clearAttachment(index)} title="${this._localize('input.remove_attachment')}">×</button>
            </div>
          `)}
        </div>
        <textarea id="prompt-input" class="prompt-input" placeholder="${this._localize('input.placeholder')}" @keydown=${this._handleKeyDown} .disabled=${this._isLoading}></textarea>
        <div class="button-row">
          <button class="btn btn-danger" @click=${this._clearChat} .disabled=${this._isLoading}><ha-icon icon="mdi:delete-outline" style="color: white;"></ha-icon> ${this._localize('input.clear_chat')}</button>
          <button class="btn btn-primary" @click=${this._sendPrompt} .disabled=${this._isLoading}><ha-icon icon="mdi:send-variant" style="color: white;"></ha-icon> ${this._localize('input.send')}</button>
        </div>
      </div>
    `;
    }

    // ==================== UI FEEDBACK & NOTIFICATIONS ====================

    _showError(message, type = 'error', duration = AICodeTaskCard.CONSTANTS.UI.BANNER_DURATION_MS) {
      this._error = message;
      this._errorType = type;
      this._errorClosing = false;

      if (this._errorTimeout) {
        clearTimeout(this._errorTimeout);
      }

      this._errorTimeout = setTimeout(() => {
        this._hideError();
      }, duration);
    }

    _hideError() {
      this._errorClosing = true;
      this.requestUpdate();
      setTimeout(() => {
        this._error = null;
        this._errorType = null;
        this._errorClosing = false;
      }, AICodeTaskCard.CONSTANTS.UI.BANNER_ANIMATION_MS);
    }

    _showConfirmationDialog({ title, text, confirmText, cancelText, confirmAction }) {
      this._confirmDialogTitle = title;
      this._confirmDialogText = text;
      this._confirmDialogConfirmText = confirmText || this._localize('dialog.sync.confirm');
      this._confirmDialogCancelText = cancelText || this._localize('dialog.cancel');
      this._confirmDialogAction = confirmAction;
      this._confirmDialogOpen = true;
    }

    _handleConfirmCancel() {
      this._confirmDialogOpen = false;
      this._confirmDialogAction = null;
    }

    _handleConfirmAccept() {
      if (this._confirmDialogAction) {
        this._confirmDialogAction();
      }
      this._handleConfirmCancel();
    }

    // ==================== SERVICE CALLS & API ====================

    _smoothScrollToBottom(behavior = 'smooth') {
      requestAnimationFrame(() => {
        if (this._chatHistoryEl) {
          this._chatHistoryEl.scrollTo({
            top: this._chatHistoryEl.scrollHeight,
            behavior
          });
        }
      });
    }

    async _callServiceWithRetry(serviceData, retries = AICodeTaskCard.CONSTANTS.RETRY.ATTEMPTS, delay = AICodeTaskCard.CONSTANTS.RETRY.DELAY_MS) {
      for (let i = 0; i < retries; i++) {
        try {
          return await this._hass.connection.sendMessagePromise(serviceData);
        } catch (error) {
          if (i === retries - 1) {
            throw error;
          }
          const nextAttemptIn = delay * (i + 1);
          console.warn(`Service call failed. Retrying in ${nextAttemptIn}ms... (Attempt ${i + 1}/${retries})`, error);
          this._showError(`${this._localize('error.network_retry')} (${i + 1})`, 'warning', nextAttemptIn);
          await new Promise(resolve => setTimeout(resolve, nextAttemptIn));
        }
      }
    }

    _parseResponse(dataToParse) {
      if (typeof dataToParse === 'object' && dataToParse !== null) {
        return {
          assistantContent: dataToParse.response_text || '',
          assistantCode: dataToParse.response_code || '',
          providerName: dataToParse.provider_name || null
        };
      }
      return { assistantContent: String(dataToParse), assistantCode: '' };
    }

    async _sendPrompt() {
      const prompt = this._promptInput.value.trim();
      if (!prompt && this._pendingAttachments.length === 0) return;

      this._isLoading = true;
      const userMessage = {
        role: 'user',
        content: prompt,
        attachments: this._pendingAttachments,
        include_entities: [...this._selectedEntities],
        timestamp: new Date().toISOString()
      };
      if (this._currentCode && (this._isCodeUserModified || this._activeFilePath)) {
        userMessage.code = this._currentCode;
        if (this._activeFilePath) {
          userMessage.filepath = this._activeFilePath;
        }
      }
      this._chatHistory = [...this._chatHistory, userMessage];

      // Attachments logic: We keep them in frontend history, but 
      // to backend we only send logic if supported. 
      // CURRENTLY: We send them in 'attachments' key if service supports it.
      // Our 'generate_code' service parses them now.

      // We send attachments as list of {filename, content}
      const attachmentsToSend = [...this._pendingAttachments];

      this._pendingAttachments = [];
      this._promptInput.value = '';
      this._saveToStorage();

      // Prepare payload
      const requestData = {
        prompt: prompt,
        provider_id: this._selectedProvider,
        attachments: attachmentsToSend,
        include_entities: [...this._selectedEntities],
        file_path: this._activeFilePath
      };

      if (this._hass.user?.id) { requestData.user_id = this._hass.user.id; }
      if (this._currentCode && (this._isCodeUserModified || this._activeFilePath)) {
        requestData.code = this._currentCode;
      }

      this._selectedEntities = [];

      try {
        const response = await this._callServiceWithRetry({
          type: AICodeTaskCard.CONSTANTS.WS.GENERATE,
          ...requestData
        });

        const { assistantContent, assistantCode, providerName } = this._parseResponse(response);

        if (assistantCode) {
          this._currentCode = assistantCode;
          this._isCodeUserModified = false;
          const editor = this.shadowRoot.querySelector('ha-code-editor');
          if (editor) { editor.value = assistantCode; }
        }

        this._chatHistory = [...this._chatHistory, {
          role: 'assistant',
          content: assistantContent,
          code: assistantCode,
          providerName: providerName,
          timestamp: new Date().toISOString()
        }];
      } catch (error) {
        const errorMessage = `Error: ${error.message || JSON.stringify(error)}`;
        console.error('Error calling generate_code:', error);
        this._showError(errorMessage);
        this._chatHistory = [...this._chatHistory, { role: 'assistant', content: errorMessage, code: '', timestamp: new Date().toISOString() }];
      } finally {
        this._isLoading = false;
        this._saveToStorage();

        await this.updateComplete;
        requestAnimationFrame(() => {
          if (this._promptInput) {
            this._promptInput.focus();
          }
        });
      }
    }

    // ==================== DATA PERSISTENCE & STORAGE ====================

    _loadFromStorage() {
      if (!this._storageKey) return;

      try {
        const stored = localStorage.getItem(this._storageKey);
        if (stored) {
          const data = JSON.parse(stored);
          this._chatHistory = (data.chatHistory || []).map(msg => {
            if (msg.text && !msg.content) {
              return { ...msg, content: msg.text };
            }
            return msg;
          });
          this._currentCode = data.currentCode || '';
          this._sendOnEnter = data.sendOnEnter || false;
          this._isCodeUserModified = data.isCodeUserModified || false;
          // Provider
          this._selectedProvider = data.selectedProvider || '';
          this._activeFilePath = data.activeFilePath || null;
          this._selectedEntities = data.selectedEntities || [];
        }
      } catch (e) { console.error('Failed to load from storage:', e); }
    }

    _buildStorageData(chatHistory) {
      return JSON.stringify({
        chatHistory,
        currentCode: this._currentCode,
        sendOnEnter: this._sendOnEnter,
        isCodeUserModified: this._isCodeUserModified,
        selectedProvider: this._selectedProvider,
        activeFilePath: this._activeFilePath,
        selectedEntities: this._selectedEntities,
      });
    }

    _prepareChatHistoryForStorage(chatHistory) {
      return chatHistory.map(msg => {
        if (msg.role === 'user' && msg.attachments && msg.attachments.length > 0) {
          return {
            ...msg,
            attachments: msg.attachments.map(att => ({
              filename: att.filename,
              contentLength: att.content ? att.content.length : 0
            }))
          };
        }
        return msg;
      });
    }

    _saveToStorage() {
      if (!this._storageKey) return;

      try {
        let chatToSave = this._chatHistory;
        if (chatToSave.length > AICodeTaskCard.CONSTANTS.FILE.MAX_HISTORY) {
          chatToSave = chatToSave.slice(-AICodeTaskCard.CONSTANTS.FILE.MAX_HISTORY);
        }

        const chatHistoryForStorage = this._prepareChatHistoryForStorage(chatToSave);
        const dataToStore = this._buildStorageData(chatHistoryForStorage);

        localStorage.setItem(this._storageKey, dataToStore);
      } catch (e) {
        // Simplistic quota handling for brevity
        console.warn('Handling quota exceeded or error:', e);
        // Try minimal save
        try {
          const reducedHistory = this._chatHistory.slice(-5);
          const dataToStore = this._buildStorageData(this._prepareChatHistoryForStorage(reducedHistory));
          localStorage.setItem(this._storageKey, dataToStore);
        } catch (e2) { }
      }
    }

    // ==================== BUSINESS LOGIC (SYNC & CLEAR) ====================

    async _clearChat() {
      this._showConfirmationDialog({
        title: this._localize('dialog.clear_chat.title'),
        text: this._localize('dialog.clear_chat.text'),
        confirmText: this._localize('dialog.clear_chat.confirm'),
        cancelText: this._localize('dialog.cancel'),
        confirmAction: async () => {
          this._isLoading = true;
          try {
            const serviceData = {};
            if (this._hass.user?.id) { serviceData.user_id = this._hass.user.id; }
            await this._callServiceWithRetry({
              type: AICodeTaskCard.CONSTANTS.WS.CLEAR_HISTORY,
              ...serviceData
            });
          } catch (error) {
            console.warn('Failed to clear backend memory:', error);
            this._showError('Could not clear backend memory. Cleared frontend state only.', 'warning');
          } finally {
            this._isLoading = false;
            this._chatHistory = [];
            this._currentCode = '';
            this._isCodeUserModified = false;
            this._pendingAttachments = [];
            this._saveToStorage();

            const editor = this.shadowRoot.querySelector('ha-code-editor');
            if (editor) { editor.value = ''; }
            const textarea = this.shadowRoot.querySelector('.code-output');
            if (textarea) { textarea.value = ''; }
          }
        }
      });
    }

    async _syncChatHistory() {
      this._showConfirmationDialog({
        title: this._localize('dialog.sync.title'),
        text: this._localize('dialog.sync.text'),
        confirmText: this._localize('dialog.sync.confirm'),
        cancelText: this._localize('dialog.cancel'),
        confirmAction: async () => {
          this._isLoading = true;
          try {
            const serviceData = { limit: 50 };
            if (this._hass.user?.id) { serviceData.user_id = this._hass.user.id; }
            const response = await this._callServiceWithRetry({
              type: AICodeTaskCard.CONSTANTS.WS.SYNC_HISTORY,
              ...serviceData
            });
            if (response?.messages) {
              this._chatHistory = response.messages.map(msg => {
                // Backend now sends structured segments?
                // Actually our history service stores full JSON payload for user/assistant if it parsed it
                // Or might be raw string. 
                // In services.py we save json.dumps({...}). 
                // So msg.content is likely a JSON string we need to parse.

                let text = msg.content;
                let code = '';
                let providerName = null;
                let attachments = [];
                let include_entities = [];
                try {
                  const parsed = JSON.parse(msg.content);
                  text = parsed.response_text || msg.content;
                  code = parsed.response_code || '';
                  providerName = parsed.provider_name || null;
                  attachments = parsed.attachments || [];
                  include_entities = parsed.include_entities || [];
                  var filepath = parsed.file_path || null;
                } catch (e) {
                  // It's raw text
                }

                if (msg.role === 'user') {
                  return {
                    role: 'user',
                    content: text,
                    code: code,
                    attachments: attachments,
                    include_entities: include_entities,
                    filepath: filepath,
                    timestamp: new Date(msg.timestamp * 1000).toISOString()
                  };
                } else {
                  return {
                    role: 'assistant',
                    content: text,
                    code: code,
                    attachments: attachments,
                    include_entities: include_entities,
                    providerName: providerName,
                    timestamp: new Date(msg.timestamp * 1000).toISOString()
                  };
                }
              });

              const lastAssistant = [...this._chatHistory].reverse().find(m => m.role === 'assistant' && m.code);
              if (lastAssistant) {
                this._currentCode = lastAssistant.code;
                this._isCodeUserModified = false;
                await this.updateComplete;
                const editor = this.shadowRoot.querySelector('ha-code-editor');
                if (editor) { editor.value = lastAssistant.code; }
              }
              this._saveToStorage();
              this._showError(`${this._localize('msg.synced')} ${response.messages.length} ${this._localize('msg.messages')}`, 'success', 3000);
            }
          } catch (error) {
            console.error('Failed to sync chat history:', error);
            this._showError(this._localize('error.sync_fail'));
          } finally {
            this._isLoading = false;
          }
        }
      });
    }

    // ==================== EVENT HANDLERS ====================

    _toggleSendOnEnter() {
      this._sendOnEnter = !this._sendOnEnter;
      this._saveToStorage();
    }

    _handleKeyDown(event) {
      if (event.key === 'Enter' && !event.shiftKey && this._sendOnEnter) {
        event.preventDefault();
        this._sendPrompt();
      }
    }

    async _handleFileSelect(event) {
      const files = event.target.files;
      if (!files) return;
      for (const file of files) {
        await this._processFile(file);
      }
      event.target.value = '';
    }

    async _processFile(file) {
      const extension = '.' + file.name.split('.').pop().toLowerCase();
      const allowedMimes = this._allowedFilesMap[extension] || [];

      if (!allowedMimes.length) {
        this._showError(`${this._localize('error.file_type')}: ${file.name}`);
        return;
      }

      if (file.size > AICodeTaskCard.CONSTANTS.FILE.MAX_SIZE_BYTES) {
        this._showError(`${this._localize('error.file_size')}: ${file.name}`);
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        const attachment = {
          filename: file.name,
          content: e.target.result,
          contentType: file.type,
          isImage: false
        };
        this._pendingAttachments = [...this._pendingAttachments, attachment];
      };
      reader.readAsText(file);
    }


    _clearAttachment(index) {
      this._pendingAttachments = this._pendingAttachments.filter((_, i) => i !== index);
    }

    _debouncedSave() {
      if (this._saveDebounceTimeout) {
        clearTimeout(this._saveDebounceTimeout);
      }
      this._saveDebounceTimeout = setTimeout(() => {
        this._saveToStorage();
      }, AICodeTaskCard.CONSTANTS.UI.SAVE_DEBOUNCE_MS);
    }

    // ==================== CODE EDITOR MANAGEMENT ====================

    _createCodeEditor() {
      const container = this._codeEditorContainer;
      if (!container) return;
      container.innerHTML = '';
      if (customElements.get('ha-code-editor')) {
        this._isEditorFallback = false;
        const codeEditor = document.createElement('ha-code-editor');
        codeEditor.hass = this._hass;
        codeEditor.mode = 'jinja2';
        codeEditor.value = this._currentCode || '';
        codeEditor.setAttribute('dir', 'ltr');
        codeEditor.addEventListener('value-changed', (e) => {
          if (e.detail.value !== this._currentCode) {
            this._currentCode = e.detail.value;
            this._isCodeUserModified = true;
            this._debouncedSave();
          }
        });
        container.appendChild(codeEditor);
      } else {
        this._isEditorFallback = true;
        const textarea = document.createElement('textarea');
        textarea.className = 'code-output';
        textarea.value = this._currentCode || '';
        textarea.addEventListener('input', (e) => {
          this._currentCode = e.target.value;
          this._isCodeUserModified = true;
          this._debouncedSave();
        });
        container.appendChild(textarea);
      }
    }

    _loadAttachmentIntoEditor(attachment) {
      if (!attachment.content) return;
      this._currentCode = attachment.content;
      this._activeFilePath = attachment.filename;
      this._isCodeUserModified = false;
      const editor = this.shadowRoot.querySelector('ha-code-editor');
      if (editor) { editor.value = attachment.content; }
      const textarea = this.shadowRoot.querySelector('.code-output');
      if (textarea) { textarea.value = attachment.content; }
      this._showError(`${this._localize('msg.loaded')}: ${attachment.filename}`, 'success', 2000);
    }

    async _copyToClipboardHelper(text, successMsgKey) {
      if (!text) return;
      try {
        if (navigator.clipboard && window.isSecureContext) {
          await navigator.clipboard.writeText(text);
          this._showError(this._localize(successMsgKey), 'success', 2000);
        } else {
          throw new Error('Clipboard API unavailable');
        }
      } catch (err) {
        try {
          const textArea = document.createElement("textarea");
          textArea.value = text;
          textArea.style.position = "fixed";
          textArea.style.left = "-9999px";
          textArea.style.top = "0";
          document.body.appendChild(textArea);
          textArea.focus();
          textArea.select();
          const successful = document.execCommand('copy');
          document.body.removeChild(textArea);
          if (successful) {
            this._showError(this._localize(successMsgKey), 'success', 2000);
          } else {
            throw new Error('Fallback failed');
          }
        } catch (fallbackErr) {
          console.error('Copy failed:', fallbackErr);
          this._showError(this._localize('error.copy_fail'));
        }
      }
    }

    _copyCode() {
      this._copyToClipboardHelper(this._currentCode, 'msg.code_copied');
    }

    _clearCodeEditor() {
      this._showConfirmationDialog({
        title: this._localize('dialog.clear_editor.title'),
        text: this._localize('dialog.clear_editor.text'),
        confirmText: this._localize('dialog.clear_editor.confirm'),
        cancelText: this._localize('dialog.cancel'),
        confirmAction: () => {
          this._currentCode = '';
          this._isCodeUserModified = false;
          const editor = this.shadowRoot.querySelector('ha-code-editor');
          if (editor) { editor.value = ''; }
          const textarea = this.shadowRoot.querySelector('.code-output');
          if (textarea) { textarea.value = ''; }
          this._showError(this._localize('msg.code_cleared'), 'success', 2000);
        }
      });
    }

    // ==================== UTILITY METHODS ====================

    _formatTime(timestamp) {
      try {
        const date = new Date(timestamp);
        const hours = date.getHours().toString().padStart(2, '0');
        const minutes = date.getMinutes().toString().padStart(2, '0');
        return `${hours}:${minutes}`;
      } catch (e) { return ''; }
    }


    _renderMarkdownFallback(text) {
      if (!text) return "";
      const lines = text.split('\n');
      const elements = [];
      let inList = false;
      let listItems = [];

      const flushList = () => {
        if (listItems.length > 0) {
          elements.push(html`<ul>${listItems}</ul>`);
          listItems = [];
        }
        inList = false;
      };

      lines.forEach(line => {
        const trimmed = line.trim();
        if (trimmed.startsWith('# ') || trimmed.startsWith('## ') || trimmed.startsWith('### ')) {
          flushList();
          const level = trimmed.indexOf(' ');
          const title = trimmed.substring(level + 1);
          if (level === 1) elements.push(html`<h1>${this._renderInlineMarkdown(title)}</h1>`);
          else if (level === 2) elements.push(html`<h2>${this._renderInlineMarkdown(title)}</h2>`);
          else elements.push(html`<h3>${this._renderInlineMarkdown(title)}</h3>`);
        } else if (trimmed.startsWith('* ') || trimmed.startsWith('- ')) {
          inList = true;
          listItems.push(html`<li>${this._renderInlineMarkdown(trimmed.substring(2))}</li>`);
        } else if (trimmed === '') {
          flushList();
          elements.push(html`<div style="height: 8px;"></div>`);
        } else {
          flushList();
          elements.push(html`<p>${this._renderInlineMarkdown(line)}</p>`);
        }
      });
      flushList();
      return elements;
    }

    _renderInlineMarkdown(text) {
      if (!text) return "";
      const parts = text.split(/(\*\*.*?\*\*|`.*?`)/g);
      return parts.map(part => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return html`<b>${part.substring(2, part.length - 2)}</b>`;
        }
        if (part.startsWith('`') && part.endsWith('`')) {
          return html`<code>${part.substring(1, part.length - 1)}</code>`;
        }
        return part;
      });
    }

    _loadCodeFromMessage(msg) {
      if (!msg.code) return;
      this._currentCode = msg.code;
      this._isCodeUserModified = false;
      const editor = this.shadowRoot.querySelector('ha-code-editor');
      if (editor) { editor.value = msg.code; }
      const textarea = this.shadowRoot.querySelector('.code-output');
      if (textarea) { textarea.value = msg.code; }
      this._showError(this._localize('msg.code_loaded'), 'success', 2000);
    }

    // ==================== ENTITY SELECTOR LOGIC ====================

    _toggleEntitySelector() {
      this._entitySelectorOpen = !this._entitySelectorOpen;
      if (!this._entitySelectorOpen) {
        this._entitySelectorSearchQuery = '';
      }
    }

    _handleEntitySearch(e) {
      this._entitySelectorSearchQuery = e.target.value.toLowerCase();
    }

    _addEntityToSelection(entityId) {
      if (!this._selectedEntities.includes(entityId)) {
        this._selectedEntities = [...this._selectedEntities, entityId];
      }
      this._entitySelectorSearchQuery = '';
      const input = this.shadowRoot.querySelector('.entity-search-input');
      if (input) { input.value = ''; }
    }

    _removeEntityFromSelection(entityId) {
      this._selectedEntities = this._selectedEntities.filter(id => id !== entityId);
    }

    _renderEntitySelectorModal() {
      const filteredEntities = this._entitySelectorSearchQuery.length >= 2
        ? Object.keys(this._hass.states)
          .filter(id => {
            const state = this._hass.states[id];
            const friendlyName = (state.attributes && state.attributes.friendly_name) || '';
            return id.toLowerCase().includes(this._entitySelectorSearchQuery) ||
              friendlyName.toLowerCase().includes(this._entitySelectorSearchQuery);
          })
          .slice(0, 50)
        : [];

      return html`
          <div class="entity-selector-modal" @click=${(e) => e.target.className === 'entity-selector-modal' && this._toggleEntitySelector()}>
            <div class="entity-selector-content">
              <h3 style="margin: 0 0 12px 0;">${this._localize('entity_selector.title')}</h3>
              
              <input 
                type="text" 
                class="entity-search-input" 
                placeholder="${this._localize('input.add_entity')}..."
                @input=${this._handleEntitySearch}
                class="entity-input"
              >

              ${filteredEntities.length > 0 ? html`
                <div class="entity-search-results">
                  ${filteredEntities.map(id => html`
                    <div class="entity-search-item" @click=${() => this._addEntityToSelection(id)}>
                      <strong>${this._hass.states[id].attributes.friendly_name || id}</strong>
                      <span class="entity-id">${id}</span>
                    </div>
                  `)}
                </div>
              ` : this._entitySelectorSearchQuery.length >= 2 ? html`
                <div style="padding: 8px; font-size: 12px; opacity: 0.7;">No entities found.</div>
              ` : ''}
              
              <div class="entity-selector-list" style="margin-top: 16px;">
                ${this._selectedEntities.length > 0 ? html`
                  <div style="font-size: 12px; font-weight: bold; margin-bottom: 8px; opacity: 0.8;">Selected:</div>
                ` : ''}
                ${this._selectedEntities.map(entityId => html`
                  <div class="selected-entity-item">
                    <span>${entityId}</span>
                    <button class="btn-icon" @click=${() => this._removeEntityFromSelection(entityId)}>
                      <ha-icon icon="mdi:close"></ha-icon>
                    </button>
                  </div>
                `)}
              </div>

              <div class="dialog-buttons">
                <button class="confirm-btn" @click=${this._toggleEntitySelector}>${this._localize('entity_selector.confirm')}</button>
              </div>
            </div>
          </div>
        `;
    }

    _copyChatCodeToClipboard(code) {
      this._copyToClipboardHelper(code, 'msg.code_copied');
    }

    getGridOptions() {
      return { columns: 12, rows: 9 };
    }
  }

  if (!customElements.get('ai-code-task-card')) {
    customElements.define('ai-code-task-card', AICodeTaskCard);
  }

  class AICodeTaskCardEditor extends LitElement {
    static get properties() {
      return {
        _hass: { type: Object },
        _config: { type: Object },
        _translations: { type: Object, state: true },
      };
    }

    setConfig(config) {
      this._config = config;
    }

    constructor() {
      super();
      this._translations = {};
      this._language = '';
    }

    set hass(hass) {
      const oldLanguage = this._hass?.language;
      this._hass = hass;
      if (hass?.language && hass.language !== oldLanguage) {
        this._loadTranslations(hass.language);
      }
    }

    get hass() {
      return this._hass;
    }

    async _loadTranslations(language) {
      if (this._language === language && Object.keys(this._translations).length > 0) return;
      this._language = language;
      try {
        const response = await fetch(`${AICodeTaskCard.CONSTANTS.BASE_URL}/localize/${language}.json`);
        if (response.ok) {
          this._translations = await response.json();
        } else if (language !== 'en') {
          await this._loadTranslations('en');
        }
      } catch (e) {
        if (language !== 'en') await this._loadTranslations('en');
      }
    }

    _localize(key) {
      return this._translations[key] || key;
    }

    _valueChanged(ev) {
      const event = new CustomEvent("config-changed", {
        detail: { config: ev.detail.value },
        bubbles: true,
        composed: true,
      });
      this.dispatchEvent(event);
    }
    render() {
      return html`
      <ha-form
        .hass=${this._hass}
        .data=${this._config}
        .schema=${[{ name: "theme", selector: { theme: {} } }]}
        .computeLabel=${() => this._localize('editor.theme')}
        @value-changed=${this._valueChanged}
      ></ha-form>`;
    }
  }
  if (!customElements.get('ai-code-task-card-editor')) {
    customElements.define('ai-code-task-card-editor', AICodeTaskCardEditor);
  }


  console.info(
    `%c AI-CODE-TASK-CARD %c Version ${AICodeTaskCard.CONSTANTS.VERSION} `,
    'color: white; background: #9c27b0; font-weight: bold;',
    'color: #9c27b0; background: white; font-weight: bold;'
  );
};

run();
