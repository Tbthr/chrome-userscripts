// ==UserScript==
// @name         Translate X Post with AI (Markdown Support & Multi-Engine)
// @namespace    http://tampermonkey.net/
// @version      3.12
// @description  Dynamically translate X posts using custom AI engines (Volcengine, DeepSeek, OpenAI, etc.) with Markdown support and beautiful settings modal.
// @author       You
// @match        https://x.com/*
// @match        https://twitter.com/*
// @connect      *
// @grant        GM.xmlHttpRequest
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @run-at       document-idle
// @require      https://cdn.jsdelivr.net/npm/marked@5.1.2/marked.min.js
// @require      https://cdn.jsdelivr.net/npm/dompurify@3.1.6/dist/purify.min.js
// @downloadURL  https://raw.githubusercontent.com/Tbthr/chrome-userscripts/master/x-translate/X_translate.js
// @updateURL    https://raw.githubusercontent.com/Tbthr/chrome-userscripts/master/x-translate/X_translate.js
// @homepageURL  https://github.com/Tbthr/chrome-userscripts
// @supportURL   https://github.com/Tbthr/chrome-userscripts/issues
// ==/UserScript==

// 用户配置选项
const CONFIG = {};

const TRANSLATE_ICON_SVG = '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M12.87 15.07l-2.54-2.51.03-.03A17.52 17.52 0 0014.07 6H17V4h-7V2H8v2H1v1.99h11.17C11.5 7.92 10.44 9.75 9 11.35 8.07 10.32 7.3 9.19 6.69 8h-2c.73 1.63 1.73 3.17 2.98 4.56l-5.09 5.02L4 19l5-5 3.11 3.11.76-2.04zM18.5 10h-2L12 22h2l1.12-3h4.75L21 22h2l-4.5-12zm-2.62 7l1.62-4.33L19.12 17h-3.24z"/></svg>';
const SCROLL_TOP_ICON_SVG = '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M12 5.5l-7 7 1.4 1.4L11 9.3V20h2V9.3l4.6 4.6L19 12.5z"/></svg>';

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

const DEFAULT_SYSTEM_PROMPT = `你是一名专业的翻译官，精通中英文互译`;

const DEFAULT_USER_PROMPT = `将输入文本重写为简体中文，最大化保留原文语义`;

const USER_PROMPT_INPUT_LABEL = '处理文本：';

const TRANSLATION_MODES = Object.freeze({
    AUTO: 'auto',
    VIEWPORT: 'viewport',
    MANUAL: 'manual'
});

const DEFAULT_TRANSLATION_MODE = TRANSLATION_MODES.VIEWPORT;

const TRANSLATION_MODE_OPTIONS = [
    { value: TRANSLATION_MODES.AUTO, label: '全自动' },
    { value: TRANSLATION_MODES.VIEWPORT, label: '当前视图' },
    { value: TRANSLATION_MODES.MANUAL, label: '手动点击' }
];

const STORAGE_KEYS = {
    SETTINGS: 'x_translate_settings_v3',
    CACHE: 'x_translate_cache_v1'
};

const MAX_CACHE_SIZE = 500;
let memoryCache = null;

function loadCache() {
    if (memoryCache) return memoryCache;
    try {
        const raw = GM_getValue(STORAGE_KEYS.CACHE, '');
        memoryCache = raw ? JSON.parse(raw) : {};
    } catch (e) {
        console.error('[X-Translate] Failed to parse cache:', e);
        memoryCache = {};
    }
    return memoryCache;
}

function persistCache() {
    GM_setValue(STORAGE_KEYS.CACHE, JSON.stringify(memoryCache));
}

function evictCacheIfNeeded(ttlMs) {
    const cache = loadCache();
    const now = Date.now();
    let dirty = false;

    for (const key in cache) {
        if (now - cache[key].timestamp > ttlMs) {
            delete cache[key];
            dirty = true;
        }
    }

    if (Object.keys(cache).length > MAX_CACHE_SIZE) {
        const entries = Object.entries(cache).sort((a, b) => a[1].timestamp - b[1].timestamp);
        const toRemove = entries.length - MAX_CACHE_SIZE;
        for (let i = 0; i < toRemove; i++) {
            delete cache[entries[i][0]];
            dirty = true;
        }
    }

    if (dirty) persistCache();
}

function getCachedTranslation(cacheKey, ttlMs) {
    const cache = loadCache();
    const entry = cache[cacheKey];
    if (entry && (Date.now() - entry.timestamp <= ttlMs)) {
        return entry.text;
    }
    return null;
}

function setCachedTranslation(cacheKey, translatedText, ttlMs) {
    evictCacheIfNeeded(ttlMs);
    const cache = loadCache();
    cache[cacheKey] = { text: translatedText, timestamp: Date.now() };
    persistCache();
}

function clearCache() {
    memoryCache = {};
    GM_setValue(STORAGE_KEYS.CACHE, '');
}

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
        padding: 24px;
        background: rgba(0, 0, 0, 0.58);
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        z-index: 100000;
        display: flex;
        align-items: center;
        justify-content: center;
        box-sizing: border-box;
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
        border-radius: 22px;
        width: min(100%, 560px);
        max-height: min(760px, calc(100vh - 48px));
        box-shadow: 0 24px 70px rgba(0,0,0,0.22);
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
    .xt-modal button {
        font-family: inherit;
    }

    /* 暗黑模式自适应 */
    .xt-modal-overlay.xt-dark .xt-modal {
        background: rgba(21, 32, 43, 0.94);
        border: 1px solid rgba(255, 255, 255, 0.12);
        color: #e7e9ea;
        box-shadow: 0 24px 70px rgba(0,0,0,0.52);
    }

    .xt-modal-header {
        padding: 22px 28px;
        border-bottom: 1px solid rgba(128, 128, 128, 0.15);
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 16px;
        flex: 0 0 auto;
    }
    .xt-modal-title {
        font-size: 21px;
        font-weight: 700;
        margin: 0;
        letter-spacing: 0;
        line-height: 1.25;
    }
    .xt-modal-close {
        width: 36px;
        height: 36px;
        background: rgba(128, 128, 128, 0.1);
        border: 1px solid rgba(128, 128, 128, 0.12);
        border-radius: 50%;
        font-size: 26px;
        cursor: pointer;
        color: inherit;
        opacity: 0.6;
        transition: opacity 0.2s, background 0.2s, transform 0.2s;
        padding: 0;
        line-height: 1;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex: 0 0 auto;
    }
    .xt-modal-close:hover {
        opacity: 1;
        background: rgba(128, 128, 128, 0.18);
        transform: scale(1.04);
    }
    .xt-modal-close:focus-visible,
    .xt-eye-btn:focus-visible,
    .xt-segmented-option:focus-visible,
    .xt-prompt-toggle:focus-visible,
    .xt-btn:focus-visible,
    .xt-scroll-top-button:focus-visible {
        outline: 2px solid #1d9bf0;
        outline-offset: 2px;
    }
    
    .xt-modal-body {
        padding: 22px 28px 24px;
        overflow-y: auto;
        flex: 1 1 auto;
        min-height: 0;
        display: flex;
        flex-direction: column;
        gap: 18px;
        scrollbar-width: thin;
    }
    .xt-form-group {
        display: flex;
        flex-direction: column;
        gap: 8px;
    }
    .xt-form-label {
        font-size: 13.5px;
        font-weight: 700;
        opacity: 0.9;
        line-height: 1.35;
    }
    
    .xt-input, .xt-select, .xt-textarea {
        width: 100%;
        padding: 12px 14px;
        border-radius: 12px;
        border: 1px solid rgba(128, 128, 128, 0.3);
        background: rgba(255, 255, 255, 0.5);
        color: inherit;
        font-family: inherit;
        font-size: 15px;
        line-height: 1.45;
        transition: border-color 0.2s ease, background 0.2s ease, box-shadow 0.2s ease;
        box-sizing: border-box;
    }
    .xt-input {
        min-height: 48px;
    }
    .xt-textarea {
        min-height: 96px;
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

    .xt-segmented {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 6px;
        padding: 5px;
        border: 1px solid rgba(128, 128, 128, 0.16);
        border-radius: 14px;
        background: rgba(128, 128, 128, 0.08);
    }
    .xt-segmented-option {
        min-width: 0;
        min-height: 40px;
        padding: 8px 10px;
        border: none;
        border-radius: 10px;
        background: transparent;
        color: inherit;
        cursor: pointer;
        font-size: 13.5px;
        font-weight: 700;
        line-height: 1.25;
        transition: background 0.2s ease, color 0.2s ease, box-shadow 0.2s ease;
    }
    .xt-segmented-option:hover {
        background: rgba(128, 128, 128, 0.12);
    }
    .xt-segmented-option.active {
        background: #1d9bf0;
        color: #ffffff;
        box-shadow: 0 4px 12px rgba(29, 155, 240, 0.24);
    }
    .xt-modal-overlay.xt-dark .xt-segmented {
        background: rgba(0, 0, 0, 0.18);
        border-color: rgba(255, 255, 255, 0.1);
    }


    .xt-prompt-toggle {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 12px;
        cursor: pointer;
        width: 100%;
        font-size: 14px;
        font-weight: 700;
        padding: 14px 0 0;
        border: 0;
        border-top: 1px solid rgba(128, 128, 128, 0.15);
        margin-top: 8px;
        user-select: none;
        color: inherit;
        background: transparent;
        text-align: left;
    }
    .xt-prompt-toggle span:first-child {
        min-width: 0;
        overflow-wrap: anywhere;
    }
    .xt-prompt-arrow {
        color: #1d9bf0;
        flex: 0 0 auto;
        font-size: 13px;
    }
    .xt-prompt-container {
        display: none;
        flex-direction: column;
        gap: 16px;
        margin-top: 14px;
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
        padding: 18px 28px 22px;
        border-top: 1px solid rgba(128, 128, 128, 0.15);
        display: flex;
        justify-content: flex-end;
        gap: 14px;
        flex: 0 0 auto;
        background: rgba(255, 255, 255, 0.68);
        backdrop-filter: blur(14px);
        -webkit-backdrop-filter: blur(14px);
    }
    .xt-modal-overlay.xt-dark .xt-modal-footer {
        background: rgba(21, 32, 43, 0.78);
    }
    .xt-btn {
        min-width: 108px;
        min-height: 46px;
        padding: 11px 22px;
        border-radius: 9999px;
        font-weight: 700;
        font-size: 15px;
        cursor: pointer;
        transition: all 0.2s ease;
        border: none;
        box-sizing: border-box;
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
        padding-right: 50px;
    }
    .xt-eye-btn {
        position: absolute;
        right: 8px;
        width: 36px;
        height: 36px;
        background: transparent;
        border: none;
        border-radius: 50%;
        cursor: pointer;
        color: inherit;
        opacity: 0.5;
        transition: opacity 0.2s ease, background 0.2s ease;
        padding: 0;
        font-size: 16px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
    }
    .xt-eye-btn:hover {
        opacity: 1;
        background: rgba(128, 128, 128, 0.12);
    }

    @media (max-width: 520px) {
        .xt-modal-overlay {
            align-items: flex-end;
            padding: 12px;
        }
        .xt-modal {
            border-radius: 18px;
            max-height: calc(100vh - 24px);
        }
        .xt-modal-header,
        .xt-modal-body {
            padding-left: 18px;
            padding-right: 18px;
        }
        .xt-modal-footer {
            padding: 14px 18px 18px;
        }
        .xt-btn {
            flex: 1 1 0;
            min-width: 0;
        }
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

    /* 翻译小图标 - 放在 time 元素旁边 */
    .xt-translate-icon, .xt-remove-icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background: none;
        border: none;
        border-radius: 50%;
        cursor: pointer;
        transition: background 0.2s ease, color 0.2s ease;
        padding: 2px;
        margin-left: 2px;
        vertical-align: middle;
        line-height: 1;
        outline: none;
    }
    .xt-translate-icon {
        color: #536471;
    }
    .xt-remove-icon {
        color: #1d9bf0;
    }
    .xt-translate-icon:hover, .xt-remove-icon:hover {
        background: rgba(29, 155, 240, 0.1);
        color: #1d9bf0;
    }
    .xt-translate-icon.xt-dark {
        color: #8b98a5;
    }
    .xt-remove-icon.xt-dark {
        color: #4dabf7;
    }
    .xt-translate-icon.xt-dark:hover, .xt-remove-icon.xt-dark:hover {
        background: rgba(29, 155, 240, 0.15);
        color: #4dabf7;
    }
    .xt-translate-icon.loading {
        opacity: 0.4;
        pointer-events: none;
    }
    .xt-translate-icon.loading svg {
        animation: xt-spin 1s linear infinite;
    }

    .xt-scroll-top-button {
        position: fixed;
        bottom: 88px;
        left: var(--xt-scroll-top-left, auto);
        right: var(--xt-scroll-top-right, 18px);
        width: 42px;
        height: 42px;
        border: 1px solid rgba(15, 20, 25, 0.1);
        border-radius: 50%;
        background: rgba(15, 20, 25, 0.88);
        color: #ffffff;
        z-index: 99999;
        cursor: pointer;
        box-shadow: 0 8px 20px rgba(0, 0, 0, 0.18);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 0;
        opacity: 0;
        pointer-events: none;
        transform: translateY(8px);
        transition: opacity 0.2s ease, transform 0.2s ease, background 0.2s ease, color 0.2s ease, border-color 0.2s ease;
    }
    .xt-scroll-top-button.show {
        opacity: 1;
        pointer-events: auto;
        transform: translateY(0);
    }
    .xt-scroll-top-button:hover {
        background: #1d9bf0;
        border-color: #1d9bf0;
        transform: translateY(-1px);
    }
    .xt-scroll-top-button:active {
        transform: translateY(0);
    }
    .xt-scroll-top-button.xt-dark {
        background: rgba(239, 243, 244, 0.92);
        color: #0f1419;
        border-color: rgba(255, 255, 255, 0.16);
    }
    .xt-scroll-top-button.xt-dark:hover {
        background: #1d9bf0;
        color: #ffffff;
        border-color: #1d9bf0;
    }
    .xt-scroll-top-button svg {
        width: 20px;
        height: 20px;
    }
    @media (max-width: 720px) {
        .xt-scroll-top-button {
            left: auto !important;
            right: 16px;
            bottom: 78px;
        }
    }
    @keyframes xt-spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
    }
`);

// 默认配置加载器与保存逻辑
function normalizeUserPrompt(userPrompt) {
    return String(userPrompt ?? '')
        .replace(/\s*处理文本[:：]\s*$/, '')
        .trim();
}

function normalizeTranslationMode(mode) {
    return TRANSLATION_MODE_OPTIONS.some(option => option.value === mode)
        ? mode
        : DEFAULT_TRANSLATION_MODE;
}

function getSettings() {
    const defaultSettings = {
        apiKey: '',
        baseUrl: '',
        model: '',
        systemPrompt: DEFAULT_SYSTEM_PROMPT.trim(),
        userPrompt: DEFAULT_USER_PROMPT.trim(),
        cacheTTL: 24,
        translationMode: DEFAULT_TRANSLATION_MODE
    };

    try {
        const stored = GM_getValue(STORAGE_KEYS.SETTINGS, '');
        if (stored) {
            const parsed = JSON.parse(stored);
            const settings = { ...defaultSettings, ...parsed };
            return {
                ...settings,
                userPrompt: normalizeUserPrompt(settings.userPrompt),
                translationMode: normalizeTranslationMode(settings.translationMode)
            };
        }
    } catch (e) {
        console.error('[X-Translate] Failed to parse stored settings:', e);
    }
    return defaultSettings;
}

// 供快捷存储
function saveSettings(settings) {
    const normalizedSettings = {
        ...settings,
        userPrompt: normalizeUserPrompt(settings.userPrompt),
        translationMode: normalizeTranslationMode(settings.translationMode)
    };
    GM_setValue(STORAGE_KEYS.SETTINGS, JSON.stringify(normalizedSettings));
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

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function renderSegmentedOptions(options, selectedValue) {
    return options.map(option => {
        const isSelected = option.value === selectedValue;
        return `
            <button
                class="xt-segmented-option ${isSelected ? 'active' : ''}"
                type="button"
                data-value="${escapeHtml(option.value)}"
                aria-pressed="${isSelected ? 'true' : 'false'}"
            >${escapeHtml(option.label)}</button>
        `;
    }).join('');
}

function setSegmentedControlValue(container, value) {
    if (!container) return;
    const buttons = Array.from(container.querySelectorAll('.xt-segmented-option'));
    buttons.forEach(button => {
        const isSelected = button.dataset.value === value;
        button.classList.toggle('active', isSelected);
        button.setAttribute('aria-pressed', String(isSelected));
    });
}

function getSegmentedControlValue(container, fallbackValue) {
    if (!container) return fallbackValue;
    const activeButton = container.querySelector('.xt-segmented-option.active');
    return activeButton?.dataset.value || fallbackValue;
}

function bindSegmentedControl(container, initialValue) {
    if (!container) return;
    setSegmentedControlValue(container, initialValue);
    container.addEventListener('click', (event) => {
        const button = event.target.closest('.xt-segmented-option');
        if (!button || !container.contains(button)) return;
        setSegmentedControlValue(container, button.dataset.value);
    });
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
    const safeSettings = {
        apiKey: escapeHtml(settings.apiKey),
        baseUrl: escapeHtml(settings.baseUrl),
        model: escapeHtml(settings.model),
        systemPrompt: escapeHtml(settings.systemPrompt),
        userPrompt: escapeHtml(settings.userPrompt),
        cacheTTL: escapeHtml(settings.cacheTTL),
        translationMode: normalizeTranslationMode(settings.translationMode)
    };

    modalOverlay.innerHTML = `
        <div class="xt-modal">
            <div class="xt-modal-header">
                <h3 class="xt-modal-title">🤖 X AI 翻译配置</h3>
                <button class="xt-modal-close" id="xt-close-btn" type="button" aria-label="关闭设置">×</button>
            </div>
            <div class="xt-modal-body">
                <div class="xt-form-group">
                    <label class="xt-form-label">API Key</label>
                    <div class="xt-api-key-container">
                        <input type="password" id="xt-api-key" class="xt-input" placeholder="输入 API 密钥 (API Key)" value="${safeSettings.apiKey}" autocomplete="off">
                        <button class="xt-eye-btn" id="xt-eye-toggle" type="button" aria-label="显示 API Key">👁️</button>
                    </div>
                </div>

                <div class="xt-form-group">
                    <label class="xt-form-label">接口地址 (Base URL / Endpoint)</label>
                    <input type="text" id="xt-base-url" class="xt-input" placeholder="https://api.openai.com/v1" value="${safeSettings.baseUrl}" autocomplete="off">
                </div>

                <div class="xt-form-group">
                    <label class="xt-form-label">模型 (Model / Endpoint ID)</label>
                    <input type="text" id="xt-model" class="xt-input" placeholder="gpt-4o-mini" value="${safeSettings.model}" autocomplete="off">
                </div>

                <div class="xt-form-group">
                    <label class="xt-form-label">翻译模式</label>
                    <div class="xt-segmented" id="xt-translation-mode" role="group" aria-label="翻译模式">
                        ${renderSegmentedOptions(TRANSLATION_MODE_OPTIONS, safeSettings.translationMode)}
                    </div>
                </div>

                <div>
                    <button class="xt-prompt-toggle" id="xt-prompt-toggle" type="button" aria-expanded="false">
                        <span>高级选项：自定义翻译提示词 (Prompts)</span>
                        <span class="xt-prompt-arrow" id="xt-prompt-arrow">▼</span>
                    </button>
                    <div class="xt-prompt-container" id="xt-prompt-container">
                        <div class="xt-form-group">
                            <label class="xt-form-label">缓存有效期（小时）</label>
                            <input type="number" id="xt-cache-ttl" class="xt-input" min="0" step="1" placeholder="24" value="${safeSettings.cacheTTL}">
                        </div>
                        <div class="xt-form-group">
                            <div style="display:flex; justify-content:space-between; align-items:center;">
                                <label class="xt-form-label">System Prompt</label>
                                <button class="xt-btn-reset" id="xt-reset-sys" type="button">恢复默认</button>
                            </div>
                            <textarea id="xt-sys-prompt" class="xt-textarea" rows="2" style="resize:vertical;">${safeSettings.systemPrompt}</textarea>
                        </div>
                        <div class="xt-form-group">
                            <div style="display:flex; justify-content:space-between; align-items:center;">
                                <label class="xt-form-label">User Prompt（自定义部分）</label>
                                <button class="xt-btn-reset" id="xt-reset-user" type="button">恢复默认</button>
                            </div>
                            <textarea id="xt-user-prompt" class="xt-textarea" rows="4" style="resize:vertical;">${safeSettings.userPrompt}</textarea>
                        </div>
                    </div>
                </div>
            </div>
            <div class="xt-modal-footer">
                <button class="xt-btn xt-btn-cancel" id="xt-cancel-btn" type="button">取消</button>
                <button class="xt-btn xt-btn-save" id="xt-save-btn" type="button">保存配置</button>
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
    const translationModeControl = modalOverlay.querySelector('#xt-translation-mode');
    const sysPromptInput = modalOverlay.querySelector('#xt-sys-prompt');
    const userPromptInput = modalOverlay.querySelector('#xt-user-prompt');
    const cacheTTLInput = modalOverlay.querySelector('#xt-cache-ttl');
    const promptToggle = modalOverlay.querySelector('#xt-prompt-toggle');
    const promptContainer = modalOverlay.querySelector('#xt-prompt-container');
    const promptArrow = modalOverlay.querySelector('#xt-prompt-arrow');
    const resetSysBtn = modalOverlay.querySelector('#xt-reset-sys');
    const resetUserBtn = modalOverlay.querySelector('#xt-reset-user');
    
    bindSegmentedControl(translationModeControl, settings.translationMode);

    eyeToggle.addEventListener('click', () => {
        if (apiKeyInput.type === 'password') {
            apiKeyInput.type = 'text';
            eyeToggle.textContent = '🔒';
            eyeToggle.setAttribute('aria-label', '隐藏 API Key');
        } else {
            apiKeyInput.type = 'password';
            eyeToggle.textContent = '👁️';
            eyeToggle.setAttribute('aria-label', '显示 API Key');
        }
    });

    promptToggle.addEventListener('click', () => {
        const isShown = promptContainer.classList.toggle('show');
        promptArrow.textContent = isShown ? '▲' : '▼';
        promptToggle.setAttribute('aria-expanded', String(isShown));
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
        const userPrompt = normalizeUserPrompt(userPromptInput.value);
        const translationMode = getSegmentedControlValue(translationModeControl, DEFAULT_TRANSLATION_MODE);

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
            apiKey,
            baseUrl,
            model,
            systemPrompt,
            userPrompt,
            cacheTTL: parseInt(cacheTTLInput.value) || 24,
            translationMode
        };

        saveSettings(newSettings);
        clearCache();
        closeModal();
        showToast('配置保存成功！刷新 X 页面后生效');
    });
}

function populateSettingsModal(settings) {
    if (!modalOverlay) return;

    const apiKeyInput = modalOverlay.querySelector('#xt-api-key');
    const eyeToggle = modalOverlay.querySelector('#xt-eye-toggle');
    const baseUrlInput = modalOverlay.querySelector('#xt-base-url');
    const modelInput = modalOverlay.querySelector('#xt-model');
    const translationModeControl = modalOverlay.querySelector('#xt-translation-mode');
    const sysPromptInput = modalOverlay.querySelector('#xt-sys-prompt');
    const userPromptInput = modalOverlay.querySelector('#xt-user-prompt');
    const cacheTTLInput = modalOverlay.querySelector('#xt-cache-ttl');

    if (apiKeyInput) {
        apiKeyInput.value = settings.apiKey;
        apiKeyInput.type = 'password';
    }
    if (eyeToggle) {
        eyeToggle.textContent = '👁️';
        eyeToggle.setAttribute('aria-label', '显示 API Key');
    }
    if (baseUrlInput) baseUrlInput.value = settings.baseUrl;
    if (modelInput) modelInput.value = settings.model;
    setSegmentedControlValue(translationModeControl, normalizeTranslationMode(settings.translationMode));
    if (sysPromptInput) sysPromptInput.value = settings.systemPrompt;
    if (userPromptInput) userPromptInput.value = settings.userPrompt;
    if (cacheTTLInput) cacheTTLInput.value = settings.cacheTTL;
}

function showSettingsModal() {
    createSettingsModal();
    const settings = getSettings();
    const modal = modalOverlay;
    populateSettingsModal(settings);

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

let scrollTopButton = null;
let scrollTopUpdateFrame = null;
let scrollTopAnimationFrame = null;
let restoreScrollTopStyles = null;

function getPageScrollTop() {
    const scrollingElement = document.scrollingElement || document.documentElement;
    return window.scrollY || scrollingElement?.scrollTop || 0;
}

function updateScrollTopButtonPosition() {
    if (!scrollTopButton) return;

    if (window.innerWidth <= 720) {
        scrollTopButton.style.removeProperty('--xt-scroll-top-left');
        scrollTopButton.style.removeProperty('--xt-scroll-top-right');
        return;
    }

    const primaryColumn = document.querySelector('[data-testid="primaryColumn"]');
    if (!primaryColumn) {
        scrollTopButton.style.removeProperty('--xt-scroll-top-left');
        scrollTopButton.style.removeProperty('--xt-scroll-top-right');
        return;
    }

    const rect = primaryColumn.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const buttonWidth = 42;
    const gap = 12;
    const left = Math.min(window.innerWidth - buttonWidth - gap, Math.max(gap, rect.right + gap));
    scrollTopButton.style.setProperty('--xt-scroll-top-left', `${left}px`);
    scrollTopButton.style.setProperty('--xt-scroll-top-right', 'auto');
}

function updateScrollTopButtonVisibility() {
    if (!scrollTopButton) return;

    const shouldShow = getPageScrollTop() > 420;
    scrollTopButton.classList.toggle('show', shouldShow);
    scrollTopButton.classList.toggle('xt-dark', isDarkTheme());
}

function scheduleScrollTopButtonUpdate() {
    if (scrollTopUpdateFrame) return;

    scrollTopUpdateFrame = requestAnimationFrame(() => {
        scrollTopUpdateFrame = null;
        updateScrollTopButtonPosition();
        updateScrollTopButtonVisibility();
    });
}

function setPageScrollTop(top) {
    const scrollingElement = document.scrollingElement || document.documentElement;
    const nextTop = Math.max(0, top);
    window.scrollTo(0, nextTop);
    if (scrollingElement) scrollingElement.scrollTop = nextTop;
    document.documentElement.scrollTop = nextTop;
    if (document.body) document.body.scrollTop = nextTop;
}

function easeInOutCubic(progress) {
    return progress < 0.5
        ? 4 * progress * progress * progress
        : 1 - Math.pow(-2 * progress + 2, 3) / 2;
}

function getScrollTopDuration(distance) {
    return Math.min(1800, Math.max(650, 450 + Math.sqrt(distance) * 18));
}

function disableNativeScrollBehavior() {
    const scrollTargets = Array.from(new Set([
        document.scrollingElement,
        document.documentElement,
        document.body
    ].filter(Boolean)));
    const previousScrollBehaviors = scrollTargets.map(element => [element, element.style.scrollBehavior]);

    scrollTargets.forEach(element => {
        element.style.scrollBehavior = 'auto';
    });

    return () => {
        previousScrollBehaviors.forEach(([element, value]) => {
            element.style.scrollBehavior = value;
        });
    };
}

function stopScrollTopAnimation() {
    if (scrollTopAnimationFrame) {
        cancelAnimationFrame(scrollTopAnimationFrame);
        scrollTopAnimationFrame = null;
    }
    if (restoreScrollTopStyles) {
        restoreScrollTopStyles();
        restoreScrollTopStyles = null;
    }
}

function scrollTimelineToTop() {
    stopScrollTopAnimation();

    const startTop = getPageScrollTop();
    if (startTop <= 2) {
        setPageScrollTop(0);
        scheduleScrollTopButtonUpdate();
        return;
    }

    restoreScrollTopStyles = disableNativeScrollBehavior();
    const duration = getScrollTopDuration(startTop);
    const startedAt = performance.now();

    const finish = () => {
        setPageScrollTop(0);
        stopScrollTopAnimation();
        scheduleScrollTopButtonUpdate();
    };

    const animate = (now) => {
        const progress = Math.min(1, (now - startedAt) / duration);
        const nextTop = startTop * (1 - easeInOutCubic(progress));
        setPageScrollTop(nextTop);

        if (progress >= 1) {
            finish();
            return;
        }

        scrollTopAnimationFrame = requestAnimationFrame(animate);
    };

    scrollTopAnimationFrame = requestAnimationFrame(animate);
}

function initScrollTopButton() {
    if (scrollTopButton) return;

    scrollTopButton = document.createElement('button');
    scrollTopButton.type = 'button';
    scrollTopButton.className = 'xt-scroll-top-button';
    scrollTopButton.title = '回到顶部';
    scrollTopButton.setAttribute('aria-label', '回到顶部');
    scrollTopButton.innerHTML = SCROLL_TOP_ICON_SVG;

    scrollTopButton.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        scrollTimelineToTop();
    });

    document.body.appendChild(scrollTopButton);
    window.addEventListener('scroll', scheduleScrollTopButtonUpdate, { passive: true });
    window.addEventListener('resize', scheduleScrollTopButtonUpdate, { passive: true });

    scheduleScrollTopButtonUpdate();
    setTimeout(scheduleScrollTopButtonUpdate, 1000);
    setTimeout(scheduleScrollTopButtonUpdate, 3000);
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
            translatedText: '请先配置 AI 翻译 API 接口以开始翻译。'
        });

        setTimeout(() => {
            if (window.confirm('X 翻译脚本需要先配置 AI API 密钥。现在前往配置吗？')) {
                showSettingsModal();
            }
        }, 300);
    }

    return null;
}

function buildTranslationUserMessage(customPrompt, text) {
    const prompt = normalizeUserPrompt(customPrompt);
    return prompt
        ? `${prompt}\n\n${USER_PROMPT_INPUT_LABEL}\n${text}`
        : `${USER_PROMPT_INPUT_LABEL}\n${text}`;
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
    if (!element || !translatedText) return;


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

function hasXArticleCard(tweetElement) {
    const cardWrapper = tweetElement.querySelector('[data-testid="card.wrapper"]');
    if (!cardWrapper) return false;

    const cardText = getPlainText(cardWrapper);
    return /(^|\s)X\s*文章(\s|$)/.test(cardText);
}

function getChineseCharCount(text) {
    return (text.match(/[\u3400-\u9fff]/g) || []).length;
}

function hasChineseChar(text) {
    return getChineseCharCount(text) > 0;
}

function hasNonChineseTranslatableChar(text) {
    return /[a-zA-Z\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af\u0400-\u04ff]/.test(text);
}

function getNonChineseWordCount(text) {
    const nonChineseText = text.replace(/[\u3400-\u9fff]/g, ' ');
    const words = nonChineseText.match(/[a-zA-Z0-9]+(?:['’-][a-zA-Z0-9]+)?|[\u3040-\u30ff]+|[\uac00-\ud7af]+|[\u0400-\u04ff]+/g);
    return words ? words.length : 0;
}

function getAutoTranslationEligibility(text) {
    if (hasChineseChar(text)) {
        return { eligible: false, reason: 'contains_chinese' };
    }

    const nonChineseWordCount = getNonChineseWordCount(text);
    if (nonChineseWordCount <= 3) {
        return { eligible: false, reason: 'not_enough_non_chinese_words', nonChineseWordCount };
    }

    return { eligible: true, nonChineseWordCount };
}

// 注入翻译小图标到推文 time 元素旁边
// 获取推文唯一指纹（用于检测虚拟滚动 DOM 复用）
function getTweetFingerprint(tweetElement) {
    const timeElement = tweetElement.querySelector('time');
    if (!timeElement) return null;
    const anchor = timeElement.closest('a');
    return anchor ? anchor.href : null;
}

// 清除推文上挂载的脚本元素（翻译按钮、翻译卡片、处理标记）
function cleanupTweetState(tweetElement) {
    const btn = tweetElement.querySelector('.xt-translate-icon, .xt-remove-icon');
    if (btn) btn.remove();
    const container = tweetElement.querySelector('.translation-container');
    if (container) container.remove();
    tweetElement.removeAttribute('data-xt-processed');
    tweetElement.removeAttribute('data-xt-fingerprint');
    tweetElement.removeAttribute('data-xt-translating');
}

function getTranslateButton(tweetElement) {
    return tweetElement.querySelector('.xt-translate-icon, .xt-remove-icon');
}

function setTranslateButtonState(btn, action, isLoading = false) {
    if (!btn) return;
    btn.className = (action === 'remove' ? 'xt-remove-icon' : 'xt-translate-icon') + (isDarkTheme() ? ' xt-dark' : '');
    btn.innerHTML = TRANSLATE_ICON_SVG;
    btn.title = action === 'remove' ? '收起翻译' : '翻译';
    btn.dataset.xtAction = action;
    btn.disabled = isLoading;
    btn.classList.toggle('loading', isLoading);
}

function injectTranslateButton(tweetElement) {
    const existingButton = getTranslateButton(tweetElement);
    if (existingButton) {
        return existingButton;
    }

    const existingTranslation = tweetElement.querySelector('.translation-container');

    const btn = document.createElement('button');
    setTranslateButtonState(btn, existingTranslation ? 'remove' : 'translate');

    btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        handleTranslateClick(tweetElement, btn);
    });

    // 插入到 time 元素的父级 <a> 之后
    const timeElement = tweetElement.querySelector('time');
    if (!timeElement) return;

    const timeAnchor = timeElement.closest('a') || timeElement;
    timeAnchor.insertAdjacentElement('afterend', btn);
    return btn;
}

function shouldAutoTranslate(mode) {
    const translationMode = normalizeTranslationMode(mode);
    return translationMode === TRANSLATION_MODES.AUTO || translationMode === TRANSLATION_MODES.VIEWPORT;
}

function startTweetTranslation(tweetElement, result = null, btn = getTranslateButton(tweetElement), options = {}) {
    if (tweetElement.querySelector('.translation-container')) {
        setTranslateButtonState(btn, 'remove');
        return { status: 'already_translated' };
    }
    if (tweetElement.getAttribute('data-xt-translating') === 'true') {
        return { status: 'translating' };
    }

    const translationResult = result || getTweetTextElement(tweetElement);
    if (translationResult.status !== 'success') {
        if (translationResult.status === 'skip' && options.showSkipToast && translationResult.reason === 'contains_chinese') {
            showToast('中文内容无需翻译');
        }
        return translationResult;
    }

    if (!options.force) {
        const eligibility = getAutoTranslationEligibility(translationResult.text);
        if (!eligibility.eligible) {
            return {
                status: 'skip',
                reason: eligibility.reason,
                text: translationResult.text
            };
        }
    }

    tweetElement.setAttribute('data-xt-translating', 'true');
    setTranslateButtonState(btn, 'translate', true);

    translateText(translationResult.formattedText || translationResult.text, translationResult.element, translationResult.text, () => {
        tweetElement.removeAttribute('data-xt-translating');
        setTranslateButtonState(btn, 'remove');
    });

    return { status: 'started' };
}

function removeTweetTranslation(tweetElement, btn = getTranslateButton(tweetElement)) {
    const card = tweetElement.querySelector('.translation-container');
    if (card) {
        card.classList.remove('show');
        setTimeout(() => card.remove(), 300);
    }
    setTranslateButtonState(btn, 'translate');
}

// 处理翻译图标点击
function handleTranslateClick(tweetElement, btn) {
    const action = btn.dataset.xtAction;

    if (action === 'translate') {
        startTweetTranslation(tweetElement, null, btn, { force: true, showSkipToast: true });
    } else if (action === 'remove') {
        removeTweetTranslation(tweetElement, btn);
    }
}

// 获取推文文本并过滤（精细化状态机，完美过滤中文与非翻译文本）
function getTweetTextElement(tweetElement) {
    if (hasXArticleCard(tweetElement)) {
        return { status: 'skip', reason: 'x_article_card', text: '' };
    }

    const selectors = [
        'div[data-testid="tweetText"]',
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
    
    // 按钮注入只判断是否存在可翻译的非中文字符；自动翻译资格在 startTweetTranslation 中判断。
    if (!hasNonChineseTranslatableChar(text)) {
        return { status: 'skip', reason: 'no_non_chinese_translatable_char', text };
    }

    const formattedText = htmlToMarkdown(textElement);
    return { status: 'success', text, formattedText, element: textElement };
}

function translateText(text, originalElement, cacheKey, onCompleteCallback) {
    if (!text || text === 'No post text found') {
        if (onCompleteCallback) onCompleteCallback();
        return;
    }

    const settings = getSettings();
    const ttlMs = (settings.cacheTTL || 24) * 3600 * 1000;
    cacheKey = cacheKey || text;

    if (ttlMs > 0) {
        const cached = getCachedTranslation(cacheKey, ttlMs);
        if (cached) {
            console.debug('[X-Translate] Cache hit for:', cacheKey.substring(0, 30));
            setTranslation({ element: originalElement, translatedText: cached });
            if (onCompleteCallback) onCompleteCallback();
            return;
        }
    }

    const apiConfig = getApiConfig(originalElement);
    if (!apiConfig) { if (onCompleteCallback) onCompleteCallback(); return; }

    const combinedInput = buildTranslationUserMessage(apiConfig.userPrompt, text);

    const requestBody = {
        model: apiConfig.model,
        messages: [
            {"role": "system", "content": apiConfig.systemPrompt},
            {"role": "user", "content": combinedInput}
        ],
        stream: true
    };

    const targetEndpoint = cleanEndpoint(apiConfig.baseUrl);
    console.log('[X-Translate] Sending GM.xmlHttpRequest to:', targetEndpoint, 'with model:', apiConfig.model);

    // 创建流式翻译容器（立即可见，逐字填充）
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
    if (isDarkTheme()) translationContainer.classList.add('xt-dark');

    const parent = originalElement.parentNode;
    if (parent) {
        const nextSibling = originalElement.nextSibling;
        if (nextSibling) {
            parent.insertBefore(translationContainer, nextSibling);
        } else {
            parent.appendChild(translationContainer);
        }
        requestAnimationFrame(() => translationContainer.classList.add('show'));
    }

    // 流式状态
    let accumulatedText = '';
    let lastParsedIndex = 0;
    let streamingWorked = false;

    // 从累积的 SSE 文本中增量解析新的 delta content
    function parseNewSSEChunks(fullResponseText) {
        const newText = fullResponseText.substring(lastParsedIndex);
        lastParsedIndex = fullResponseText.length;
        const lines = newText.split('\n');
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed === 'data: [DONE]' || !trimmed.startsWith('data: ')) continue;
            try {
                const json = JSON.parse(trimmed.slice(6));
                const delta = json.choices?.[0]?.delta?.content || '';
                if (delta) accumulatedText += delta;
            } catch (_) {
                // 不完整的 JSON 行，可能跨越 chunk 边界，下次 onprogress 会补全
            }
        }
    }

    // 流式渲染：用纯文本实时更新，避免不完整 Markdown 解析异常
    function updateStreamingContent() {
        if (!accumulatedText) {
            translationContainer.innerHTML = '<span style="opacity:0.5">翻译中…</span>';
            return;
        }
        const escaped = accumulatedText
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/\n/g, '<br>');
        translationContainer.innerHTML = escaped;
    }

    // 最终渲染：用 marked 做完整 Markdown 渲染
    function finalizeTranslation() {
        if (!accumulatedText) {
            translationContainer.innerHTML = 'Translation failed';
            return;
        }
        try {
            if (typeof marked !== 'undefined') {
                marked.setOptions({ breaks: true, gfm: true, headerIds: false, mangle: false });
                const rawHtml = marked.parse(accumulatedText);
                translationContainer.innerHTML = typeof DOMPurify !== 'undefined'
                    ? DOMPurify.sanitize(rawHtml) : rawHtml;
            } else {
                translationContainer.innerHTML = accumulatedText.replace(/\n/g, '<br>');
            }
        } catch (e) {
            console.error('[X-Translate] Error rendering final Markdown:', e);
            translationContainer.innerHTML = accumulatedText.replace(/\n/g, '<br>');
        }
    }

    GM.xmlHttpRequest({
        method: 'POST',
        url: targetEndpoint,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiConfig.apiKey}`
        },
        data: JSON.stringify(requestBody),
        timeout: 30000,
        onprogress: function(response) {
            if (!response.responseText) return;
            streamingWorked = true;
            parseNewSSEChunks(response.responseText);
            updateStreamingContent();
        },
        onload: function(response) {
            console.log('[X-Translate] GM.xmlHttpRequest response status:', response.status);
            if (response.status === 200) {
                // 如果 onprogress 已正常工作，accumulatedText 已有内容，直接最终渲染
                if (streamingWorked && accumulatedText) {
                    finalizeTranslation();
                } else {
                    // onprogress 未提供 responseText（部分 TM 版本），在此兜底解析
                    try {
                        const isSSE = response.responseText.trimStart().startsWith('data: ');
                        if (isSSE) {
                            parseNewSSEChunks(response.responseText);
                            accumulatedText = accumulatedText || '';
                        } else {
                            const responseJson = JSON.parse(response.responseText);
                            accumulatedText = responseJson.choices?.[0]?.message?.content || '';
                        }
                        if (!accumulatedText) accumulatedText = 'Translation failed';
                        finalizeTranslation();
                    } catch (e) {
                        console.error('[X-Translate] Failed to parse response:', e, 'Raw:', response.responseText);
                        translationContainer.innerHTML = '解析 API 响应失败，请重试。';
                    }
                }
                console.log('[X-Translate] Translated text snippet:', accumulatedText.substring(0, 30));
                if (ttlMs > 0 && accumulatedText) setCachedTranslation(cacheKey, accumulatedText, ttlMs);
                if (onCompleteCallback) onCompleteCallback();
            } else {
                console.error('[X-Translate] API request failed with status:', response.status, 'Response:', response.responseText);
                let errorMsg = '翻译失败，服务商接口返回错误。';
                if (response.status === 401) {
                    errorMsg += '（请点击"配置"检查 API Key 是否正确）';
                } else if (response.status === 404) {
                    errorMsg += '（请点击"配置"检查模型名称与 Endpoint URL 是否正确）';
                } else if (response.status === 400) {
                    try {
                        const errJson = JSON.parse(response.responseText);
                        errorMsg += `（${errJson.error?.message || response.status}）`;
                    } catch (_) {
                        errorMsg += `(错误码: ${response.status})`;
                    }
                } else {
                    errorMsg += `(错误码: ${response.status})`;
                }
                translationContainer.innerHTML = errorMsg;
                if (onCompleteCallback) onCompleteCallback();
            }
        },
        onerror: function(error) {
            console.error('[X-Translate] GM.xmlHttpRequest error:', error);
            translationContainer.innerHTML = '网络请求错误，请检查您的网络连接或接口地址是否可用。';
            if (onCompleteCallback) onCompleteCallback();
        },
        onabort: function() {
            console.error('[X-Translate] GM.xmlHttpRequest aborted');
            translationContainer.innerHTML = '请求已中止。';
            if (onCompleteCallback) onCompleteCallback();
        },
        ontimeout: function() {
            console.error('[X-Translate] GM.xmlHttpRequest timed out');
            translationContainer.innerHTML = '请求超时，请检查接口服务响应速度或您的加速网络。';
            if (onCompleteCallback) onCompleteCallback();
        }
    });
}

// IntersectionObserver to trigger translation only when tweet is visible in viewport
const tweetVisibilityObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            const tweetEl = entry.target;
            processTweet(tweetEl, 0, getSettings().translationMode);
        }
    });
}, {
    root: null,
    threshold: 0.1
});

function queueTweetForProcessing(tweetElement, mode = getSettings().translationMode) {
    const translationMode = normalizeTranslationMode(mode);
    if (translationMode === TRANSLATION_MODES.AUTO) {
        processTweet(tweetElement, 0, translationMode);
        return;
    }
    tweetVisibilityObserver.observe(tweetElement);
}

function observeTweets() {
    const targetNode = document.querySelector('main') || document.body;
    if (!targetNode) {
        console.warn('[X-Translate] No main or body element found, observing document.body');
    }

    console.log('[X-Translate] MutationObserver starting to observe target node...');

    const observer = new MutationObserver((mutations) => {
        mutations.forEach(mutation => {
            const translationMode = getSettings().translationMode;
            if (mutation.addedNodes.length) {
                mutation.addedNodes.forEach(node => {
                    const isElement = node.nodeType === Node.ELEMENT_NODE;
                    const hasMatches = isElement && typeof node.matches === 'function';

                    if (hasMatches && (node.matches('article[data-testid="tweet"]') || node.matches('div[data-testid="tweet"]'))) {
                        if (node.getAttribute('data-xt-processed') !== 'true') {
                            queueTweetForProcessing(node, translationMode);
                        }
                    } else if (isElement && node.querySelector) {
                        const isExtensionElement = hasMatches && (
                            node.matches('div.translation-container') ||
                            node.matches('div.xt-modal-overlay') ||
                            node.matches('div.xt-toast') ||
                            node.matches('.xt-scroll-top-button') ||
                            node.matches('.xt-translate-icon') ||
                            node.matches('.xt-remove-icon')
                        );

                        if (!isExtensionElement) {
                            const tweets = Array.from(node.querySelectorAll('article[data-testid="tweet"], div[data-testid="tweet"]'))
                                .filter(tweet => tweet.getAttribute('data-xt-processed') !== 'true');
                            if (tweets.length > 0) {
                                tweets.forEach(tweet => queueTweetForProcessing(tweet, translationMode));
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
    const translationMode = getSettings().translationMode;
    getPostElements().forEach(tweet => {
        if (tweet.getAttribute('data-xt-processed') !== 'true') {
            queueTweetForProcessing(tweet, translationMode);
        }
    });
}

// 状态化推文捕获处理，注入翻译按钮
function processTweet(tweetElement, attempt = 0, mode = getSettings().translationMode) {
    const translationMode = normalizeTranslationMode(mode);
    const currentFingerprint = getTweetFingerprint(tweetElement);
    const storedFingerprint = tweetElement.getAttribute('data-xt-fingerprint');

    if (tweetElement.getAttribute('data-xt-processed') === 'true') {
        // 已处理过：检查指纹是否变化（虚拟滚动导致 DOM 复用）
        if (storedFingerprint && currentFingerprint && storedFingerprint !== currentFingerprint) {
            console.log('[X-Translate] DOM recycled, fingerprint changed. Re-processing tweet.');
            cleanupTweetState(tweetElement);
        } else {
            return;
        }
    }

    const result = getTweetTextElement(tweetElement);

    if (result.status === 'success') {
        tweetElement.setAttribute('data-xt-processed', 'true');
        if (currentFingerprint) tweetElement.setAttribute('data-xt-fingerprint', currentFingerprint);
        console.log(`[X-Translate] Scheduling translate button:`, result.text.substring(0, 30));
        // 延迟注入，等待 React 完成当前渲染周期
        requestAnimationFrame(() => {
            setTimeout(() => {
                const btn = injectTranslateButton(tweetElement);
                if (shouldAutoTranslate(translationMode)) {
                    startTweetTranslation(tweetElement, result, btn);
                }
            }, 200);
        });
    } else if (result.status === 'skip') {
        tweetElement.setAttribute('data-xt-processed', 'true');
        if (currentFingerprint) tweetElement.setAttribute('data-xt-fingerprint', currentFingerprint);
        console.log(`[X-Translate] Skipping post:`, result.reason, result.text.substring(0, 30));
    } else if (result.status === 'retry') {
        if (attempt < 4) {
            setTimeout(() => processTweet(tweetElement, attempt + 1, translationMode), 300);
        } else {
            tweetElement.setAttribute('data-xt-processed', 'true');
            if (currentFingerprint) tweetElement.setAttribute('data-xt-fingerprint', currentFingerprint);
            console.log('[X-Translate] Tweet text container not found after 5 attempts');
        }
    }
}

(function() {
    'use strict';
    console.log('[X-Translate] IIFE execution initiated, URL:', window.location.href);
    initScrollTopButton();
    setTimeout(() => {
        observeTweets();
    }, 1000);
})();
