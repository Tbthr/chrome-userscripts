// ==UserScript==
// @name         Translate X Post with AI (Markdown Support & Multi-Engine)
// @namespace    http://tampermonkey.net/
// @version      3.21
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
const CLOSE_ICON_SVG = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>';
const CHECK_ICON_SVG = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>';
const EYE_ICON_SVG = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>';
const EYE_OFF_ICON_SVG = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17.9 14.9A10.8 10.8 0 0 0 22 12s-3.5-7-10-7a10.6 10.6 0 0 0-4.9 1.2"/><path d="M2 2l20 20"/><path d="M10.6 10.6a2 2 0 0 0 2.8 2.8"/><path d="M6.5 6.5A13.6 13.6 0 0 0 2 12s3.5 7 10 7a10.9 10.9 0 0 0 5.5-1.5"/></svg>';

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
    .translation-container {
        opacity: 0;
        max-height: 0;
        overflow: hidden;
        transition: opacity 0.24s ease, max-height 0.28s ease;
        position: relative;
        background: #f7f9f9;
        border: 1px solid #eff3f4;
        border-left: 3px solid #1d9bf0;
        border-radius: 12px;
        overflow-wrap: break-word;
        word-break: break-word;
        box-shadow: none;
    }
    .translation-container.show {
        opacity: 1;
        max-height: 1200px;
    }
    .translation-container.xt-dark {
        background: #080808 !important;
        border: 1px solid #2f3336;
        border-left: 1px solid #2f3336;
        color: #e7e9ea !important;
    }
    .translation-container-header {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        margin: 0 0 6px;
        color: #536471;
        font-size: 12px;
        line-height: 1.25;
        font-weight: 700;
    }
    .translation-container-header svg {
        width: 14px;
        height: 14px;
        color: #1d9bf0;
        flex: 0 0 auto;
    }
    .translation-container.xt-dark .translation-container-header {
        color: #71767b;
    }
    .translation-container-content {
        color: inherit;
    }
    .translation-container-content > :first-child {
        margin-top: 0;
    }
    .translation-container-content > :last-child {
        margin-bottom: 0;
    }
    .translation-placeholder {
        color: #536471;
    }
    .translation-container.xt-dark .translation-placeholder {
        color: #71767b;
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
    .translation-container code {
        background: rgba(83, 100, 113, 0.12);
        padding: 2px 5px;
        border-radius: 4px;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        font-size: 0.9em;
    }
    .translation-container.xt-dark code {
        background: rgba(239, 243, 244, 0.12);
    }
    .translation-container pre {
        background: rgba(83, 100, 113, 0.12);
        padding: 10px;
        border-radius: 8px;
        overflow: auto;
        margin: 10px 0;
    }
    .translation-container.xt-dark pre {
        background: rgba(239, 243, 244, 0.1);
    }
    .translation-container pre code { background: transparent; padding: 0; }
    .translation-container blockquote {
        border-left: 3px solid rgba(83, 100, 113, 0.35);
        margin: 8px 0;
        padding-left: 10px;
        color: #536471;
    }
    .translation-container.xt-dark blockquote {
        border-left-color: rgba(113, 118, 123, 0.55);
        color: #71767b;
    }
    .translation-container a { color: #1d9bf0; text-decoration: none; }
    .translation-container a:hover { text-decoration: underline; }
    .translation-container strong { font-weight: 700; }
    .translation-container em { font-style: italic; }
    .translation-container table { border-collapse: collapse; width: 100%; margin: 10px 0; }
    .translation-container th, .translation-container td { border: 1px solid #cfd9de; padding: 8px; }
    .translation-container.xt-dark th, .translation-container.xt-dark td { border-color: #2f3336; }
    .translation-container th { background: rgba(83, 100, 113, 0.1); }
    .translation-container.xt-dark th { background: rgba(239, 243, 244, 0.08); }
    .translation-container img { max-width: 100%; height: auto; border-radius: 8px; }

    .xt-modal-overlay {
        position: fixed;
        inset: 0;
        width: 100%;
        height: 100%;
        padding: 24px;
        background: rgba(83, 100, 113, 0.42);
        z-index: 100000;
        display: flex;
        align-items: center;
        justify-content: center;
        box-sizing: border-box;
        opacity: 0;
        pointer-events: none;
        overscroll-behavior: contain;
        transition: opacity 0.18s ease;
    }
    .xt-modal-overlay.xt-dark {
        background: rgba(0, 0, 0, 0.72);
    }
    .xt-modal-overlay.show {
        opacity: 1;
        pointer-events: auto;
    }

    .xt-modal {
        background: #ffffff;
        border: 1px solid #cfd9de;
        border-radius: 16px;
        width: min(100%, 560px);
        max-height: min(780px, calc(100vh - 48px));
        max-height: min(780px, calc(100dvh - 48px));
        box-shadow: 0 8px 28px rgba(15, 20, 25, 0.18);
        display: flex;
        flex-direction: column;
        min-height: 0;
        transform: translateY(8px) scale(0.985);
        transition: transform 0.2s ease;
        overflow: hidden;
        overscroll-behavior: contain;
        color: #0f1419;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    }
    .xt-modal-overlay.show .xt-modal {
        transform: translateY(0) scale(1);
    }
    .xt-modal-overlay.xt-dark .xt-modal {
        background: #000000;
        border-color: #2f3336;
        border-radius: 20px;
        color: #e7e9ea;
        box-shadow: 0 18px 70px rgba(0, 0, 0, 0.72);
    }
    .xt-modal button,
    .xt-modal input,
    .xt-modal textarea {
        font-family: inherit;
    }

    .xt-modal-header {
        min-height: 66px;
        padding: 0 18px 0 22px;
        border-bottom: 1px solid #eff3f4;
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 16px;
        flex: 0 0 auto;
    }
    .xt-modal-overlay.xt-dark .xt-modal-header {
        min-height: 72px;
        border-bottom-color: #2f3336;
    }
    .xt-modal-title-group {
        min-width: 0;
    }
    .xt-modal-title {
        display: flex;
        align-items: center;
        gap: 10px;
        font-size: 20px;
        font-weight: 800;
        margin: 0;
        letter-spacing: 0;
        line-height: 1.2;
    }
    .xt-modal-title svg {
        width: 22px;
        height: 22px;
        color: #1d9bf0;
        flex: 0 0 auto;
    }
    .xt-modal-close,
    .xt-eye-btn {
        width: 36px;
        height: 36px;
        border: 0;
        border-radius: 50%;
        cursor: pointer;
        color: inherit;
        background: transparent;
        transition: background 0.16s ease, color 0.16s ease;
        padding: 0;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex: 0 0 auto;
    }
    .xt-modal-close:hover,
    .xt-eye-btn:hover {
        background: rgba(15, 20, 25, 0.1);
    }
    .xt-modal-overlay.xt-dark .xt-modal-close,
    .xt-modal-overlay.xt-dark .xt-eye-btn {
        background: rgba(239, 243, 244, 0.08);
    }
    .xt-modal-overlay.xt-dark .xt-modal-close:hover,
    .xt-modal-overlay.xt-dark .xt-eye-btn:hover {
        background: rgba(239, 243, 244, 0.14);
    }
    .xt-modal-close svg,
    .xt-eye-btn svg {
        width: 20px;
        height: 20px;
    }
    .xt-eye-btn svg {
        width: 18px;
        height: 18px;
    }
    .xt-modal-close:focus-visible,
    .xt-eye-btn:focus-visible,
    .xt-segmented-option:focus-visible,
    .xt-btn:focus-visible,
    .xt-btn-reset:focus-visible {
        outline: 2px solid #1d9bf0;
        outline-offset: 2px;
    }

    .xt-modal-body {
        padding: 18px 22px 20px;
        overflow-y: auto;
        flex: 0 1 auto;
        min-height: 0;
        box-sizing: border-box;
        display: flex;
        flex-direction: column;
        gap: 16px;
        overscroll-behavior: contain;
        scrollbar-width: thin;
        -webkit-overflow-scrolling: touch;
    }
    .xt-modal-body > * {
        flex-shrink: 0;
    }
    .xt-modal-overlay.xt-dark .xt-modal-body {
        padding-top: 20px;
    }
    .xt-field-row {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
    }
    .xt-form-group {
        display: flex;
        flex-direction: column;
        gap: 8px;
        min-width: 0;
    }
    .xt-form-label {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        font-size: 13px;
        font-weight: 800;
        color: #536471;
        line-height: 1.35;
    }
    .xt-modal-overlay.xt-dark .xt-form-label {
        color: #71767b;
    }
    .xt-form-hint {
        color: #536471;
        font-size: 12px;
        line-height: 1.35;
    }
    .xt-modal-overlay.xt-dark .xt-form-hint {
        color: #71767b;
    }

    .xt-input, .xt-select, .xt-textarea {
        width: 100%;
        padding: 11px 13px;
        border-radius: 8px;
        border: 1px solid #cfd9de;
        background: #ffffff;
        color: inherit;
        font-family: inherit;
        font-size: 15px;
        line-height: 1.45;
        transition: border-color 0.16s ease, box-shadow 0.16s ease, background 0.16s ease;
        box-sizing: border-box;
    }
    .xt-input {
        min-height: 46px;
    }
    .xt-textarea {
        min-height: 84px;
        resize: vertical;
    }
    .xt-modal-overlay.xt-dark .xt-input,
    .xt-modal-overlay.xt-dark .xt-select,
    .xt-modal-overlay.xt-dark .xt-textarea {
        border-color: #333639;
        background: #000000;
    }
    .xt-input:focus, .xt-select:focus, .xt-textarea:focus {
        outline: none;
        border-color: #1d9bf0;
        box-shadow: 0 0 0 1px #1d9bf0;
    }
    .xt-input[readonly] {
        opacity: 0.7;
        background: #f7f9f9 !important;
        cursor: not-allowed;
    }

    .xt-segmented {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 4px;
        padding: 4px;
        border: 1px solid #eff3f4;
        border-radius: 999px;
        background: #f7f9f9;
    }
    .xt-modal-overlay.xt-dark .xt-segmented {
        padding: 5px;
        border-radius: 14px;
        border-color: #2f3336;
        background: #16181c;
    }
    .xt-segmented-option {
        min-width: 0;
        min-height: 36px;
        padding: 8px 10px;
        border: none;
        border-radius: 999px;
        appearance: none;
        background: transparent;
        color: #536471;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-size: 13px;
        font-weight: 800;
        line-height: 1.25;
        text-align: center;
        white-space: nowrap;
        transition: background 0.16s ease, color 0.16s ease, box-shadow 0.16s ease;
    }
    .xt-modal-overlay.xt-dark .xt-segmented-option {
        border-radius: 10px;
        color: #71767b;
    }
    .xt-segmented-option:hover {
        background: rgba(15, 20, 25, 0.06);
    }
    .xt-modal-overlay.xt-dark .xt-segmented-option:hover {
        background: rgba(239, 243, 244, 0.08);
    }
    .xt-segmented-option.active {
        background: #0f1419;
        color: #ffffff;
    }
    .xt-modal-overlay.xt-dark .xt-segmented-option.active {
        background: #1d9bf0;
        color: #ffffff;
        box-shadow: 0 8px 18px rgba(29, 155, 240, 0.24);
    }

    .xt-advanced-panel {
        border-radius: 12px;
        border: 1px solid #eff3f4;
        background: #f7f9f9;
        overflow: hidden;
    }
    .xt-modal-overlay.xt-dark .xt-advanced-panel {
        border-color: #2f3336;
        border-radius: 16px;
        background: #080808;
    }
    .xt-advanced-title {
        padding: 16px 14px 0;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 2px;
        font-size: 16px;
        font-weight: 800;
    }
    .xt-advanced-title small {
        color: #536471;
        font-size: 12px;
        line-height: 1.25;
        font-weight: 600;
    }
    .xt-modal-overlay.xt-dark .xt-advanced-title small {
        color: #71767b;
    }
    .xt-prompt-container {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
        padding: 14px;
    }
    .xt-prompt-container .xt-form-group {
        grid-column: 1 / -1;
    }

    .xt-modal-footer {
        padding: 14px 22px 18px;
        border-top: 1px solid #eff3f4;
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 14px;
        flex: 0 0 auto;
        background: #ffffff;
    }
    .xt-modal-overlay.xt-dark .xt-modal-footer {
        border-top-color: #2f3336;
        background: #000000;
    }
    .xt-footer-note {
        color: #536471;
        font-size: 13px;
        line-height: 1.35;
    }
    .xt-modal-overlay.xt-dark .xt-footer-note {
        color: #71767b;
    }
    .xt-footer-actions {
        display: flex;
        align-items: center;
        gap: 10px;
        flex: 0 0 auto;
    }
    .xt-btn {
        min-height: 42px;
        padding: 0 19px;
        border-radius: 9999px;
        font-weight: 800;
        font-size: 15px;
        cursor: pointer;
        transition: background 0.16s ease, color 0.16s ease, border-color 0.16s ease;
        border: 1px solid #cfd9de;
        box-sizing: border-box;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        white-space: nowrap;
    }
    .xt-btn svg {
        width: 17px;
        height: 17px;
    }
    .xt-btn-cancel {
        background: #ffffff;
        color: #0f1419;
    }
    .xt-btn-cancel:hover {
        background: rgba(15, 20, 25, 0.06);
    }
    .xt-btn-save {
        background: #0f1419;
        color: #ffffff;
        border-color: #0f1419;
    }
    .xt-btn-save:hover {
        background: #272c30;
        border-color: #272c30;
    }
    .xt-modal-overlay.xt-dark .xt-btn-cancel {
        background: #000000;
        color: #e7e9ea;
        border-color: #536471;
    }
    .xt-modal-overlay.xt-dark .xt-btn-cancel:hover {
        background: rgba(239, 243, 244, 0.08);
    }
    .xt-modal-overlay.xt-dark .xt-btn-save {
        background: #eff3f4;
        color: #0f1419;
        border-color: #eff3f4;
    }
    .xt-modal-overlay.xt-dark .xt-btn-save:hover {
        background: #d7dbdc;
        border-color: #d7dbdc;
    }

    .xt-btn-reset {
        font-size: 12px;
        font-weight: 700;
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
        right: 6px;
        color: #536471;
    }
    .xt-modal-overlay.xt-dark .xt-eye-btn {
        color: #71767b;
        background: transparent;
    }

    @media (max-width: 640px) {
        .xt-modal-overlay {
            align-items: flex-end;
            padding: 12px;
        }
        .xt-modal,
        .xt-modal-overlay.xt-dark .xt-modal {
            border-radius: 18px;
            max-height: calc(100vh - 24px);
            max-height: calc(100dvh - 24px);
        }
        .xt-modal-header,
        .xt-modal-body,
        .xt-modal-footer {
            padding-left: 18px;
            padding-right: 18px;
        }
        .xt-field-row,
        .xt-prompt-container {
            grid-template-columns: 1fr;
        }
        .xt-prompt-container .xt-form-group {
            grid-column: auto;
        }
        .xt-footer-note {
            display: none;
        }
        .xt-footer-actions {
            width: 100%;
        }
        .xt-btn {
            flex: 1 1 0;
            min-width: 0;
        }
    }

    .xt-toast {
        position: fixed;
        bottom: 24px;
        left: 50%;
        transform: translateX(-50%) translateY(100px);
        min-height: 44px;
        padding: 0 20px;
        border-radius: 9999px;
        background: #0f1419;
        color: #ffffff;
        font-weight: 800;
        font-size: 14px;
        z-index: 100001;
        box-shadow: 0 10px 24px rgba(15, 20, 25, 0.2);
        transition: transform 0.24s cubic-bezier(0.175, 0.885, 0.32, 1.1);
        pointer-events: none;
        display: inline-flex;
        align-items: center;
        gap: 10px;
    }
    .xt-toast.show {
        transform: translateX(-50%) translateY(0);
    }
    .xt-toast svg {
        width: 18px;
        height: 18px;
        flex: 0 0 auto;
    }
    .xt-toast.xt-dark {
        background: #eff3f4;
        color: #0f1419;
        box-shadow: 0 12px 30px rgba(0, 0, 0, 0.48);
    }

    .xt-translate-icon, .xt-remove-icon {
        width: 28px;
        height: 28px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background: transparent;
        border: none;
        border-radius: 50%;
        cursor: pointer;
        transition: background 0.16s ease, color 0.16s ease, border-color 0.16s ease;
        padding: 0;
        margin-left: 4px;
        vertical-align: middle;
        line-height: 1;
        outline: none;
    }
    .xt-translate-icon {
        color: #536471;
    }
    .xt-remove-icon {
        color: #1d9bf0;
        background: rgba(29, 155, 240, 0.1);
    }
    .xt-translate-icon:hover, .xt-remove-icon:hover {
        background: rgba(29, 155, 240, 0.1);
        color: #1d9bf0;
    }
    .xt-translate-icon.xt-dark {
        color: #71767b;
    }
    .xt-remove-icon.xt-dark {
        color: #1d9bf0;
        background: rgba(29, 155, 240, 0.14);
        box-shadow: inset 0 0 0 1px rgba(29, 155, 240, 0.28);
    }
    .xt-translate-icon.xt-dark:hover, .xt-remove-icon.xt-dark:hover {
        background: rgba(29, 155, 240, 0.16);
        color: #1d9bf0;
    }
    .xt-translate-icon svg,
    .xt-remove-icon svg {
        width: 15px;
        height: 15px;
    }
    .xt-translate-icon.loading {
        opacity: 0.55;
        pointer-events: none;
    }
    .xt-translate-icon.loading svg {
        animation: xt-spin 1s linear infinite;
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
let restoreSettingsPageScroll = null;

function lockSettingsPageScroll() {
    if (restoreSettingsPageScroll) return;

    const html = document.documentElement;
    const body = document.body;
    const scrollTop = window.scrollY || document.scrollingElement?.scrollTop || 0;
    const previousStyles = {
        htmlOverflow: html.style.overflow,
        bodyOverflow: body.style.overflow,
        bodyPosition: body.style.position,
        bodyTop: body.style.top,
        bodyWidth: body.style.width
    };

    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    body.style.position = 'fixed';
    body.style.top = `-${scrollTop}px`;
    body.style.width = '100%';

    restoreSettingsPageScroll = () => {
        html.style.overflow = previousStyles.htmlOverflow;
        body.style.overflow = previousStyles.bodyOverflow;
        body.style.position = previousStyles.bodyPosition;
        body.style.top = previousStyles.bodyTop;
        body.style.width = previousStyles.bodyWidth;
        restoreSettingsPageScroll = null;
        window.scrollTo(0, scrollTop);
    };
}

function unlockSettingsPageScroll() {
    if (restoreSettingsPageScroll) {
        restoreSettingsPageScroll();
    }
}

function preventSettingsBackgroundScroll(event) {
    const modalBody = modalOverlay?.querySelector('.xt-modal-body');
    const target = event.target instanceof Node ? event.target : null;
    if (!modalBody || !target || modalBody.contains(target)) return;
    event.preventDefault();
}

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
                <div class="xt-modal-title-group">
                    <h3 class="xt-modal-title">${TRANSLATE_ICON_SVG}<span>翻译设置</span></h3>
                </div>
                <button class="xt-modal-close" id="xt-close-btn" type="button" aria-label="关闭设置">${CLOSE_ICON_SVG}</button>
            </div>
            <div class="xt-modal-body">
                <div class="xt-form-group">
                    <label class="xt-form-label">API Key</label>
                    <div class="xt-api-key-container">
                        <input type="password" id="xt-api-key" class="xt-input" placeholder="输入 API 密钥 (API Key)" value="${safeSettings.apiKey}" autocomplete="off">
                        <button class="xt-eye-btn" id="xt-eye-toggle" type="button" aria-label="显示 API Key">${EYE_ICON_SVG}</button>
                    </div>
                </div>

                <div class="xt-field-row">
                    <div class="xt-form-group">
                        <label class="xt-form-label">接口地址</label>
                        <input type="text" id="xt-base-url" class="xt-input" placeholder="https://api.openai.com/v1" value="${safeSettings.baseUrl}" autocomplete="off">
                        <span class="xt-form-hint">仅支持 OpenAI 兼容的 Chat Completions 格式；填写 v1 地址即可。</span>
                    </div>

                    <div class="xt-form-group">
                        <label class="xt-form-label">模型</label>
                        <input type="text" id="xt-model" class="xt-input" placeholder="gpt-4o-mini" value="${safeSettings.model}" autocomplete="off">
                    </div>
                </div>

                <div class="xt-form-group">
                    <label class="xt-form-label">翻译模式</label>
                    <div class="xt-segmented" id="xt-translation-mode" role="group" aria-label="翻译模式">
                        ${renderSegmentedOptions(TRANSLATION_MODE_OPTIONS, safeSettings.translationMode)}
                    </div>
                </div>

                <div class="xt-advanced-panel">
                    <div class="xt-advanced-title">
                        <span>高级选项</span>
                        <small>提示词、缓存时间和输出风格</small>
                    </div>
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
                            <textarea id="xt-sys-prompt" class="xt-textarea" rows="2">${safeSettings.systemPrompt}</textarea>
                        </div>
                        <div class="xt-form-group">
                            <div style="display:flex; justify-content:space-between; align-items:center;">
                                <label class="xt-form-label">User Prompt（自定义部分）</label>
                                <button class="xt-btn-reset" id="xt-reset-user" type="button">恢复默认</button>
                            </div>
                            <textarea id="xt-user-prompt" class="xt-textarea" rows="4">${safeSettings.userPrompt}</textarea>
                        </div>
                    </div>
                </div>
            </div>
            <div class="xt-modal-footer">
                <span class="xt-footer-note">保存后刷新 X 页面生效</span>
                <div class="xt-footer-actions">
                    <button class="xt-btn xt-btn-cancel" id="xt-cancel-btn" type="button">取消</button>
                    <button class="xt-btn xt-btn-save" id="xt-save-btn" type="button">${CHECK_ICON_SVG}<span>保存</span></button>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(modalOverlay);
    modalOverlay.addEventListener('wheel', preventSettingsBackgroundScroll, { passive: false });
    modalOverlay.addEventListener('touchmove', preventSettingsBackgroundScroll, { passive: false });
    
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
    const resetSysBtn = modalOverlay.querySelector('#xt-reset-sys');
    const resetUserBtn = modalOverlay.querySelector('#xt-reset-user');
    
    bindSegmentedControl(translationModeControl, settings.translationMode);

    eyeToggle.addEventListener('click', () => {
        if (apiKeyInput.type === 'password') {
            apiKeyInput.type = 'text';
            eyeToggle.innerHTML = EYE_OFF_ICON_SVG;
            eyeToggle.setAttribute('aria-label', '隐藏 API Key');
        } else {
            apiKeyInput.type = 'password';
            eyeToggle.innerHTML = EYE_ICON_SVG;
            eyeToggle.setAttribute('aria-label', '显示 API Key');
        }
    });

    resetSysBtn.addEventListener('click', () => {
        sysPromptInput.value = DEFAULT_SYSTEM_PROMPT.trim();
    });
    resetUserBtn.addEventListener('click', () => {
        userPromptInput.value = DEFAULT_USER_PROMPT.trim();
    });

    const closeModal = () => {
        modalOverlay.classList.remove('show');
        unlockSettingsPageScroll();
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
        eyeToggle.innerHTML = EYE_ICON_SVG;
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
    lockSettingsPageScroll();

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
    toastEl.classList.toggle('xt-dark', isDarkTheme());
    toastEl.innerHTML = `${CHECK_ICON_SVG}<span>${escapeHtml(message)}</span>`;
    toastEl.classList.add('show');
    setTimeout(() => {
        toastEl.classList.remove('show');
    }, 3000);
}

if (typeof GM_registerMenuCommand === 'function') {
    GM_registerMenuCommand('配置 X 翻译 API', showSettingsModal);
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

function createTranslationContainerElement() {
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

    if (isDarkTheme()) {
        translationContainer.classList.add('xt-dark');
    }

    return translationContainer;
}

function renderTranslationShell(contentHtml) {
    return `
        <div class="translation-container-header">${TRANSLATE_ICON_SVG}<span>AI 翻译</span></div>
        <div class="translation-container-content">${contentHtml}</div>
    `;
}

function getTranslationContentHtml(translatedText) {
    try {
        if (typeof marked !== 'undefined') {
            marked.setOptions({
                breaks: true,
                gfm: true,
                headerIds: false,
                mangle: false,
            });

            const rawHtml = marked.parse(translatedText);
            return typeof DOMPurify !== 'undefined'
                ? DOMPurify.sanitize(rawHtml)
                : rawHtml;
        }
        console.warn('[X-Translate] Marked library not loaded, falling back to basic formatting');
    } catch (e) {
        console.error('[X-Translate] Error rendering Markdown:', e);
    }

    return escapeHtml(translatedText).replace(/\n/g, '<br>');
}

function setTranslationContainerHtml(translationContainer, contentHtml) {
    if (!translationContainer) return;
    translationContainer.innerHTML = renderTranslationShell(contentHtml);
}

function setTranslationContainerContent(translationContainer, translatedText) {
    setTranslationContainerHtml(translationContainer, getTranslationContentHtml(translatedText));
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

    const translationContainer = createTranslationContainerElement();
    setTranslationContainerContent(translationContainer, translatedText);

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
    return (text.match(/\p{Script=Han}/gu) || []).length;
}

function hasChineseChar(text) {
    return getChineseCharCount(text) > 0;
}

function hasNonChineseTranslatableChar(text) {
    return /[a-zA-Z\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af\u0400-\u04ff]/.test(text);
}

function normalizeLinkCandidateText(text) {
    return (text || '')
        .replace(/[\u200B-\u200D\uFEFF]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function isUrlLikeTextToken(token) {
    const normalizedToken = normalizeLinkCandidateText(token)
        .replace(/^[<([{]+/, '')
        .replace(/[>\])}.,;:!?，。；：！？]+$/, '');

    if (!normalizedToken) return false;
    if (/^https?:\/\/\S+$/i.test(normalizedToken)) return true;

    return /^(?:www\.)?(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}(?::\d{2,5})?(?:[/?#]\S*)?$/i.test(normalizedToken);
}

function isPureLinkText(text) {
    const normalizedText = normalizeLinkCandidateText(text);
    if (!normalizedText) return false;

    const tokens = normalizedText.split(' ').filter(Boolean);
    return tokens.length > 0 && tokens.every(isUrlLikeTextToken);
}

function normalizeLowInformationToken(token) {
    return normalizeLinkCandidateText(token)
        .replace(/^[<([{'"“‘]+/, '')
        .replace(/[>\])}'"”’.,;:!?，。；：！？]+$/, '');
}

function isLowInformationToken(token) {
    const normalizedToken = normalizeLowInformationToken(token);
    if (!normalizedToken) return true;
    if (isUrlLikeTextToken(normalizedToken)) return true;
    if (/^[@#＃$]\S+$/.test(normalizedToken)) return true;
    if (/^[\d\s.,;:!?%+\-_/\\()[\]{}'"“”‘’|]+$/.test(normalizedToken)) return true;
    return false;
}

function getTranslatableWordCount(text) {
    const meaningfulText = normalizeLinkCandidateText(text)
        .split(' ')
        .filter(token => !isLowInformationToken(token))
        .join(' ');
    const words = meaningfulText.match(/[a-zA-Z]+(?:['’-][a-zA-Z]+)?|[\u3040-\u30ff]+|[\uac00-\ud7af]+|[\u0400-\u04ff]+/g);
    return words ? words.length : 0;
}

function getTweetTextTranslationEligibility(text) {
    if (hasChineseChar(text)) {
        return { eligible: false, reason: 'contains_chinese' };
    }

    if (isPureLinkText(text)) {
        return { eligible: false, reason: 'pure_link' };
    }

    if (!hasNonChineseTranslatableChar(text)) {
        return { eligible: false, reason: 'no_translatable_content' };
    }

    const tokens = normalizeLinkCandidateText(text).split(' ').filter(Boolean);
    if (tokens.length > 0 && tokens.every(isLowInformationToken)) {
        return { eligible: false, reason: 'low_information_content' };
    }

    const translatableWordCount = getTranslatableWordCount(text);
    if (translatableWordCount <= 3) {
        return { eligible: false, reason: 'not_enough_translatable_words', translatableWordCount };
    }

    return { eligible: true, translatableWordCount };
}

function getTranslationSkipMessage(reason) {
    const messages = {
        contains_chinese: '包含中文内容，无需翻译',
        pure_link: '纯链接内容无需翻译',
        no_translatable_content: '没有可翻译内容',
        low_information_content: '低信息内容无需翻译',
        not_enough_translatable_words: '内容过短，无需翻译'
    };
    return messages[reason] || '该内容无需翻译';
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

function startTweetTranslation(tweetElement, candidate = null, btn = getTranslateButton(tweetElement), options = {}) {
    if (tweetElement.querySelector('.translation-container')) {
        setTranslateButtonState(btn, 'remove');
        return { status: 'already_translated' };
    }
    if (tweetElement.getAttribute('data-xt-translating') === 'true') {
        return { status: 'translating' };
    }

    const translationCandidate = candidate || getTweetTranslationCandidate(tweetElement);
    if (translationCandidate.status !== 'success') {
        if (translationCandidate.status === 'skip' && options.showSkipToast) {
            showToast(getTranslationSkipMessage(translationCandidate.reason));
        }
        return translationCandidate;
    }

    tweetElement.setAttribute('data-xt-translating', 'true');
    setTranslateButtonState(btn, 'translate', true);

    translateText(translationCandidate.formattedText || translationCandidate.text, translationCandidate.element, translationCandidate.text, () => {
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
        startTweetTranslation(tweetElement, null, btn, { showSkipToast: true });
    } else if (action === 'remove') {
        removeTweetTranslation(tweetElement, btn);
    }
}

// 统一判断推文是否值得翻译：按钮注入、自动翻译和手动翻译都只走这一个入口。
function getTweetTranslationCandidate(tweetElement) {
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

    const eligibility = getTweetTextTranslationEligibility(text);
    if (!eligibility.eligible) {
        return { status: 'skip', reason: eligibility.reason, text };
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
    const translationContainer = createTranslationContainerElement();
    setTranslationContainerHtml(translationContainer, '<span class="translation-placeholder">翻译中...</span>');

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
            setTranslationContainerHtml(translationContainer, '<span class="translation-placeholder">翻译中...</span>');
            return;
        }
        const escaped = escapeHtml(accumulatedText).replace(/\n/g, '<br>');
        setTranslationContainerHtml(translationContainer, escaped);
    }

    // 最终渲染：用 marked 做完整 Markdown 渲染
    function finalizeTranslation() {
        if (!accumulatedText) {
            setTranslationContainerContent(translationContainer, '翻译失败，请重试。');
            return;
        }
        setTranslationContainerContent(translationContainer, accumulatedText);
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
                        if (!accumulatedText) accumulatedText = '翻译失败，请重试。';
                        finalizeTranslation();
                    } catch (e) {
                        console.error('[X-Translate] Failed to parse response:', e, 'Raw:', response.responseText);
                        setTranslationContainerContent(translationContainer, '解析 API 响应失败，请重试。');
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
                setTranslationContainerContent(translationContainer, errorMsg);
                if (onCompleteCallback) onCompleteCallback();
            }
        },
        onerror: function(error) {
            console.error('[X-Translate] GM.xmlHttpRequest error:', error);
            setTranslationContainerContent(translationContainer, '网络请求错误，请检查您的网络连接或接口地址是否可用。');
            if (onCompleteCallback) onCompleteCallback();
        },
        onabort: function() {
            console.error('[X-Translate] GM.xmlHttpRequest aborted');
            setTranslationContainerContent(translationContainer, '请求已中止。');
            if (onCompleteCallback) onCompleteCallback();
        },
        ontimeout: function() {
            console.error('[X-Translate] GM.xmlHttpRequest timed out');
            setTranslationContainerContent(translationContainer, '请求超时，请检查接口服务响应速度或您的加速网络。');
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

    const result = getTweetTranslationCandidate(tweetElement);

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
    setTimeout(() => {
        observeTweets();
    }, 1000);
})();
