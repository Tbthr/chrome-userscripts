// ==UserScript==
// @name         Translate X Post with AI (Markdown Support & Multi-Engine)
// @namespace    http://tampermonkey.net/
// @version      3.2
// @description  Dynamically translate X posts using custom AI engines (Volcengine, DeepSeek, OpenAI, etc.) with Markdown support and beautiful settings modal.
// @author       You
// @match        https://x.com/*
// @match        https://twitter.com/*
// @grant        GM.xmlHttpRequest
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @run-at       document-idle
// @require      https://cdn.jsdelivr.net/npm/marked@5.1.2/marked.min.js
// @require      https://cdn.jsdelivr.net/npm/dompurify@3.1.6/dist/purify.min.js
// @downloadURL  https://raw.githubusercontent.com/joeseesun/qiaomu-userscripts/main/%E6%8E%A8%E7%89%B9%E5%B8%96%E5%AD%90%E7%BF%BB%E8%AF%91/X%E7%BF%BB%E8%AF%91.js
// @updateURL    https://raw.githubusercontent.com/joeseesun/qiaomu-userscripts/main/%E6%8E%A8%E7%89%B9%E5%B8%96%E5%AD%90%E7%BF%BB%E8%AF%91/X%E7%BF%BB%E8%AF%91.js
// @homepageURL  https://github.com/joeseesun/qiaomu-userscripts
// @supportURL   https://github.com/joeseesun/qiaomu-userscripts/issues
// ==/UserScript==

// 用户配置选项
const CONFIG = {
    // 卡片展示配置
    CARD: {
        AUTO_EXPAND: true,          // 是否自动展开翻译卡片
        EXPAND_DELAY: 1000,          // 自动展开延迟时间（毫秒）
        INITIAL_STATE: 'expanded',  // 初始状态：'expanded' 或 'collapsed'
        ANIMATION_DURATION: 300,    // 动画持续时间（毫秒）
        MAX_HEIGHT: '1000px'        // 展开时的最大高度
    }
};

console.log('[X-Translate] Script loaded and running on:', window.location.href);

// 样式配置（便于修改）
const STYLES = {
    TRANSLATION_CONTAINER: {
        margin: '10px 0',
        padding: '12px 14px',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        fontSize: '15px',
        lineHeight: '1.6',
        color: 'inherit'
    }
};

// 预设配置
const PRESETS = {
    volcengine: {
        name: '火山方舟',
        baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
        model: 'ep-20250222222029-sx6sd'
    },
    deepseek: {
        name: 'DeepSeek',
        baseUrl: 'https://api.deepseek.com',
        model: 'deepseek-chat'
    },
    openai: {
        name: 'OpenAI',
        baseUrl: 'https://api.openai.com/v1',
        model: 'gpt-4o-mini'
    },
    custom: {
        name: '自定义',
        baseUrl: '',
        model: ''
    }
};

const DEFAULT_SYSTEM_PROMPT = `你是个超级人工智能助手`;

const DEFAULT_USER_PROMPT = `处理说明：
1. 将输入文本翻译为简体中文，只返回翻译结果，不包含任何解释或额外信息。注意：保留原文的 Markdown 格式标记（如 **加粗**、*斜体*、链接等），并严格保留原文的段落结构（用空行分隔段落，不要将多个段落合并为一个段落）。
2. 吐槽原帖子，使用百度贴吧臭嘴老哥风格，限制50字（纯娱乐，增加斗嘴效果）。
3. 额外提炼3个值得学习的源语言单词或词汇，给出中文翻译、读音/音标和解释，限制50字。
要求：分三步处理下面的文本，支持Markdown。

输出格式：
## 🤖 翻译
[翻译内容]

## 🗣️ 回复
[回复内容]

## 📖 词汇
[词汇内容]

处理文本：`;

const STORAGE_KEYS = {
    SETTINGS: 'x_translate_settings_v3'
};

let missingApiKeyShown = false;

// 添加 Markdown 样式与配置弹窗 CSS 样式
GM_addStyle(`
    /* 翻译卡片基础样式 */
    .translation-container {
        opacity: 0;
        max-height: 0;
        overflow: hidden;
        transition: opacity 0.3s ease-in-out, max-height 0.3s ease-in-out;
        position: relative;
        background-color: rgba(0, 0, 0, 0.03);
        border: 1px solid rgba(0, 0, 0, 0.08);
        border-left: 3px solid #1d9bf0;
        border-radius: 12px;
        overflow-wrap: break-word;
        word-break: break-word;
    }
    .translation-container.show {
        opacity: 1;
        max-height: 1000px;
    }
    .translation-container.xt-dark {
        background-color: rgba(255, 255, 255, 0.08) !important;
        border: 1px solid rgba(255, 255, 255, 0.22);
        border-left: 3px solid #1d9bf0;
    }
    .translation-container h1, .translation-container h2, .translation-container h3,
    .translation-container h4, .translation-container h5, .translation-container h6 {
        margin-top: 12px;
        margin-bottom: 6px;
        font-weight: 700;
        color: inherit;
    }
    .translation-container h1 { font-size: 1.35em; }
    .translation-container h2 { font-size: 1.25em; }
    .translation-container h3 { font-size: 1.15em; }
    .translation-container h4 { font-size: 1.05em; }
    .translation-container h5, .translation-container h6 { font-size: 1em; }
    .translation-container p { margin: 8px 0; }
    .translation-container ul, .translation-container ol { padding-left: 20px; margin: 8px 0; }
    .translation-container li { margin: 3px 0; }
    .translation-container code { background-color: rgba(128, 128, 128, 0.15); padding: 2px 5px; border-radius: 4px; font-family: monospace; font-size: 0.9em; }
    .translation-container pre { background-color: rgba(128, 128, 128, 0.15); padding: 10px; border-radius: 8px; overflow: auto; margin: 10px 0; }
    .translation-container pre code { background-color: transparent; padding: 0; }
    .translation-container blockquote { border-left: 3px solid rgba(128, 128, 128, 0.4); margin: 8px 0; padding-left: 10px; opacity: 0.8; }
    .translation-container a { color: #1d9bf0; text-decoration: none; }
    .translation-container a:hover { text-decoration: underline; }
    .translation-container strong { font-weight: 700; }
    .translation-container em { font-style: italic; }
    .translation-container table { border-collapse: collapse; width: 100%; margin: 10px 0; }
    .translation-container th, .translation-container td { border: 1px solid rgba(128, 128, 128, 0.3); padding: 8px; }
    .translation-container th { background-color: rgba(128, 128, 128, 0.15); }
    .translation-container img { max-width: 100%; height: auto; border-radius: 6px; }

    /* 设置面板遮罩层 */
    .xt-modal-overlay {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.5);
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        z-index: 100000;
        display: flex;
        align-items: center;
        justify-content: center;
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.3s ease;
    }
    .xt-modal-overlay.show {
        opacity: 1;
        pointer-events: auto;
    }
    
    /* 弹窗主体 */
    .xt-modal {
        background: rgba(255, 255, 255, 0.85);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        border: 1px solid rgba(255, 255, 255, 0.4);
        border-radius: 20px;
        width: 90%;
        max-width: 500px;
        max-height: 90vh;
        box-shadow: 0 20px 40px rgba(0,0,0,0.12);
        display: flex;
        flex-direction: column;
        transform: scale(0.95);
        transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
        overflow: hidden;
        color: #0f1419;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    }
    .xt-modal-overlay.show .xt-modal {
        transform: scale(1);
    }

    /* 暗黑模式自适应 */
    .xt-modal-overlay.xt-dark .xt-modal {
        background: rgba(21, 32, 43, 0.9);
        border: 1px solid rgba(255, 255, 255, 0.1);
        color: #e7e9ea;
        box-shadow: 0 20px 40px rgba(0,0,0,0.4);
    }

    .xt-modal-header {
        padding: 20px 24px;
        border-bottom: 1px solid rgba(128, 128, 128, 0.15);
        display: flex;
        justify-content: space-between;
        align-items: center;
    }
    .xt-modal-title {
        font-size: 20px;
        font-weight: 700;
        margin: 0;
    }
    .xt-modal-close {
        background: none;
        border: none;
        font-size: 28px;
        cursor: pointer;
        color: inherit;
        opacity: 0.6;
        transition: opacity 0.2s;
        padding: 0;
        line-height: 1;
    }
    .xt-modal-close:hover {
        opacity: 1;
    }
    
    .xt-modal-body {
        padding: 20px 24px;
        overflow-y: auto;
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 16px;
    }
    .xt-form-group {
        display: flex;
        flex-direction: column;
        gap: 6px;
    }
    .xt-form-label {
        font-size: 13px;
        font-weight: 700;
        opacity: 0.9;
    }
    
    .xt-input, .xt-select, .xt-textarea {
        width: 100%;
        padding: 10px 12px;
        border-radius: 8px;
        border: 1px solid rgba(128, 128, 128, 0.3);
        background: rgba(255, 255, 255, 0.5);
        color: inherit;
        font-family: inherit;
        font-size: 14px;
        transition: all 0.2s ease;
        box-sizing: border-box;
    }
    .xt-modal-overlay.xt-dark .xt-input,
    .xt-modal-overlay.xt-dark .xt-select,
    .xt-modal-overlay.xt-dark .xt-textarea {
        border: 1px solid rgba(128, 128, 128, 0.2);
        background: rgba(0, 0, 0, 0.3);
    }
    .xt-input:focus, .xt-select:focus, .xt-textarea:focus {
        outline: none;
        border-color: #1d9bf0;
        background: rgba(255, 255, 255, 0.85);
        box-shadow: 0 0 0 2px rgba(29, 155, 240, 0.25);
    }
    .xt-modal-overlay.xt-dark .xt-input:focus,
    .xt-modal-overlay.xt-dark .xt-select:focus,
    .xt-modal-overlay.xt-dark .xt-textarea:focus {
        background: rgba(0, 0, 0, 0.5);
    }
    
    .xt-input[readonly] {
        opacity: 0.6;
        background: rgba(128, 128, 128, 0.08) !important;
        cursor: not-allowed;
    }

    .xt-providers {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 8px;
    }
    .xt-provider-btn {
        padding: 10px 4px;
        border-radius: 8px;
        border: 1px solid rgba(128, 128, 128, 0.25);
        background: rgba(128, 128, 128, 0.05);
        cursor: pointer;
        font-size: 12px;
        font-weight: 700;
        text-align: center;
        color: inherit;
        transition: all 0.2s ease;
    }
    .xt-provider-btn:hover {
        background: rgba(128, 128, 128, 0.12);
    }
    .xt-provider-btn.active {
        border-color: #1d9bf0;
        background: rgba(29, 155, 240, 0.12);
        color: #1d9bf0;
        box-shadow: 0 0 0 1px #1d9bf0;
    }

    .xt-prompt-toggle {
        display: flex;
        justify-content: space-between;
        align-items: center;
        cursor: pointer;
        font-size: 13px;
        font-weight: 700;
        padding: 10px 0;
        border-top: 1px solid rgba(128, 128, 128, 0.15);
        margin-top: 8px;
        user-select: none;
    }
    .xt-prompt-container {
        display: none;
        flex-direction: column;
        gap: 12px;
        margin-top: 4px;
        animation: xt-slide-down 0.2s ease-out;
    }
    .xt-prompt-container.show {
        display: flex;
    }
    
    @keyframes xt-slide-down {
        from { opacity: 0; transform: translateY(-5px); }
        to { opacity: 1; transform: translateY(0); }
    }

    .xt-modal-footer {
        padding: 16px 24px;
        border-top: 1px solid rgba(128, 128, 128, 0.15);
        display: flex;
        justify-content: flex-end;
        gap: 12px;
    }
    .xt-btn {
        padding: 10px 22px;
        border-radius: 9999px;
        font-weight: 700;
        font-size: 14px;
        cursor: pointer;
        transition: all 0.2s ease;
        border: none;
    }
    .xt-btn-cancel {
        background: transparent;
        color: inherit;
        border: 1px solid rgba(128, 128, 128, 0.35);
    }
    .xt-btn-cancel:hover {
        background: rgba(128, 128, 128, 0.1);
    }
    .xt-btn-save {
        background: #1d9bf0;
        color: white;
    }
    .xt-btn-save:hover {
        background: #1a8cd8;
        box-shadow: 0 4px 12px rgba(29, 155, 240, 0.35);
    }

    .xt-btn-reset {
        font-size: 11px;
        font-weight: 600;
        color: #1d9bf0;
        background: transparent;
        border: none;
        cursor: pointer;
        padding: 0;
    }
    .xt-btn-reset:hover {
        text-decoration: underline;
    }

    .xt-api-key-container {
        position: relative;
        display: flex;
        align-items: center;
    }
    .xt-api-key-container .xt-input {
        padding-right: 42px;
    }
    .xt-eye-btn {
        position: absolute;
        right: 12px;
        background: none;
        border: none;
        cursor: pointer;
        color: inherit;
        opacity: 0.5;
        transition: opacity 0.2s ease;
        padding: 0;
        font-size: 16px;
    }
    .xt-eye-btn:hover {
        opacity: 1;
    }

    /* Toast 通知 */
    .xt-toast {
        position: fixed;
        bottom: 24px;
        left: 50%;
        transform: translateX(-50%) translateY(100px);
        background: rgba(29, 155, 240, 0.95);
        color: white;
        padding: 12px 28px;
        border-radius: 9999px;
        font-weight: 700;
        font-size: 14px;
        z-index: 100001;
        box-shadow: 0 10px 24px rgba(0,0,0,0.18);
        transition: transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        pointer-events: none;
    }
    .xt-toast.show {
        transform: translateX(-50%) translateY(0);
    }
`);

// 默认配置加载器与保存逻辑
function getSettings() {
    const defaultSettings = {
        provider: 'volcengine',
        apiKey: '',
        baseUrl: PRESETS.volcengine.baseUrl,
        model: PRESETS.volcengine.model,
        systemPrompt: DEFAULT_SYSTEM_PROMPT.trim(),
        userPrompt: DEFAULT_USER_PROMPT.trim()
    };

    try {
        const stored = GM_getValue(STORAGE_KEYS.SETTINGS, '');
        if (stored) {
            const parsed = JSON.parse(stored);
            return { ...defaultSettings, ...parsed };
        }
    } catch (e) {
        console.error('[X-Translate] Failed to parse stored settings:', e);
    }
    return defaultSettings;
}

// 供快捷存储
function saveSettings(settings) {
    GM_setValue(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
}

// 清理和拼接 API Endpoint
function cleanEndpoint(baseUrl) {
    let url = baseUrl.trim();
    while (url.endsWith('/')) {
        url = url.substring(0, url.length - 1);
    }
    if (!url.endsWith('/chat/completions')) {
        url = url + '/chat/completions';
    }
    return url;
}

// 检查 X.com 明暗主题
function isDarkTheme() {
    const bodyBg = window.getComputedStyle(document.body).backgroundColor;
    if (bodyBg) {
        const rgb = bodyBg.match(/\d+/g);
        if (rgb && rgb.length >= 3) {
            const r = parseInt(rgb[0]), g = parseInt(rgb[1]), b = parseInt(rgb[2]);
            const brightness = (r * 299 + g * 587 + b * 114) / 1000;
            return brightness < 120;
        }
    }
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

// 配置面板 DOM 动态管理
let modalOverlay = null;

function createSettingsModal() {
    if (modalOverlay) {
        if (isDarkTheme()) {
            modalOverlay.classList.add('xt-dark');
        } else {
            modalOverlay.classList.remove('xt-dark');
        }
        return;
    }

    modalOverlay = document.createElement('div');
    modalOverlay.className = 'xt-modal-overlay';
    if (isDarkTheme()) {
        modalOverlay.classList.add('xt-dark');
    }

    const settings = getSettings();

    modalOverlay.innerHTML = `
        <div class="xt-modal">
            <div class="xt-modal-header">
                <h3 class="xt-modal-title">🤖 X AI 翻译配置</h3>
                <button class="xt-modal-close" id="xt-close-btn">×</button>
            </div>
            <div class="xt-modal-body">
                <div class="xt-form-group">
                    <label class="xt-form-label">服务商 (Provider)</label>
                    <div class="xt-providers">
                        <button class="xt-provider-btn ${settings.provider === 'volcengine' ? 'active' : ''}" data-provider="volcengine">火山方舟</button>
                        <button class="xt-provider-btn ${settings.provider === 'deepseek' ? 'active' : ''}" data-provider="deepseek">DeepSeek</button>
                        <button class="xt-provider-btn ${settings.provider === 'openai' ? 'active' : ''}" data-provider="openai">OpenAI</button>
                        <button class="xt-provider-btn ${settings.provider === 'custom' ? 'active' : ''}" data-provider="custom">自定义</button>
                    </div>
                </div>

                <div class="xt-form-group">
                    <label class="xt-form-label">API Key</label>
                    <div class="xt-api-key-container">
                        <input type="password" id="xt-api-key" class="xt-input" placeholder="输入 API 密钥 (API Key)" value="${settings.apiKey}">
                        <button class="xt-eye-btn" id="xt-eye-toggle">👁️</button>
                    </div>
                </div>

                <div class="xt-form-group">
                    <label class="xt-form-label">接口地址 (Base URL / Endpoint)</label>
                    <input type="text" id="xt-base-url" class="xt-input" placeholder="https://api.openai.com/v1" value="${settings.baseUrl}" ${settings.provider !== 'custom' ? 'readonly' : ''}>
                </div>

                <div class="xt-form-group">
                    <label class="xt-form-label">模型 (Model / Endpoint ID)</label>
                    <input type="text" id="xt-model" class="xt-input" placeholder="gpt-4o-mini" value="${settings.model}" ${settings.provider !== 'custom' ? 'readonly' : ''}>
                </div>

                <div>
                    <div class="xt-prompt-toggle" id="xt-prompt-toggle">
                        <span>高级选项：自定义翻译提示词 (Prompts)</span>
                        <span id="xt-prompt-arrow">▼</span>
                    </div>
                    <div class="xt-prompt-container" id="xt-prompt-container">
                        <div class="xt-form-group">
                            <div style="display:flex; justify-content:space-between; align-items:center;">
                                <label class="xt-form-label">System Prompt</label>
                                <button class="xt-btn-reset" id="xt-reset-sys">恢复默认</button>
                            </div>
                            <textarea id="xt-sys-prompt" class="xt-textarea" rows="2" style="resize:vertical;">${settings.systemPrompt}</textarea>
                        </div>
                        <div class="xt-form-group">
                            <div style="display:flex; justify-content:space-between; align-items:center;">
                                <label class="xt-form-label">User Prompt</label>
                                <button class="xt-btn-reset" id="xt-reset-user">恢复默认</button>
                            </div>
                            <textarea id="xt-user-prompt" class="xt-textarea" rows="6" style="resize:vertical;">${settings.userPrompt}</textarea>
                        </div>
                    </div>
                </div>
            </div>
            <div class="xt-modal-footer">
                <button class="xt-btn xt-btn-cancel" id="xt-cancel-btn">取消</button>
                <button class="xt-btn xt-btn-save" id="xt-save-btn">保存配置</button>
            </div>
        </div>
    `;

    document.body.appendChild(modalOverlay);
    
    const closeBtn = modalOverlay.querySelector('#xt-close-btn');
    const cancelBtn = modalOverlay.querySelector('#xt-cancel-btn');
    const saveBtn = modalOverlay.querySelector('#xt-save-btn');
    const eyeToggle = modalOverlay.querySelector('#xt-eye-toggle');
    const apiKeyInput = modalOverlay.querySelector('#xt-api-key');
    const baseUrlInput = modalOverlay.querySelector('#xt-base-url');
    const modelInput = modalOverlay.querySelector('#xt-model');
    const sysPromptInput = modalOverlay.querySelector('#xt-sys-prompt');
    const userPromptInput = modalOverlay.querySelector('#xt-user-prompt');
    const promptToggle = modalOverlay.querySelector('#xt-prompt-toggle');
    const promptContainer = modalOverlay.querySelector('#xt-prompt-container');
    const promptArrow = modalOverlay.querySelector('#xt-prompt-arrow');
    const resetSysBtn = modalOverlay.querySelector('#xt-reset-sys');
    const resetUserBtn = modalOverlay.querySelector('#xt-reset-user');
    
    let activeProvider = settings.provider;

    const providerBtns = modalOverlay.querySelectorAll('.xt-provider-btn');
    providerBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            providerBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            activeProvider = btn.dataset.provider;

            if (activeProvider !== 'custom') {
                const preset = PRESETS[activeProvider];
                baseUrlInput.value = preset.baseUrl;
                modelInput.value = preset.model;
                baseUrlInput.setAttribute('readonly', 'true');
                modelInput.setAttribute('readonly', 'true');
            } else {
                baseUrlInput.removeAttribute('readonly');
                modelInput.removeAttribute('readonly');
                if (settings.provider !== 'custom') {
                    baseUrlInput.value = '';
                    modelInput.value = '';
                }
            }
        });
    });

    eyeToggle.addEventListener('click', () => {
        if (apiKeyInput.type === 'password') {
            apiKeyInput.type = 'text';
            eyeToggle.textContent = '🔒';
        } else {
            apiKeyInput.type = 'password';
            eyeToggle.textContent = '👁️';
        }
    });

    promptToggle.addEventListener('click', () => {
        const isShown = promptContainer.classList.toggle('show');
        promptArrow.textContent = isShown ? '▲' : '▼';
    });

    resetSysBtn.addEventListener('click', () => {
        sysPromptInput.value = DEFAULT_SYSTEM_PROMPT.trim();
    });
    resetUserBtn.addEventListener('click', () => {
        userPromptInput.value = DEFAULT_USER_PROMPT.trim();
    });

    const closeModal = () => {
        modalOverlay.classList.remove('show');
    };

    closeBtn.addEventListener('click', closeModal);
    cancelBtn.addEventListener('click', closeModal);
    modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) closeModal();
    });

    saveBtn.addEventListener('click', () => {
        const apiKey = apiKeyInput.value.trim();
        const baseUrl = baseUrlInput.value.trim();
        const model = modelInput.value.trim();
        const systemPrompt = sysPromptInput.value.trim();
        const userPrompt = userPromptInput.value.trim();

        if (!apiKey) {
            alert('API Key 不能为空。');
            return;
        }
        if (!baseUrl) {
            alert('接口地址 (Base URL) 不能为空。');
            return;
        }
        if (!model) {
            alert('模型名称 (Model) 不能为空。');
            return;
        }

        const newSettings = {
            provider: activeProvider,
            apiKey,
            baseUrl,
            model,
            systemPrompt,
            userPrompt
        };

        saveSettings(newSettings);
        closeModal();
        showToast('配置保存成功！刷新 X 页面后生效');
    });
}

function showSettingsModal() {
    createSettingsModal();
    const settings = getSettings();
    const modal = modalOverlay;
    
    const providerBtns = modal.querySelectorAll('.xt-provider-btn');
    providerBtns.forEach(btn => {
        if (btn.dataset.provider === settings.provider) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    modal.querySelector('#xt-api-key').value = settings.apiKey;
    modal.querySelector('#xt-base-url').value = settings.baseUrl;
    modal.querySelector('#xt-model').value = settings.model;
    modal.querySelector('#xt-sys-prompt').value = settings.systemPrompt;
    modal.querySelector('#xt-user-prompt').value = settings.userPrompt;

    if (settings.provider !== 'custom') {
        modal.querySelector('#xt-base-url').setAttribute('readonly', 'true');
        modal.querySelector('#xt-model').setAttribute('readonly', 'true');
    } else {
        modal.querySelector('#xt-base-url').removeAttribute('readonly');
        modal.querySelector('#xt-model').removeAttribute('readonly');
    }

    setTimeout(() => {
        modal.classList.add('show');
    }, 50);
}

let toastEl = null;
function showToast(message) {
    if (!toastEl) {
        toastEl = document.createElement('div');
        toastEl.className = 'xt-toast';
        document.body.appendChild(toastEl);
    }
    toastEl.textContent = message;
    toastEl.classList.add('show');
    setTimeout(() => {
        toastEl.classList.remove('show');
    }, 3000);
}

if (typeof GM_registerMenuCommand === 'function') {
    GM_registerMenuCommand('⚙️ 配置 AI 翻译 API', showSettingsModal);
}

function getApiConfig(originalElement) {
    const settings = getSettings();
    if (settings.apiKey) {
        return settings;
    }

    if (!missingApiKeyShown) {
        missingApiKeyShown = true;
        setTranslation({
            element: originalElement,
            translatedText: '请先配置 AI 翻译 API 接口以开始自动翻译。'
        });

        setTimeout(() => {
            if (window.confirm('X 翻译脚本需要先配置 AI API 密钥。现在前往配置吗？')) {
                showSettingsModal();
            }
        }, 300);
    }

    return null;
}

// 工具函数：提取纯文本
function getPlainText(element) {
    if (!element) return '';
    const text = element.innerText || element.textContent || '';
    return text.replace(/\s+/g, ' ').trim();
}

// 工具函数：将 HTML 元素转为 Markdown，保留加粗、斜体、链接、换行等格式
function htmlToMarkdown(element) {
    if (!element) return '';

    function processNode(node) {
        if (node.nodeType === Node.TEXT_NODE) {
            return node.textContent || '';
        }
        if (node.nodeType !== Node.ELEMENT_NODE) return '';

        const tag = node.tagName.toLowerCase();
        const children = Array.from(node.childNodes).map(processNode).join('');

        switch (tag) {
            case 'strong': case 'b':
                return `**${children}**`;
            case 'em': case 'i':
                return `*${children}*`;
            case 'a': {
                const href = node.getAttribute('href') || '';
                const text = node.textContent || '';
                return href && text ? `[${text}](${href})` : text;
            }
            case 'br':
                return '\n';
            case 'p':
                return `${children}\n\n`;
            case 'code':
                return `\`${children}\``;
            case 'pre':
                return `\`\`\`\n${children}\n\`\`\``;
            case 'blockquote':
                return children.split('\n').map(l => `> ${l}`).join('\n');
            case 'ul':
                return Array.from(node.children).map(li => `- ${Array.from(li.childNodes).map(processNode).join('')}`).join('\n') + '\n';
            case 'ol':
                return Array.from(node.children).map((li, i) => `${i + 1}. ${Array.from(li.childNodes).map(processNode).join('')}`).join('\n') + '\n';
            default:
                return children;
        }
    }

    return Array.from(element.childNodes).map(processNode).join('').trim();
}

// 工具函数：设置翻译结果到元素，支持 Markdown
function setTranslation({ element, translatedText }) {
    if (!element || !translatedText || translatedText === 'Translation failed') return;

    // 检查是否已插入翻译，避免重复
    let nextElement = element.nextSibling;
    while (nextElement) {
        if (nextElement.nodeType === Node.ELEMENT_NODE && nextElement.classList && nextElement.classList.contains('translation-container')) {
            console.log('[X-Translate] Translation already exists, skipping...');
            return;
        }
        nextElement = nextElement.nextSibling;
    }

    // 检查父元素的所有子元素
    if (element.parentNode) {
        const siblings = element.parentNode.querySelectorAll('.translation-container');
        for (const sibling of siblings) {
            if (sibling.previousElementSibling === element) {
                console.log('[X-Translate] Translation already exists (found by parent query), skipping...');
                return;
            }
        }
    }

    const translationContainer = document.createElement('div');
    translationContainer.className = 'translation-container';

    translationContainer.style.cssText = `
        margin: ${STYLES.TRANSLATION_CONTAINER.margin};
        padding: ${STYLES.TRANSLATION_CONTAINER.padding};
        font-family: ${STYLES.TRANSLATION_CONTAINER.fontFamily};
        font-size: ${STYLES.TRANSLATION_CONTAINER.fontSize};
        line-height: ${STYLES.TRANSLATION_CONTAINER.lineHeight};
        color: ${STYLES.TRANSLATION_CONTAINER.color};
    `;

    try {
        if (typeof marked !== 'undefined') {
            marked.setOptions({
                breaks: true,
                gfm: true,
                headerIds: false,
                mangle: false,
            });

            const rawHtml = marked.parse(translatedText);
            translationContainer.innerHTML = typeof DOMPurify !== 'undefined'
                ? DOMPurify.sanitize(rawHtml)
                : rawHtml;
        } else {
            console.warn('[X-Translate] Marked library not loaded, falling back to basic formatting');
            const contentWrapper = document.createElement('div');
            contentWrapper.className = 'content-wrapper';
            contentWrapper.innerHTML = translatedText.replace(/\n/g, '<br>');
            translationContainer.appendChild(contentWrapper);
        }
    } catch (e) {
        console.error('[X-Translate] Error rendering Markdown:', e);
        translationContainer.innerHTML = translatedText.replace(/\n/g, '<br>');
    }

    if (isDarkTheme()) {
        translationContainer.classList.add('xt-dark');
    }

    const parent = element.parentNode;
    if (parent) {
        const nextSibling = element.nextSibling;
        if (nextSibling) {
            parent.insertBefore(translationContainer, nextSibling);
        } else {
            parent.appendChild(translationContainer);
        }

        // 使用 requestAnimationFrame 确保 DOM 更新后再添加显示类
        requestAnimationFrame(() => {
            translationContainer.classList.add('show');
        });
    } else {
        console.warn('[X-Translate] No parent node found for translation insertion');
    }
}

function getPostElements() {
    return document.querySelectorAll('article[data-testid="tweet"], div[data-testid="tweet"]');
}

// 获取推文文本并过滤（精细化状态机，完美过滤中文与非翻译文本）
function getTweetTextElement(tweetElement) {
    const selectors = [
        'div[data-testid="tweetText"]',
        'div.css-146c3p1.r-bcqeeo.r-1ttztb7',
        'span[data-testid="tweet-text"]',
        'div[data-testid="newTweetText"]'
    ];
    
    let textElement = null;
    for (const selector of selectors) {
        textElement = tweetElement.querySelector(selector);
        if (textElement) break;
    }
    
    if (!textElement) {
        return { status: 'retry' };
    }
    
    const text = getPlainText(textElement);
    if (!text) {
        return { status: 'retry' };
    }
    
    // 1. 严格过滤中文：只要含有中文字符，则不翻译，不发起任何 API 请求
    if (/[\u4e00-\u9fa5]/.test(text)) {
        return { status: 'skip', reason: 'contains_chinese', text };
    }
    
    // 2. 过滤无翻译意义的推文：纯数字、纯符号、纯 Emoji 等（要求至少含有一个有效的外语字母/符号）
    // 包含：拉丁字母、日文平假名/片假名、韩文、西里尔字母
    const hasTranslatableChar = /[a-zA-Z\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af\u0400-\u04ff]/.test(text);
    if (!hasTranslatableChar) {
        return { status: 'skip', reason: 'no_translatable_char', text };
    }
    
    const formattedText = htmlToMarkdown(textElement);
    return { status: 'success', text, formattedText, element: textElement };
}

function translateText(text, originalElement) {
    console.log('[X-Translate] Starting translation for text snippet:', text.substring(0, 30));
    if (!text || text === 'No post text found') {
        console.warn('[X-Translate] No valid text to translate');
        return;
    }

    const apiConfig = getApiConfig(originalElement);
    if (!apiConfig) return;

    const combinedInput = `${apiConfig.userPrompt}${text}`;

    const requestBody = {
        model: apiConfig.model,
        messages: [
            {"role": "system", "content": apiConfig.systemPrompt},
            {"role": "user", "content": combinedInput}
        ]
    };

    const targetEndpoint = cleanEndpoint(apiConfig.baseUrl);

    console.log('[X-Translate] Sending GM.xmlHttpRequest to:', targetEndpoint, 'with model:', apiConfig.model);
    GM.xmlHttpRequest({
        method: 'POST',
        url: targetEndpoint,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiConfig.apiKey}`
        },
        data: JSON.stringify(requestBody),
        timeout: 10000,
        onload: function(response) {
            console.log('[X-Translate] GM.xmlHttpRequest response status:', response.status);
            if (response.status === 200) {
                try {
                    const responseJson = JSON.parse(response.responseText);
                    const translatedText = responseJson.choices?.[0]?.message?.content || 'Translation failed';
                    console.log('[X-Translate] Parsed translated text snippet:', translatedText.substring(0, 30));
                    setTranslation({ element: originalElement, translatedText });
                } catch (e) {
                    console.error('[X-Translate] Failed to parse response:', e, 'Raw response:', response.responseText);
                    setTranslation({ element: originalElement, translatedText: '解析 API 响应失败，请重试。' });
                }
            } else {
                console.error('[X-Translate] API request failed with status:', response.status, 'Response:', response.responseText);
                let errorMsg = '翻译失败，服务商接口返回错误。';
                if (response.status === 401) {
                    errorMsg += '（请点击“配置”检查 API Key 是否正确）';
                } else if (response.status === 404) {
                    errorMsg += '（请点击“配置”检查模型名称与 Endpoint URL 是否正确）';
                } else {
                    errorMsg += `(错误码: ${response.status})`;
                }
                setTranslation({ element: originalElement, translatedText: errorMsg });
            }
        },
        onerror: function(error) {
            console.error('[X-Translate] GM.xmlHttpRequest error:', error);
            setTranslation({ element: originalElement, translatedText: '网络请求错误，请检查您的网络连接或接口地址是否可用。' });
        },
        onabort: function() {
            console.error('[X-Translate] GM.xmlHttpRequest aborted');
        },
        ontimeout: function() {
            console.error('[X-Translate] GM.xmlHttpRequest timed out');
            setTranslation({ element: originalElement, translatedText: '请求超时，请检查接口服务响应速度或您的加速网络。' });
        }
    });
}

// IntersectionObserver to trigger translation only when tweet is visible in viewport
const tweetVisibilityObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            const tweetEl = entry.target;
            if (tweetEl.getAttribute('data-xt-processed') !== 'true') {
                processTweet(tweetEl);
            }
        }
    });
}, {
    root: null,
    threshold: 0.1
});
function observeTweets() {
    const targetNode = document.querySelector('main') || document.body;
    if (!targetNode) {
        console.warn('[X-Translate] No main or body element found, observing document.body');
    }

    console.log('[X-Translate] MutationObserver starting to observe target node...');

    const observer = new MutationObserver((mutations) => {
        mutations.forEach(mutation => {
            if (mutation.addedNodes.length) {
                mutation.addedNodes.forEach(node => {
                    const isElement = node.nodeType === Node.ELEMENT_NODE;
                    const hasMatches = isElement && typeof node.matches === 'function';
                    
                    if (hasMatches && (node.matches('article[data-testid="tweet"]') || node.matches('div[data-testid="tweet"]'))) {
                        if (node.getAttribute('data-xt-processed') !== 'true') {
                            tweetObserver.observe(node);
                        }
                    } else if (isElement && node.querySelector) {
                        const isExtensionElement = hasMatches && (
                            node.matches('div.translation-container') || 
                            node.matches('div.xt-modal-overlay') || 
                            node.matches('div.xt-toast')
                        );
                        
                        if (!isExtensionElement) {
                            const tweets = Array.from(node.querySelectorAll('article[data-testid="tweet"], div[data-testid="tweet"]'))
                                .filter(tweet => tweet.getAttribute('data-xt-processed') !== 'true');
                            if (tweets.length > 0) {
                                tweets.forEach(tweet => tweetVisibilityObserver.observe(tweet));
                            }
                        }
                    }
                });
            }
        });
    });

    observer.observe(targetNode, {
        childList: true,
        subtree: true
    });

    // 初始处理现有帖子
    console.log('[X-Translate] Processing existing tweets on page load...');
    getPostElements().forEach(tweet => {
        if (tweet.getAttribute('data-xt-processed') !== 'true') {
            tweetVisibilityObserver.observe(tweet);
        }
    });
}

// 状态化推文捕获处理，具备高度生命周期保护，彻底解决重复处理和不必要的 CPU 消耗
function processTweet(tweetElement, attempt = 0) {
    if (tweetElement.getAttribute('data-xt-processed') === 'true') {
        return;
    }

    const result = getTweetTextElement(tweetElement);

    if (result.status === 'success') {
        // 成功提取到符合条件的外语，标记为已处理，并进行翻译
        tweetElement.setAttribute('data-xt-processed', 'true');
        console.log(`[X-Translate] Capturing post on attempt ${attempt}:`, result.text.substring(0, 30));
        translateText(result.formattedText || result.text, result.element);
    } else if (result.status === 'skip') {
        // 故意跳过的推文（中文或无翻译意义），打上标记直接离场，再也不处理它，极大节约计算资源
        tweetElement.setAttribute('data-xt-processed', 'true');
        console.log(`[X-Translate] Skipping post (attempt ${attempt}): Reason = ${result.reason}, text = ${result.text.substring(0, 30)}`);
    } else if (result.status === 'retry') {
        if (attempt < 4) {
            setTimeout(() => processTweet(tweetElement, attempt + 1), 300);
        } else {
            // 重试 5 次依然未加载到 DOM 节点的，也打上标记离场，避免陷入死循环重试
            tweetElement.setAttribute('data-xt-processed', 'true');
            console.log('[X-Translate] Tweet text container not found after 5 attempts, giving up.');
        }
    }
}

(function() {
    'use strict';
    console.log('[X-Translate] IIFE execution initiated, URL:', window.location.href);
    setTimeout(() => {
        observeTweets();
    }, 1000);
})();
