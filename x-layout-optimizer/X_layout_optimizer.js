// ==UserScript==
// @name         X Layout Optimizer & Article TOC
// @namespace    http://tampermonkey.net/
// @version      1.10
// @description  Optimize X layout width, add reading navigation, and show article-only table of contents.
// @author       You
// @match        https://x.com/*
// @match        https://twitter.com/*
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    const STORAGE_KEY = 'x_layout_optimizer_settings_v1';
    const DEFAULT_SETTINGS = Object.freeze({
        timelineWidth: 750,
        articleWidth: 800,
        floatingGap: 12,
        tocPanelWidth: 286,
        tocPanelOffsetX: 18,
        scrollVisibilityOffset: 420,
        hideLeftNavigation: false,
        hideRightSidebar: false,
        fillCenter: false,
        hideNavBookmarks: false,
        hideNavJobs: false,
        hideNavCreatorStudio: false,
        hideNavCommunities: false,
        hideNavBusiness: false,
        hideNavPremium: false,
        hideNavVerifiedOrganizations: false,
        hideNavMonetization: false,
        hideNavAds: false,
        hideChatDrawer: false,
        hideGrokDrawer: false,
        hidePremiumUpsells: false,
        hideTrends: false,
        hideWhoToFollow: false,
        hidePromotedPosts: false,
        hideDiscoverMore: false,
        hideFooter: false
    });
    const SETTING_LIMITS = Object.freeze({
        timelineWidth: { min: 480, max: 1200 },
        articleWidth: { min: 480, max: 1200 },
        floatingGap: { min: 0, max: 80 },
        tocPanelWidth: { min: 220, max: 520 },
        tocPanelOffsetX: { min: -160, max: 160 },
        scrollVisibilityOffset: { min: 0, max: 1200 }
    });
    const TIMELINE_SIDEBAR_GAP = 30;
    const VIEWPORT_EDGE_GAP = 16;
    const BOOLEAN_SETTING_KEYS = Object.freeze([
        'hideLeftNavigation',
        'hideRightSidebar',
        'fillCenter',
        'hideNavBookmarks',
        'hideNavJobs',
        'hideNavCreatorStudio',
        'hideNavCommunities',
        'hideNavBusiness',
        'hideNavPremium',
        'hideNavVerifiedOrganizations',
        'hideNavMonetization',
        'hideNavAds',
        'hideChatDrawer',
        'hideGrokDrawer',
        'hidePremiumUpsells',
        'hideTrends',
        'hideWhoToFollow',
        'hidePromotedPosts',
        'hideDiscoverMore',
        'hideFooter'
    ]);
    const LAYOUT_EXCLUDED_PATHS = Object.freeze(['/messages', '/i/chat', '/settings']);
    const NATIVE_DESKTOP_LAYOUT_WIDTH = 1265;
    const NAVIGATION_CLEANUP_RULES = Object.freeze([
        {
            key: 'hideNavBookmarks',
            paths: ['/i/bookmarks'],
            labels: ['Bookmarks', '书签', '書籤', 'ブックマーク', '북마크']
        },
        {
            key: 'hideNavJobs',
            paths: ['/jobs', '/i/jobs'],
            labels: ['Jobs', 'Careers', '工作', '工作机会', '工作機會', '求人', '채용 정보']
        },
        {
            key: 'hideNavCreatorStudio',
            paths: ['/i/jf/creators/studio'],
            labels: ['Creator Studio', '创作者工作室', '創作者工作室', 'クリエイタースタジオ', '크리에이터 스튜디오']
        },
        {
            key: 'hideNavCommunities',
            paths: ['/i/communities'],
            labels: ['Communities', '社区', '社群', 'コミュニティ', '커뮤니티']
        },
        {
            key: 'hideNavBusiness',
            paths: ['/i/business'],
            labels: ['Business', '商业', '商業', 'ビジネス', '비즈니스']
        },
        {
            key: 'hideNavPremium',
            paths: ['/i/premium', '/i/premium_sign_up'],
            labels: ['Premium', 'プレミアム']
        },
        {
            key: 'hideNavVerifiedOrganizations',
            paths: ['/i/verified-orgs', '/i/verified-orgs-signup'],
            labels: ['Verified Organizations', 'Verified Orgs', '认证组织', '已认证组织', '已認證組織', '認証済み組織', '인증된 조직']
        },
        {
            key: 'hideNavMonetization',
            paths: ['/i/monetization'],
            labels: ['Monetization', '变现', '营利', '營利', '収益化', '수익 창출']
        },
        {
            key: 'hideNavAds',
            paths: ['/i/ads'],
            labels: ['Ads', '广告', '廣告', '広告']
        }
    ]);
    const FOOTER_LABELS = Object.freeze(['Footer', '页脚', '頁尾', 'フッター', '바닥글']);
    const PROMOTED_POST_LABELS = Object.freeze(['Promoted', '推广']);
    const DISCOVER_MORE_LABELS = Object.freeze([
        'Discover more',
        '发现更多',
        '發現更多',
        '探索更多',
        'もっと見つける',
        '더 찾아보기'
    ]);
    const PREMIUM_UPSELL_LABELS = Object.freeze([
        'Subscribe to Premium',
        '订阅 Premium',
        '訂閱 Premium',
        'プレミアムにサブスクライブ',
        'Premium 구독하기'
    ]);
    const SCROLL_TOP_ICON_SVG = '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M12 5.5l-7 7 1.4 1.4L11 9.3V20h2V9.3l4.6 4.6L19 12.5z"/></svg>';
    const SCROLL_BOTTOM_ICON_SVG = '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M12 18.5l7-7-1.4-1.4-4.6 4.6V4h-2v10.7l-4.6-4.6L5 11.5z"/></svg>';
    const TOC_ICON_SVG = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 6h13M8 12h13M8 18h13"/><path d="M3 6h.01M3 12h.01M3 18h.01"/></svg>';
    const CLOSE_ICON_SVG = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>';
    const CHECK_ICON_SVG = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>';

    // 配置统一在这里校验，避免 CSS、定位逻辑、设置面板各自维护一套默认值。
    function normalizeSettings(rawSettings = {}) {
        const source = rawSettings && typeof rawSettings === 'object' ? rawSettings : {};
        const nextSettings = {};
        Object.keys(DEFAULT_SETTINGS).forEach(key => {
            if (BOOLEAN_SETTING_KEYS.includes(key)) {
                nextSettings[key] = typeof source[key] === 'boolean'
                    ? source[key]
                    : DEFAULT_SETTINGS[key];
                return;
            }
            const limits = SETTING_LIMITS[key];
            const fallback = DEFAULT_SETTINGS[key];
            const value = Number.parseInt(source[key], 10);
            const safeValue = Number.isFinite(value) ? value : fallback;
            nextSettings[key] = Math.min(limits.max, Math.max(limits.min, safeValue));
        });
        return nextSettings;
    }

    function loadSettings() {
        try {
            const raw = typeof GM_getValue === 'function' ? GM_getValue(STORAGE_KEY, '') : '';
            return normalizeSettings(raw ? JSON.parse(raw) : DEFAULT_SETTINGS);
        } catch (error) {
            console.warn('[X Layout Optimizer] Failed to load settings:', error);
            return normalizeSettings(DEFAULT_SETTINGS);
        }
    }

    function saveSettings(settings) {
        currentSettings = normalizeSettings(settings);
        if (typeof GM_setValue === 'function') {
            GM_setValue(STORAGE_KEY, JSON.stringify(currentSettings));
        }
        applySettingsToDocument();
    }

    function resetSettings() {
        saveSettings(DEFAULT_SETTINGS);
        populateSettingsModal(currentSettings);
        showToast('已恢复默认配置');
    }

    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function addStyle(css) {
        if (typeof GM_addStyle === 'function') {
            GM_addStyle(css);
            return;
        }
        const style = document.createElement('style');
        style.textContent = css;
        document.head.appendChild(style);
    }

    addStyle(`
        :root {
            --xuo-timeline-width: ${DEFAULT_SETTINGS.timelineWidth}px;
            --xuo-article-width: ${DEFAULT_SETTINGS.articleWidth}px;
            --xuo-toc-panel-width: ${DEFAULT_SETTINGS.tocPanelWidth}px;
            --xuo-toc-panel-offset-x: ${DEFAULT_SETTINGS.tocPanelOffsetX}px;
        }

        html.xuo-hide-left-navigation header[role="banner"] {
            display: none !important;
        }

        html.xuo-hide-right-sidebar [data-testid="sidebarColumn"] {
            display: none !important;
        }

        html.xuo-hide-chat-drawer [data-testid="chat-drawer-root"] {
            opacity: 0 !important;
            pointer-events: none !important;
            transform: translate(120%, 120%) !important;
            transition: opacity 0.15s ease, transform 0.15s ease !important;
        }

        html.xuo-hide-grok-drawer [data-testid="GrokDrawer"] {
            opacity: 0 !important;
            pointer-events: none !important;
            transform: translate(120%, 120%) !important;
            transition: opacity 0.15s ease, transform 0.15s ease !important;
        }

        .xuo-cleanup-hidden {
            display: none !important;
        }

        .xuo-discover-more-list {
            min-height: var(--xuo-discover-more-height) !important;
        }

        main.xuo-main-layout {
            width: 100% !important;
            max-width: none !important;
            min-width: 0 !important;
        }

        @media (min-width: 1000px) {
            html.xuo-layout-active:not(.xuo-hide-left-navigation) header[role="banner"] {
                margin-left: max(${VIEWPORT_EDGE_GAP}px, calc((100vw - ${NATIVE_DESKTOP_LAYOUT_WIDTH}px) / 2)) !important;
            }
        }

        .xuo-timeline-shell {
            width: min(var(--xuo-effective-layout-width), 100%) !important;
            max-width: none !important;
            min-width: 0 !important;
            box-sizing: border-box !important;
        }

        .xuo-timeline-shell-root.xuo-timeline-standalone {
            margin-left: auto !important;
            margin-right: auto !important;
        }

        .xuo-timeline-content-shell {
            width: 100% !important;
            max-width: none !important;
            min-width: 0 !important;
            box-sizing: border-box !important;
        }

        /* 仅调整带稳定 testid 的主栏；可用宽度由脚本按同级侧栏和 main 计算。 */
        [data-testid="primaryColumn"].xuo-primary-layout {
            width: min(var(--xuo-effective-timeline-width), 100%) !important;
            max-width: min(var(--xuo-effective-timeline-width), 100%) !important;
            flex: 0 1 auto !important;
            box-sizing: border-box !important;
        }

        [data-testid="primaryColumn"].xuo-primary-layout.xuo-primary-standalone {
            margin-left: auto !important;
            margin-right: auto !important;
        }

        [data-testid="sidebarColumn"] form[role="search"] {
            width: 100% !important;
            max-width: none !important;
            margin-left: 0 !important;
            margin-right: 0 !important;
            box-sizing: border-box !important;
        }

        [data-testid="SearchBox_Search_Input"] {
            width: 100% !important;
            max-width: 100% !important;
            box-sizing: border-box !important;
        }

        html.xuo-article-page .xuo-article-shell {
            width: 100% !important;
            max-width: none !important;
            min-width: 0 !important;
            margin-left: auto !important;
            margin-right: auto !important;
            flex-basis: auto !important;
            box-sizing: border-box !important;
        }

        html.xuo-article-page .xuo-article-width {
            width: min(100%, var(--xuo-article-width)) !important;
            max-width: none !important;
            min-width: 0 !important;
            margin-left: auto !important;
            margin-right: auto !important;
            align-self: center !important;
        }

        html.xuo-article-page .xuo-article-read-view > div,
        html.xuo-article-page .xuo-article-rich-text,
        html.xuo-article-page .xuo-article-rich-text > div,
        html.xuo-article-page .xuo-article-rich-text .DraftEditor-root,
        html.xuo-article-page .xuo-article-rich-text .DraftEditor-editorContainer,
        html.xuo-article-page .xuo-article-rich-content,
        html.xuo-article-page .xuo-article-rich-content > div,
        html.xuo-article-page .xuo-article-rich-content .longform-unstyled,
        html.xuo-article-page .xuo-article-rich-content .longform-header-one,
        html.xuo-article-page .xuo-article-rich-content .longform-header-two,
        html.xuo-article-page .xuo-article-rich-content .longform-header-three {
            width: 100% !important;
            max-width: none !important;
        }

        html.xuo-article-page .xuo-article-rich-content blockquote {
            width: calc(100% - 40px) !important;
            max-width: none !important;
        }

        html.xuo-article-page .xuo-article-rich-content li {
            max-width: none !important;
        }

        html.xuo-article-page .xuo-article-metrics {
            width: 100% !important;
            max-width: none !important;
            min-width: 0 !important;
            box-sizing: border-box !important;
        }

        @media (max-width: 720px) {
            html.xuo-article-page .xuo-article-width,
            html.xuo-article-page .xuo-article-shell {
                width: 100% !important;
            }
        }

        .xuo-scroll-nav-button,
        .xuo-toc-toggle {
            position: fixed;
            left: var(--xuo-floating-left, auto);
            right: var(--xuo-floating-right, 18px);
            width: 42px;
            height: 42px;
            border: 1px solid #cfd9de;
            border-radius: 50%;
            background: #ffffff;
            color: #0f1419;
            z-index: 99999;
            cursor: pointer;
            box-shadow: 0 4px 16px rgba(15, 20, 25, 0.16);
            display: inline-flex;
            align-items: center;
            justify-content: center;
            padding: 0;
            opacity: 0;
            pointer-events: none;
            transform: translateY(8px);
            transition: opacity 0.18s ease, transform 0.18s ease, background 0.16s ease, color 0.16s ease, border-color 0.16s ease;
        }

        .xuo-scroll-top-button {
            bottom: 88px;
        }

        .xuo-scroll-bottom-button {
            bottom: 38px;
        }

        .xuo-toc-toggle {
            bottom: 138px;
        }

        .xuo-scroll-nav-button.show,
        .xuo-toc-root.show .xuo-toc-toggle {
            opacity: 1;
            pointer-events: auto;
            transform: translateY(0);
        }

        .xuo-scroll-nav-button:hover,
        .xuo-toc-toggle:hover,
        .xuo-toc-root.open .xuo-toc-toggle {
            background: #1d9bf0;
            border-color: #1d9bf0;
            color: #ffffff;
            transform: translateY(-1px);
        }

        .xuo-scroll-nav-button:active,
        .xuo-toc-toggle:active {
            transform: translateY(0);
        }

        .xuo-scroll-nav-button.xuo-dark,
        .xuo-toc-toggle.xuo-dark {
            background: #16181c;
            color: #e7e9ea;
            border-color: #2f3336;
            box-shadow: 0 12px 28px rgba(0, 0, 0, 0.45);
        }

        .xuo-scroll-nav-button.xuo-dark:hover,
        .xuo-toc-toggle.xuo-dark:hover,
        .xuo-toc-root.open .xuo-toc-toggle.xuo-dark {
            background: #1d9bf0;
            color: #ffffff;
            border-color: #1d9bf0;
        }

        .xuo-scroll-nav-button:focus-visible,
        .xuo-toc-toggle:focus-visible,
        .xuo-toc-item:focus-visible {
            outline: 2px solid #1d9bf0;
            outline-offset: 2px;
        }

        .xuo-scroll-nav-button svg,
        .xuo-toc-toggle svg {
            width: 20px;
            height: 20px;
        }

        .xuo-toc-root {
            position: fixed;
            left: var(--xuo-floating-left, auto);
            right: var(--xuo-floating-right, 18px);
            bottom: 138px;
            width: 42px;
            height: 42px;
            z-index: 99999;
            pointer-events: none;
        }

        .xuo-toc-panel {
            position: absolute;
            left: var(--xuo-toc-panel-left, var(--xuo-toc-panel-offset-x, 28px));
            right: auto;
            bottom: 50px;
            width: min(var(--xuo-toc-panel-width), calc(100vw - 32px));
            max-height: min(370px, calc(100vh - 220px));
            box-sizing: border-box;
            overflow: auto;
            border: 1px solid #cfd9de;
            border-radius: 8px;
            background: #ffffff;
            color: #0f1419;
            box-shadow: 0 16px 38px rgba(15, 20, 25, 0.18);
            opacity: 0;
            pointer-events: none;
            transform: translateY(6px) scale(0.98);
            transform-origin: var(--xuo-toc-panel-transform-origin, bottom left);
            transition: opacity 0.16s ease, transform 0.16s ease, background 0.16s ease, color 0.16s ease, border-color 0.16s ease;
            scrollbar-width: thin;
        }

        .xuo-toc-root.open .xuo-toc-panel {
            opacity: 1;
            pointer-events: auto;
            transform: translateY(0) scale(1);
        }

        .xuo-toc-panel.xuo-dark {
            background: #16181c;
            color: #e7e9ea;
            border-color: #2f3336;
            box-shadow: 0 18px 42px rgba(0, 0, 0, 0.48);
        }

        .xuo-toc-heading {
            padding: 12px 14px 8px;
            font-size: 13px;
            font-weight: 800;
            color: #536471;
            border-bottom: 1px solid #eff3f4;
        }

        .xuo-toc-panel.xuo-dark .xuo-toc-heading {
            color: #71767b;
            border-bottom-color: #2f3336;
        }

        .xuo-toc-list {
            padding: 6px;
        }

        .xuo-toc-item {
            width: 100%;
            min-height: 34px;
            border: 0;
            border-radius: 6px;
            background: transparent;
            color: inherit;
            cursor: pointer;
            display: flex;
            align-items: center;
            padding: 7px 9px;
            font: inherit;
            font-size: 13px;
            font-weight: 700;
            line-height: 1.35;
            text-align: left;
            transition: background 0.16s ease, color 0.16s ease;
        }

        .xuo-toc-item:hover,
        .xuo-toc-item.active {
            background: rgba(29, 155, 240, 0.1);
            color: #1d9bf0;
        }

        .xuo-toc-panel.xuo-dark .xuo-toc-item:hover,
        .xuo-toc-panel.xuo-dark .xuo-toc-item.active {
            background: rgba(29, 155, 240, 0.16);
            color: #1d9bf0;
        }

        .xuo-toc-item.level-2 {
            padding-left: 14px;
        }

        .xuo-toc-item.level-3 {
            padding-left: 24px;
            font-size: 12px;
            color: #536471;
        }

        .xuo-toc-panel.xuo-dark .xuo-toc-item.level-3 {
            color: #71767b;
        }

        .xuo-toc-text {
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        @media (max-width: 720px) {
            .xuo-scroll-nav-button,
            .xuo-toc-toggle,
            .xuo-toc-root {
                left: auto !important;
                right: 16px;
            }

            .xuo-scroll-top-button {
                bottom: 78px;
            }

            .xuo-scroll-bottom-button {
                bottom: 28px;
            }

            .xuo-toc-toggle,
            .xuo-toc-root {
                bottom: 128px;
            }

            .xuo-toc-panel {
                left: auto;
                right: 0;
                bottom: 50px;
                width: min(var(--xuo-toc-panel-width), calc(100vw - 32px));
                max-height: min(360px, calc(100vh - 174px));
                transform-origin: bottom right;
            }
        }

        .xuo-modal-overlay {
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
        .xuo-modal-overlay.xuo-dark {
            background: rgba(0, 0, 0, 0.72);
        }
        .xuo-modal-overlay.show {
            opacity: 1;
            pointer-events: auto;
        }

        .xuo-modal {
            background: #ffffff;
            border: 1px solid #cfd9de;
            border-radius: 16px;
            width: min(100%, 560px);
            max-height: min(720px, calc(100vh - 48px));
            max-height: min(720px, calc(100dvh - 48px));
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
        .xuo-modal-overlay.show .xuo-modal {
            transform: translateY(0) scale(1);
        }
        .xuo-modal-overlay.xuo-dark .xuo-modal {
            background: #000000;
            border-color: #2f3336;
            border-radius: 20px;
            color: #e7e9ea;
            box-shadow: 0 18px 70px rgba(0, 0, 0, 0.72);
        }
        .xuo-modal button,
        .xuo-modal input {
            font-family: inherit;
        }

        .xuo-modal-header {
            min-height: 66px;
            padding: 0 18px 0 22px;
            border-bottom: 1px solid #eff3f4;
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 16px;
            flex: 0 0 auto;
        }
        .xuo-modal-overlay.xuo-dark .xuo-modal-header {
            min-height: 72px;
            border-bottom-color: #2f3336;
        }
        .xuo-modal-title-group {
            min-width: 0;
        }
        .xuo-modal-title {
            display: flex;
            align-items: center;
            gap: 10px;
            font-size: 20px;
            font-weight: 800;
            margin: 0;
            letter-spacing: 0;
            line-height: 1.2;
        }
        .xuo-modal-title svg {
            width: 22px;
            height: 22px;
            color: #1d9bf0;
            flex: 0 0 auto;
        }
        .xuo-modal-close {
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
        .xuo-modal-close:hover {
            background: rgba(15, 20, 25, 0.1);
        }
        .xuo-modal-overlay.xuo-dark .xuo-modal-close {
            background: rgba(239, 243, 244, 0.08);
        }
        .xuo-modal-overlay.xuo-dark .xuo-modal-close:hover {
            background: rgba(239, 243, 244, 0.14);
        }
        .xuo-modal-close svg {
            width: 20px;
            height: 20px;
        }
        .xuo-modal-close:focus-visible,
        .xuo-btn:focus-visible,
        .xuo-btn-reset:focus-visible,
        .xuo-input:focus-visible,
        .xuo-toggle-input:focus-visible + .xuo-toggle-track {
            outline: 2px solid #1d9bf0;
            outline-offset: 2px;
        }

        .xuo-modal-body {
            padding: 18px 22px 20px;
            overflow-y: auto;
            flex: 1 1 auto;
            min-height: 0;
            box-sizing: border-box;
            display: flex;
            flex-direction: column;
            gap: 16px;
            overscroll-behavior: contain;
            scrollbar-width: thin;
            -webkit-overflow-scrolling: touch;
        }
        .xuo-field-row {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 12px;
        }
        .xuo-form-group {
            display: flex;
            flex-direction: column;
            gap: 8px;
            min-width: 0;
        }
        .xuo-form-label {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 8px;
            font-size: 13px;
            font-weight: 800;
            color: #536471;
            line-height: 1.35;
        }
        .xuo-modal-overlay.xuo-dark .xuo-form-label {
            color: #71767b;
        }
        .xuo-input {
            width: 100%;
            min-height: 46px;
            padding: 11px 13px;
            border-radius: 8px;
            border: 1px solid #cfd9de;
            background: #ffffff;
            color: inherit;
            font-size: 15px;
            line-height: 1.45;
            transition: border-color 0.16s ease, box-shadow 0.16s ease, background 0.16s ease;
            box-sizing: border-box;
        }
        .xuo-modal-overlay.xuo-dark .xuo-input {
            border-color: #333639;
            background: #000000;
        }
        .xuo-input:focus {
            outline: none;
            border-color: #1d9bf0;
            box-shadow: 0 0 0 1px #1d9bf0;
        }

        .xuo-toggle-row {
            min-height: 54px;
            padding: 10px 12px;
            border: 1px solid #e1e8ed;
            border-radius: 8px;
            background: #ffffff;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            box-sizing: border-box;
            cursor: pointer;
        }
        .xuo-modal-overlay.xuo-dark .xuo-toggle-row {
            border-color: #2f3336;
            background: #000000;
        }
        .xuo-toggle-copy {
            min-width: 0;
            display: flex;
            flex-direction: column;
            gap: 2px;
            color: #0f1419;
            font-size: 13px;
            font-weight: 750;
            line-height: 1.35;
        }
        .xuo-modal-overlay.xuo-dark .xuo-toggle-copy {
            color: #e7e9ea;
        }
        .xuo-toggle-copy small {
            color: #536471;
            font-size: 11px;
            font-weight: 500;
            line-height: 1.3;
        }
        .xuo-modal-overlay.xuo-dark .xuo-toggle-copy small {
            color: #71767b;
        }
        .xuo-toggle-control {
            position: relative;
            width: 42px;
            height: 24px;
            flex: 0 0 42px;
        }
        .xuo-toggle-input {
            position: absolute;
            inset: 0;
            width: 100%;
            height: 100%;
            margin: 0;
            opacity: 0;
            cursor: pointer;
        }
        .xuo-toggle-track {
            position: absolute;
            inset: 0;
            border-radius: 9999px;
            background: #cfd9de;
            transition: background 0.16s ease;
            pointer-events: none;
        }
        .xuo-toggle-track::after {
            content: '';
            position: absolute;
            top: 3px;
            left: 3px;
            width: 18px;
            height: 18px;
            border-radius: 50%;
            background: #ffffff;
            box-shadow: 0 1px 3px rgba(15, 20, 25, 0.24);
            transition: transform 0.16s ease;
        }
        .xuo-toggle-input:checked + .xuo-toggle-track {
            background: #1d9bf0;
        }
        .xuo-toggle-input:checked + .xuo-toggle-track::after {
            transform: translateX(18px);
        }

        .xuo-advanced-panel {
            flex: 0 0 auto;
            border-radius: 12px;
            border: 1px solid #eff3f4;
            background: #f7f9f9;
            overflow: hidden;
        }
        .xuo-modal-overlay.xuo-dark .xuo-advanced-panel {
            border-color: #2f3336;
            border-radius: 16px;
            background: #080808;
        }
        .xuo-advanced-title {
            padding: 16px 14px 0;
            min-width: 0;
            display: flex;
            flex-direction: column;
            gap: 2px;
            font-size: 16px;
            font-weight: 800;
        }
        .xuo-advanced-title small {
            color: #536471;
            font-size: 12px;
            line-height: 1.25;
            font-weight: 600;
        }
        .xuo-modal-overlay.xuo-dark .xuo-advanced-title small {
            color: #71767b;
        }
        .xuo-settings-grid {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 12px;
            padding: 14px;
        }

        .xuo-modal-footer {
            padding: 14px 22px 18px;
            border-top: 1px solid #eff3f4;
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 14px;
            flex: 0 0 auto;
            background: #ffffff;
        }
        .xuo-modal-overlay.xuo-dark .xuo-modal-footer {
            border-top-color: #2f3336;
            background: #000000;
        }
        .xuo-footer-note {
            color: #536471;
            font-size: 13px;
            line-height: 1.35;
        }
        .xuo-modal-overlay.xuo-dark .xuo-footer-note {
            color: #71767b;
        }
        .xuo-footer-actions {
            display: flex;
            align-items: center;
            gap: 10px;
            flex: 0 0 auto;
        }
        .xuo-btn {
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
        .xuo-btn svg {
            width: 17px;
            height: 17px;
        }
        .xuo-btn-cancel {
            background: #ffffff;
            color: #0f1419;
        }
        .xuo-btn-cancel:hover {
            background: rgba(15, 20, 25, 0.06);
        }
        .xuo-btn-save {
            background: #0f1419;
            color: #ffffff;
            border-color: #0f1419;
        }
        .xuo-btn-save:hover {
            background: #272c30;
            border-color: #272c30;
        }
        .xuo-modal-overlay.xuo-dark .xuo-btn-cancel {
            background: #000000;
            color: #e7e9ea;
            border-color: #536471;
        }
        .xuo-modal-overlay.xuo-dark .xuo-btn-cancel:hover {
            background: rgba(239, 243, 244, 0.08);
        }
        .xuo-modal-overlay.xuo-dark .xuo-btn-save {
            background: #eff3f4;
            color: #0f1419;
            border-color: #eff3f4;
        }
        .xuo-modal-overlay.xuo-dark .xuo-btn-save:hover {
            background: #d7dbdc;
            border-color: #d7dbdc;
        }
        .xuo-btn-reset {
            font-size: 12px;
            font-weight: 700;
            color: #1d9bf0;
            background: transparent;
            border: none;
            cursor: pointer;
            padding: 0;
        }
        .xuo-btn-reset:hover {
            text-decoration: underline;
        }

        .xuo-toast {
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
        .xuo-toast.show {
            transform: translateX(-50%) translateY(0);
        }
        .xuo-toast svg {
            width: 18px;
            height: 18px;
            flex: 0 0 auto;
        }
        .xuo-toast.xuo-dark {
            background: #eff3f4;
            color: #0f1419;
            box-shadow: 0 12px 30px rgba(0, 0, 0, 0.48);
        }

        @media (max-width: 640px) {
            .xuo-modal-overlay {
                align-items: flex-end;
                padding: 12px;
            }
            .xuo-modal,
            .xuo-modal-overlay.xuo-dark .xuo-modal {
                border-radius: 18px;
                max-height: calc(100vh - 24px);
                max-height: calc(100dvh - 24px);
            }
            .xuo-modal-header,
            .xuo-modal-body,
            .xuo-modal-footer {
                padding-left: 18px;
                padding-right: 18px;
            }
            .xuo-field-row,
            .xuo-settings-grid {
                grid-template-columns: 1fr;
            }
            .xuo-footer-note {
                display: none;
            }
            .xuo-footer-actions {
                width: 100%;
            }
            .xuo-modal-footer {
                flex-direction: column;
                align-items: stretch;
                gap: 8px;
            }
            .xuo-btn-reset {
                align-self: flex-start;
                min-height: 24px;
                white-space: nowrap;
            }
            .xuo-btn {
                flex: 1 1 0;
                min-width: 0;
            }
        }
    `);

    let currentSettings = loadSettings();
    let scrollTopButton = null;
    let scrollBottomButton = null;
    let tocRoot = null;
    let tocToggle = null;
    let tocPanel = null;
    let tocList = null;
    let modalOverlay = null;
    let toastEl = null;
    let restoreSettingsPageScroll = null;
    let scrollUpdateFrame = null;
    let layoutUpdateFrame = null;
    let scrollAnimationFrame = null;
    let restoreScrollStyles = null;
    let tocItems = [];
    let lastTocSignature = '';
    let lastUrl = location.href;

    function isArticlePage() {
        return Boolean(document.querySelector('[data-testid="twitterArticleReadView"]'))
            || /\/(?:[^/]+\/article|i\/articles?)\/\d+/.test(location.pathname);
    }

    function isPostDetailPage() {
        return /^\/(?:i\/status|[^/]+\/status)\/\d+(?:\/(?:photo|video)\/\d+)?\/?$/.test(location.pathname);
    }

    function isTimelinePage() {
        const primaryColumn = document.querySelector('[data-testid="primaryColumn"]');
        return Boolean(primaryColumn?.querySelector('section[role="region"] [data-testid="tweet"]'));
    }

    function getScrollNavigationMode() {
        if (isArticlePage() || isPostDetailPage()) return 'detail';
        if (isTimelinePage()) return 'timeline';
        return 'hidden';
    }

    // 跟随 X 当前主题，保证浮动按钮、目录面板和设置弹窗在明暗模式下都可读。
    function isDarkTheme() {
        const bodyBg = window.getComputedStyle(document.body).backgroundColor;
        if (bodyBg) {
            const rgb = bodyBg.match(/\d+/g);
            if (rgb && rgb.length >= 3) {
                const r = parseInt(rgb[0], 10);
                const g = parseInt(rgb[1], 10);
                const b = parseInt(rgb[2], 10);
                const brightness = (r * 299 + g * 587 + b * 114) / 1000;
                return brightness < 120;
            }
        }
        return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    }

    function isLayoutExcludedPage() {
        return LAYOUT_EXCLUDED_PATHS.some(path => (
            location.pathname === path || location.pathname.startsWith(`${path}/`)
        ));
    }

    function applyRootStateClasses() {
        const root = document.documentElement;
        const allowLayoutChanges = !isLayoutExcludedPage();
        const fillCenter = allowLayoutChanges && currentSettings.fillCenter;

        root.classList.toggle('xuo-hide-left-navigation', allowLayoutChanges && (currentSettings.hideLeftNavigation || fillCenter));
        root.classList.toggle('xuo-hide-right-sidebar', allowLayoutChanges && (currentSettings.hideRightSidebar || fillCenter));
        root.classList.toggle('xuo-fill-center', fillCenter);
        root.classList.toggle('xuo-hide-chat-drawer', currentSettings.hideChatDrawer);
        root.classList.toggle('xuo-hide-grok-drawer', currentSettings.hideGrokDrawer);
        root.classList.remove('xuo-hide-premium-upsells');
    }

    function syncCleanupElements(key, elements) {
        const stateClass = `xuo-cleanup-${key}`;
        const nextElements = new Set(elements.filter(Boolean));

        document.querySelectorAll(`.${stateClass}`).forEach(element => {
            if (nextElements.has(element)) return;
            element.classList.remove(stateClass);
            const hasOtherCleanupState = Array.from(element.classList).some(className => (
                className.startsWith('xuo-cleanup-') && className !== 'xuo-cleanup-hidden'
            ));
            if (!hasOtherCleanupState) element.classList.remove('xuo-cleanup-hidden');
        });

        nextElements.forEach(element => {
            element.classList.add('xuo-cleanup-hidden', stateClass);
        });
    }

    function getElementPath(element) {
        const link = element.matches?.('a[href]') ? element : element.querySelector?.('a[href]');
        const href = link?.getAttribute('href');
        if (!href) return '';
        try {
            return new URL(href, location.origin).pathname.replace(/\/$/, '') || '/';
        } catch (error) {
            return '';
        }
    }

    function matchesNavigationRule(element, rule) {
        const path = getElementPath(element);
        if (path && rule.paths.some(candidate => path === candidate || path.startsWith(`${candidate}/`))) {
            return true;
        }
        const label = normalizeText(element.innerText || element.textContent);
        return Boolean(label) && rule.labels.includes(label);
    }

    function updateNavigationCleanup() {
        const candidates = Array.from(document.querySelectorAll(
            'header[role="banner"] a[href], header[role="banner"] [role="link"], [role="menu"] a[href], [role="menu"] [role="menuitem"]'
        ));

        NAVIGATION_CLEANUP_RULES.forEach(rule => {
            const matches = currentSettings[rule.key]
                ? candidates.filter(element => matchesNavigationRule(element, rule))
                : [];
            syncCleanupElements(rule.key, matches);
        });
    }

    function getFooterCleanupTarget(footer) {
        const wrapper = footer.parentElement;
        return wrapper && wrapper.children.length === 1 && wrapper.firstElementChild === footer
            ? wrapper
            : footer;
    }

    function updateFooterCleanup() {
        const footers = currentSettings.hideFooter
            ? [
                ...Array.from(document.querySelectorAll('nav[role="navigation"][aria-label]')).filter(element => (
                    FOOTER_LABELS.includes(normalizeText(element.getAttribute('aria-label')))
                )).map(getFooterCleanupTarget),
                ...document.querySelectorAll('[data-testid="sidebarColumn"] [data-testid="whoToFollowSspAd"]')
            ]
            : [];
        syncCleanupElements('hideFooter', footers);
    }

    function hasVisiblePromotedPostLabel(cell) {
        if (!cell) return false;

        const tweet = cell.querySelector?.('[data-testid="tweet"]')
            || cell.closest?.('[data-testid="tweet"]');
        if (!tweet) return false;

        // placementTracking 也包裹普通视频；必须同时有明确的、非正文推广标签。
        return Array.from(tweet.querySelectorAll('span, div, a')).some(element => (
            !element.closest('[data-testid="tweetText"], [data-testid="newTweetText"]')
            && PROMOTED_POST_LABELS.includes(normalizeText(element.textContent))
            && isVisible(element)
        ));
    }

    function updatePromotedPostsCleanup() {
        const promotedCells = currentSettings.hidePromotedPosts
            ? Array.from(document.querySelectorAll('[data-testid="placementTracking"]')).map(marker => (
                marker.closest('[data-testid="cellInnerDiv"]')
                    || marker.closest('[data-testid="tweet"]')
            )).filter(cell => hasVisiblePromotedPostLabel(cell))
            : [];
        syncCleanupElements('hidePromotedPosts', promotedCells);
    }

    function clearDiscoverMoreListMarks() {
        document.querySelectorAll('.xuo-discover-more-list').forEach(element => {
            element.classList.remove('xuo-discover-more-list');
            element.style.removeProperty('--xuo-discover-more-height');
        });
    }

    function getVirtualCellOffset(element) {
        const match = element.style.transform.match(/translateY\((-?[\d.]+)px\)/);
        return match ? Number.parseFloat(match[1]) : NaN;
    }

    function updateDiscoverMoreCleanup() {
        if (!currentSettings.hideDiscoverMore || !isPostDetailPage()) {
            syncCleanupElements('hideDiscoverMore', []);
            clearDiscoverMoreListMarks();
            return;
        }

        const headingCells = Array.from(document.querySelectorAll('main h2')).filter(element => (
            DISCOVER_MORE_LABELS.includes(normalizeText(element.textContent))
        )).map(element => element.closest('[data-testid="cellInnerDiv"]')).filter(Boolean);

        // X 使用绝对定位虚拟列表；仅 display:none 不会缩短其预留高度。
        if (!headingCells.length) return;

        const activeLists = new Set();
        const discoverMoreCells = [];
        headingCells.forEach(headingCell => {
            const list = headingCell.parentElement;
            const sectionOffset = getVirtualCellOffset(headingCell);
            if (!list || !Number.isFinite(sectionOffset)) {
                discoverMoreCells.push(headingCell);
                return;
            }

            activeLists.add(list);
            list.classList.add('xuo-discover-more-list');
            list.style.setProperty('--xuo-discover-more-height', `${Math.max(0, sectionOffset)}px`);
            Array.from(list.children).forEach(cell => {
                const cellOffset = getVirtualCellOffset(cell);
                if (Number.isFinite(cellOffset) && cellOffset >= sectionOffset) {
                    discoverMoreCells.push(cell);
                }
            });
        });

        document.querySelectorAll('.xuo-discover-more-list').forEach(element => {
            if (activeLists.has(element)) return;
            element.classList.remove('xuo-discover-more-list');
            element.style.removeProperty('--xuo-discover-more-height');
        });
        syncCleanupElements('hideDiscoverMore', discoverMoreCells);
    }

    function getSidebarCard(element, sidebar) {
        let current = element;
        while (current && current !== sidebar) {
            const styles = window.getComputedStyle(current);
            if (Number.parseFloat(styles.borderTopWidth) > 0 && Number.parseFloat(styles.borderRadius) > 0) {
                return current;
            }
            current = current.parentElement;
        }
        return element;
    }

    function updateSidebarModulesCleanup() {
        const sidebar = document.querySelector('[data-testid="sidebarColumn"]');
        const complementaryRegions = sidebar
            ? Array.from(sidebar.querySelectorAll('aside[role="complementary"]'))
            : [];
        const premiumUpsells = currentSettings.hidePremiumUpsells
            ? complementaryRegions.filter(element => {
                const label = normalizeText(element.getAttribute('aria-label'));
                if (PREMIUM_UPSELL_LABELS.includes(label)) return true;
                return Array.from(element.querySelectorAll('a[href]')).some(link => (
                    getElementPath(link).startsWith('/i/premium')
                ));
            }).map(element => getSidebarCard(element, sidebar))
            : [];
        const trends = currentSettings.hideTrends && sidebar
            ? Array.from(sidebar.querySelectorAll('[data-testid="trend"]')).map(element => (
                getSidebarCard(element.closest('section[role="region"]'), sidebar)
            ))
            : [];
        const whoToFollow = currentSettings.hideWhoToFollow && sidebar
            ? [
                ...Array.from(sidebar.querySelectorAll('[data-testid="UserCell"]')).map(element => (
                    getSidebarCard(element.closest('aside[role="complementary"]'), sidebar)
                )),
                ...sidebar.querySelectorAll('[data-testid="whoToFollowSspAd"]')
            ]
            : [];

        syncCleanupElements('hidePremiumUpsells', premiumUpsells);
        syncCleanupElements('hideTrends', trends);
        syncCleanupElements('hideWhoToFollow', whoToFollow);
    }

    function updateCleanupTargets() {
        updateNavigationCleanup();
        updateFooterCleanup();
        updatePromotedPostsCleanup();
        updateDiscoverMoreCleanup();
        updateSidebarModulesCleanup();
    }

    // 将设置写入 CSS 变量和状态 class，保持页面布局及清理开关即时更新。
    function applySettingsToDocument() {
        const rootStyle = document.documentElement.style;
        rootStyle.setProperty('--xuo-timeline-width', `${currentSettings.timelineWidth}px`);
        rootStyle.setProperty('--xuo-article-width', `${currentSettings.articleWidth}px`);
        rootStyle.setProperty('--xuo-toc-panel-width', `${currentSettings.tocPanelWidth}px`);
        rootStyle.setProperty('--xuo-toc-panel-offset-x', `${currentSettings.tocPanelOffsetX}px`);
        applyRootStateClasses();
        updateCleanupTargets();
        updatePageLayoutWidths();
        scheduleScrollUpdate();
    }

    function isVisible(element) {
        if (!element) return false;
        const rect = element.getBoundingClientRect();
        const styles = window.getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && styles.display !== 'none' && styles.visibility !== 'hidden';
    }

    function getOuterWidth(element) {
        const rect = element.getBoundingClientRect();
        const styles = window.getComputedStyle(element);
        return rect.width + Number.parseFloat(styles.marginLeft || '0') + Number.parseFloat(styles.marginRight || '0');
    }

    function clearTimelineLayout() {
        document.documentElement.classList.remove('xuo-layout-active');
        document.querySelectorAll('[data-testid="primaryColumn"].xuo-primary-layout').forEach(column => {
            column.classList.remove('xuo-primary-layout', 'xuo-primary-standalone');
            column.style.removeProperty('--xuo-effective-timeline-width');
        });
        document.querySelectorAll('.xuo-timeline-shell').forEach(element => {
            element.classList.remove('xuo-timeline-shell', 'xuo-timeline-shell-root', 'xuo-timeline-standalone');
        });
        document.querySelectorAll('.xuo-timeline-content-shell').forEach(element => {
            element.classList.remove('xuo-timeline-content-shell');
        });
        document.querySelectorAll('main.xuo-main-layout').forEach(main => {
            main.classList.remove('xuo-main-layout');
            main.style.removeProperty('--xuo-effective-layout-width');
        });
    }

    function updatePrimaryColumnWidth() {
        const primaryColumn = document.querySelector('[data-testid="primaryColumn"]');
        document.querySelectorAll('[data-testid="primaryColumn"].xuo-primary-layout').forEach(column => {
            if (column !== primaryColumn) {
                column.classList.remove('xuo-primary-layout', 'xuo-primary-standalone');
                column.style.removeProperty('--xuo-effective-timeline-width');
            }
        });
        if (isLayoutExcludedPage() || !primaryColumn || !isVisible(primaryColumn) || !primaryColumn.parentElement) {
            clearTimelineLayout();
            return;
        }

        const row = primaryColumn.parentElement;
        const main = primaryColumn.closest('main');
        if (!main || !main.contains(row)) {
            clearTimelineLayout();
            return;
        }

        const shells = [];
        let shell = row;
        while (shell && shell !== main) {
            shells.push(shell);
            shell = shell.parentElement;
        }
        if (!shells.length || shell !== main) {
            clearTimelineLayout();
            return;
        }

        document.documentElement.classList.add('xuo-layout-active');

        const activeShells = new Set(shells);
        document.querySelectorAll('.xuo-timeline-shell').forEach(element => {
            if (activeShells.has(element)) return;
            element.classList.remove('xuo-timeline-shell', 'xuo-timeline-shell-root', 'xuo-timeline-standalone');
        });
        document.querySelectorAll('main.xuo-main-layout').forEach(element => {
            if (element === main) return;
            element.classList.remove('xuo-main-layout');
            element.style.removeProperty('--xuo-effective-layout-width');
        });

        shells.forEach(element => element.classList.add('xuo-timeline-shell'));
        const shellRoot = shells[shells.length - 1];
        document.querySelectorAll('.xuo-timeline-shell-root').forEach(element => {
            if (element !== shellRoot) element.classList.remove('xuo-timeline-shell-root', 'xuo-timeline-standalone');
        });
        shellRoot.classList.add('xuo-timeline-shell-root');
        main.classList.add('xuo-main-layout');

        const sidebar = Array.from(row.children).find(element => element.matches?.('[data-testid="sidebarColumn"]'));
        const hasSidebar = !currentSettings.fillCenter && !currentSettings.hideRightSidebar && isVisible(sidebar);
        const mainWidth = Math.max(1, Math.floor(main.getBoundingClientRect().width));
        const sidebarSpace = hasSidebar ? getOuterWidth(sidebar) + TIMELINE_SIDEBAR_GAP : 0;
        const requestedTimelineWidth = currentSettings.fillCenter ? mainWidth : currentSettings.timelineWidth;
        const requestedLayoutWidth = requestedTimelineWidth + sidebarSpace;
        const effectiveLayoutWidth = Math.max(1, Math.min(mainWidth, Math.floor(requestedLayoutWidth)));
        const effectiveTimelineWidth = Math.max(
            1,
            Math.min(requestedTimelineWidth, Math.floor(effectiveLayoutWidth - sidebarSpace))
        );

        primaryColumn.classList.add('xuo-primary-layout');
        primaryColumn.classList.toggle('xuo-primary-standalone', !hasSidebar);
        shellRoot.classList.toggle('xuo-timeline-standalone', !hasSidebar);
        main.style.setProperty('--xuo-effective-layout-width', `${effectiveLayoutWidth}px`);
        primaryColumn.style.setProperty('--xuo-effective-timeline-width', `${effectiveTimelineWidth}px`);

        const activeContentShells = new Set(
            Array.from(primaryColumn.querySelectorAll('section[role="region"]'))
                .map(region => region.parentElement)
                .filter(element => element && primaryColumn.contains(element))
        );
        document.querySelectorAll('.xuo-timeline-content-shell').forEach(element => {
            if (!activeContentShells.has(element)) element.classList.remove('xuo-timeline-content-shell');
        });
        activeContentShells.forEach(element => element.classList.add('xuo-timeline-content-shell'));
    }

    function updatePageLayoutWidths() {
        updatePrimaryColumnWidth();
    }

    function getPageScrollTop() {
        const scrollingElement = document.scrollingElement || document.documentElement;
        return window.scrollY || scrollingElement?.scrollTop || 0;
    }

    function getPageMaxScrollTop() {
        const scrollingElement = document.scrollingElement || document.documentElement;
        const body = document.body;
        const documentHeight = Math.max(
            scrollingElement?.scrollHeight || 0,
            document.documentElement?.scrollHeight || 0,
            body?.scrollHeight || 0
        );
        const viewportHeight = window.innerHeight || scrollingElement?.clientHeight || document.documentElement.clientHeight || 0;
        return Math.max(0, documentHeight - viewportHeight);
    }

    function setPageScrollTop(top) {
        const scrollingElement = document.scrollingElement || document.documentElement;
        const nextTop = Math.min(getPageMaxScrollTop(), Math.max(0, top));
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

    function getScrollDuration(distance) {
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

    function stopScrollAnimation() {
        if (scrollAnimationFrame) {
            cancelAnimationFrame(scrollAnimationFrame);
            scrollAnimationFrame = null;
        }
        if (restoreScrollStyles) {
            restoreScrollStyles();
            restoreScrollStyles = null;
        }
    }

    function scrollTimelineTo(targetTopGetter) {
        stopScrollAnimation();

        const startTop = getPageScrollTop();
        const getTargetTop = () => Math.max(0, targetTopGetter());
        const startTargetTop = getTargetTop();
        const distance = Math.abs(startTargetTop - startTop);

        if (distance <= 2) {
            setPageScrollTop(startTargetTop);
            scheduleScrollUpdate();
            return;
        }

        restoreScrollStyles = disableNativeScrollBehavior();
        const duration = getScrollDuration(distance);
        const startedAt = performance.now();

        const finish = () => {
            setPageScrollTop(getTargetTop());
            stopScrollAnimation();
            scheduleScrollUpdate();
        };

        const animate = (now) => {
            const progress = Math.min(1, (now - startedAt) / duration);
            const targetTop = getTargetTop();
            const nextTop = startTop + (targetTop - startTop) * easeInOutCubic(progress);
            setPageScrollTop(nextTop);

            if (progress >= 1) {
                finish();
                return;
            }

            scrollAnimationFrame = requestAnimationFrame(animate);
        };

        scrollAnimationFrame = requestAnimationFrame(animate);
    }

    function createIconButton(className, label, iconSvg, onClick) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = className;
        button.title = label;
        button.setAttribute('aria-label', label);
        button.innerHTML = iconSvg;
        button.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            onClick(event);
        });
        return button;
    }

    function initFloatingControls() {
        if (scrollTopButton || scrollBottomButton || tocRoot) return;

        // 浮动控件保持一组：目录按钮、回到顶部、回到底部。
        scrollTopButton = createIconButton(
            'xuo-scroll-nav-button xuo-scroll-top-button',
            '回到顶部',
            SCROLL_TOP_ICON_SVG,
            () => scrollTimelineTo(() => 0)
        );
        scrollBottomButton = createIconButton(
            'xuo-scroll-nav-button xuo-scroll-bottom-button',
            '回到底部',
            SCROLL_BOTTOM_ICON_SVG,
            () => scrollTimelineTo(() => getPageMaxScrollTop())
        );

        tocRoot = document.createElement('div');
        tocRoot.className = 'xuo-toc-root';
        tocToggle = createIconButton(
            'xuo-toc-toggle',
            '文章目录',
            TOC_ICON_SVG,
            () => {
                tocRoot.classList.toggle('open');
                tocToggle.setAttribute('aria-expanded', String(tocRoot.classList.contains('open')));
            }
        );
        tocToggle.setAttribute('aria-expanded', 'false');

        tocPanel = document.createElement('div');
        tocPanel.className = 'xuo-toc-panel';
        tocPanel.innerHTML = '<div class="xuo-toc-heading">文章目录</div><div class="xuo-toc-list"></div>';
        tocList = tocPanel.querySelector('.xuo-toc-list');
        tocRoot.append(tocToggle, tocPanel);

        document.body.append(scrollTopButton, scrollBottomButton, tocRoot);
        document.addEventListener('click', closeTocOnOutsideClick, true);
        document.addEventListener('keydown', closeTocOnEscape, true);
        window.addEventListener('scroll', scheduleScrollUpdate, { passive: true });
        window.addEventListener('resize', scheduleFullUpdate, { passive: true });
    }

    function closeTocOnOutsideClick(event) {
        if (!tocRoot || !tocRoot.classList.contains('open')) return;
        if (tocRoot.contains(event.target)) return;
        closeToc();
    }

    function closeTocOnEscape(event) {
        if (event.key !== 'Escape') return;
        closeToc();
    }

    function closeToc() {
        if (!tocRoot) return;
        tocRoot.classList.remove('open');
        if (tocToggle) tocToggle.setAttribute('aria-expanded', 'false');
    }

    function getFloatingControls() {
        return [scrollTopButton, scrollBottomButton, tocRoot, tocToggle].filter(Boolean);
    }

    function getFloatingAnchor() {
        if (isArticlePage()) {
            return document.querySelector('[data-testid="twitterArticleReadView"]')
                || document.querySelector('.xuo-article-width')
                || document.querySelector('main');
        }
        return document.querySelector('[data-testid="primaryColumn"]')
            || document.querySelector('main');
    }

    function updateFloatingPosition() {
        const controls = getFloatingControls();
        if (!controls.length) return;

        // 桌面端根据正文容器右边缘定位；小屏幕固定贴右，避免遮挡正文。
        if (window.innerWidth <= 720) {
            controls.forEach(control => {
                control.style.removeProperty('--xuo-floating-left');
                control.style.removeProperty('--xuo-floating-right');
            });
            updateTocPanelPosition();
            return;
        }

        const anchor = getFloatingAnchor();
        if (!anchor) return;

        const rect = anchor.getBoundingClientRect();
        if (!rect.width || !rect.height) return;

        const buttonWidth = 42;
        const gap = currentSettings.floatingGap;
        const left = Math.min(window.innerWidth - buttonWidth - gap, Math.max(gap, rect.right + gap));
        controls.forEach(control => {
            control.style.setProperty('--xuo-floating-left', `${left}px`);
            control.style.setProperty('--xuo-floating-right', 'auto');
        });
        updateTocPanelPosition();
    }

    function updateTocPanelPosition() {
        if (!tocRoot) return;

        if (window.innerWidth <= 720) {
            tocRoot.style.removeProperty('--xuo-toc-panel-left');
            tocRoot.style.removeProperty('--xuo-toc-panel-transform-origin');
            return;
        }

        const rootRect = tocRoot.getBoundingClientRect();
        if (!rootRect.width) return;

        const panelWidth = Math.min(
            currentSettings.tocPanelWidth,
            Math.max(0, window.innerWidth - VIEWPORT_EDGE_GAP * 2)
        );
        const requestedLeft = rootRect.left + currentSettings.tocPanelOffsetX;
        const maxLeft = Math.max(VIEWPORT_EDGE_GAP, window.innerWidth - panelWidth - VIEWPORT_EDGE_GAP);
        const panelLeft = Math.min(maxLeft, Math.max(VIEWPORT_EDGE_GAP, requestedLeft));
        const opensRight = panelLeft >= rootRect.left + rootRect.width / 2;

        tocRoot.style.setProperty('--xuo-toc-panel-left', `${Math.round(panelLeft - rootRect.left)}px`);
        tocRoot.style.setProperty('--xuo-toc-panel-transform-origin', opensRight ? 'bottom left' : 'bottom right');
    }

    function updateFloatingVisibility() {
        const scrollTop = getPageScrollTop();
        const maxScrollTop = getPageMaxScrollTop();
        const distanceToBottom = Math.max(0, maxScrollTop - scrollTop);
        const visibilityOffset = currentSettings.scrollVisibilityOffset;
        const hasScrollablePage = maxScrollTop > visibilityOffset;
        const scrollNavigationMode = getScrollNavigationMode();
        const darkTheme = isDarkTheme();

        if (scrollTopButton) {
            scrollTopButton.classList.toggle(
                'show',
                scrollNavigationMode !== 'hidden' && hasScrollablePage && scrollTop > visibilityOffset
            );
            scrollTopButton.classList.toggle('xuo-dark', darkTheme);
        }

        if (scrollBottomButton) {
            scrollBottomButton.classList.toggle(
                'show',
                scrollNavigationMode === 'detail' && hasScrollablePage && distanceToBottom > visibilityOffset
            );
            scrollBottomButton.classList.toggle('xuo-dark', darkTheme);
        }

        if (tocRoot) {
            tocRoot.classList.toggle('show', isArticlePage() && tocItems.length > 1);
        }
        if (tocToggle) tocToggle.classList.toggle('xuo-dark', darkTheme);
        if (tocPanel) tocPanel.classList.toggle('xuo-dark', darkTheme);
    }

    function updateActiveTocItem() {
        if (!tocItems.length || !tocList) return;

        let activeItem = tocItems[0];
        for (const item of tocItems) {
            const rect = item.element.getBoundingClientRect();
            if (rect.top <= 130) activeItem = item;
            else break;
        }

        tocList.querySelectorAll('.xuo-toc-item').forEach(button => {
            button.classList.toggle('active', button.dataset.tocId === activeItem.id);
        });
    }

    function scheduleScrollUpdate() {
        if (scrollUpdateFrame) return;

        scrollUpdateFrame = requestAnimationFrame(() => {
            scrollUpdateFrame = null;
            updateFloatingPosition();
            updateFloatingVisibility();
            updateActiveTocItem();
        });
    }

    function scheduleFullUpdate() {
        if (layoutUpdateFrame) return;

        layoutUpdateFrame = requestAnimationFrame(() => {
            layoutUpdateFrame = null;
            const routeChanged = handleRouteChange();
            applyRootStateClasses();
            updateCleanupTargets();
            updatePageLayoutWidths();
            if (routeChanged) {
                requestAnimationFrame(scheduleFullUpdate);
                scheduleScrollUpdate();
                return;
            }
            markArticleLayout();
            renderArticleToc();
            scheduleScrollUpdate();
        });
    }

    function clearArticleMarks() {
        document.documentElement.classList.remove('xuo-article-page');
        document.querySelectorAll('.xuo-article-width, .xuo-article-shell, .xuo-article-read-view, .xuo-article-rich-text, .xuo-article-rich-content, .xuo-article-metrics').forEach(element => {
            element.classList.remove('xuo-article-width', 'xuo-article-shell', 'xuo-article-read-view', 'xuo-article-rich-text', 'xuo-article-rich-content', 'xuo-article-metrics');
        });
    }

    function markArticleLayout() {
        if (!isArticlePage()) {
            clearArticleMarks();
            return;
        }

        // X 文章页没有时间线的 primaryColumn，需要给长文容器补稳定 class 才能套宽度。
        document.documentElement.classList.add('xuo-article-page');

        const readView = document.querySelector('[data-testid="twitterArticleReadView"]');
        if (readView) {
            readView.classList.add('xuo-article-read-view', 'xuo-article-width');
            let node = readView.parentElement;
            while (node && node.tagName !== 'MAIN' && !node.matches?.('[data-testid="primaryColumn"]')) {
                node.classList.add('xuo-article-shell');
                node = node.parentElement;
            }

            const richTextView = readView.querySelector('[data-testid="twitterArticleRichTextView"]');
            const metrics = Array.from(readView.querySelectorAll('[role="group"][aria-label]')).find(element => (
                !element.closest('[data-testid="tweet"]')
                && !(richTextView && richTextView.contains(element))
            ));
            if (metrics) metrics.classList.add('xuo-article-metrics');
        }

        const richText = document.querySelector('[data-testid="twitterArticleRichTextView"]');
        if (richText) richText.classList.add('xuo-article-rich-text');

        const richContent = document.querySelector('[data-testid="longformRichTextComponent"]');
        if (richContent) richContent.classList.add('xuo-article-rich-content');
    }

    function getHeadingLevel(element) {
        const className = String(element.className || '');
        if (className.includes('longform-header-one') || element.tagName === 'H1') return 1;
        if (className.includes('longform-header-three') || element.tagName === 'H3') return 3;
        return 2;
    }

    function normalizeText(value) {
        return String(value || '').replace(/\s+/g, ' ').trim();
    }

    function hashText(value) {
        let hash = 0;
        for (let i = 0; i < value.length; i += 1) {
            hash = ((hash << 5) - hash + value.charCodeAt(i)) | 0;
        }
        return Math.abs(hash).toString(36);
    }

    function collectArticleHeadings() {
        if (!isArticlePage()) return [];

        // 目录只在 /article/ 页面提取，直接读取长文编辑器渲染出的标题节点。
        const root = document.querySelector('[data-testid="longformRichTextComponent"]')
            || document.querySelector('[data-testid="twitterArticleRichTextView"]')
            || document.querySelector('main');
        if (!root) return [];

        const seen = new Set();
        return Array.from(root.querySelectorAll('.longform-header-one, .longform-header-two, .longform-header-three, h1, h2, h3'))
            .map((element, index) => {
                const text = normalizeText(element.innerText || element.textContent);
                if (!text) return null;
                const rect = element.getBoundingClientRect();
                if (rect.width <= 0 && rect.height <= 0) return null;
                const key = `${getHeadingLevel(element)}:${text}`;
                if (seen.has(key)) return null;
                seen.add(key);
                const id = element.dataset.xuoTocId || `xuo-heading-${index}-${hashText(text)}`;
                element.dataset.xuoTocId = id;
                return {
                    id,
                    text,
                    level: getHeadingLevel(element),
                    element
                };
            })
            .filter(Boolean);
    }

    function renderArticleToc() {
        if (!tocRoot || !tocList) return;

        const nextItems = collectArticleHeadings();
        const signature = isArticlePage()
            ? `${location.pathname}|${nextItems.map(item => `${item.level}:${item.text}`).join('|')}`
            : '';

        tocItems = nextItems;
        if (signature === lastTocSignature) {
            updateFloatingVisibility();
            updateActiveTocItem();
            return;
        }

        lastTocSignature = signature;
        tocList.textContent = '';

        if (!isArticlePage() || tocItems.length <= 1) {
            closeToc();
            updateFloatingVisibility();
            return;
        }

        tocItems.forEach(item => {
            const button = document.createElement('button');
            const text = document.createElement('span');
            button.type = 'button';
            button.className = `xuo-toc-item level-${item.level}`;
            button.dataset.tocId = item.id;
            button.title = item.text;
            text.className = 'xuo-toc-text';
            text.textContent = item.text;
            button.appendChild(text);
            button.addEventListener('click', () => {
                item.element.scrollIntoView({ behavior: 'smooth', block: 'start' });
                closeToc();
                setTimeout(scheduleScrollUpdate, 320);
            });
            tocList.appendChild(button);
        });

        updateFloatingVisibility();
        updateActiveTocItem();
    }

    function handleRouteChange() {
        if (location.href === lastUrl) return false;

        lastUrl = location.href;
        lastTocSignature = '';
        tocItems = [];
        closeToc();
        // 路由切换时，旧文章页的容器可能会被 X 复用到 status 页面；先彻底去标记，下一帧再按新 DOM 标记。
        clearArticleMarks();
        clearDiscoverMoreListMarks();
        return true;
    }

    function lockSettingsPageScroll() {
        if (restoreSettingsPageScroll) return;

        const html = document.documentElement;
        const body = document.body;
        const scrollTop = getPageScrollTop();
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
        if (restoreSettingsPageScroll) restoreSettingsPageScroll();
    }

    function settingInput(id, label, key) {
        const limits = SETTING_LIMITS[key];
        return `
            <div class="xuo-form-group">
                <label class="xuo-form-label" for="${id}">${escapeHtml(label)}</label>
                <input
                    type="number"
                    id="${id}"
                    class="xuo-input"
                    min="${limits.min}"
                    max="${limits.max}"
                    step="1"
                    value="${currentSettings[key]}"
                    data-setting-key="${key}"
                >
            </div>
        `;
    }

    function settingToggle(id, label, key, description = '') {
        return `
            <label class="xuo-toggle-row" for="${id}">
                <span class="xuo-toggle-copy">
                    <span>${escapeHtml(label)}</span>
                    ${description ? `<small>${escapeHtml(description)}</small>` : ''}
                </span>
                <span class="xuo-toggle-control">
                    <input
                        type="checkbox"
                        role="switch"
                        id="${id}"
                        class="xuo-toggle-input"
                        data-setting-key="${key}"
                        ${currentSettings[key] ? 'checked' : ''}
                    >
                    <span class="xuo-toggle-track" aria-hidden="true"></span>
                </span>
            </label>
        `;
    }

    // 设置面板复用翻译脚本的弹窗语言：顶部标题、分组面板、底部保存按钮。
    function createSettingsModal() {
        if (modalOverlay) return;

        modalOverlay = document.createElement('div');
        modalOverlay.className = 'xuo-modal-overlay';
        modalOverlay.innerHTML = `
            <div class="xuo-modal" role="dialog" aria-modal="true" aria-labelledby="xuo-settings-title">
                <div class="xuo-modal-header">
                    <div class="xuo-modal-title-group">
                        <h3 class="xuo-modal-title" id="xuo-settings-title">${TOC_ICON_SVG}<span>页面优化设置</span></h3>
                    </div>
                    <button class="xuo-modal-close" id="xuo-close-btn" type="button" aria-label="关闭设置">${CLOSE_ICON_SVG}</button>
                </div>

                <div class="xuo-modal-body">
                    <div class="xuo-advanced-panel">
                        <div class="xuo-advanced-title">
                            <span>布局宽度</span>
                            <small>最大宽度会按页面可用空间自动收缩</small>
                        </div>
                        <div class="xuo-settings-grid">
                            ${settingInput('xuo-timeline-width', '时间线最大宽度（px）', 'timelineWidth')}
                            ${settingInput('xuo-article-width', '文章最大宽度（px）', 'articleWidth')}
                        </div>
                    </div>

                    <div class="xuo-advanced-panel">
                        <div class="xuo-advanced-title">
                            <span>沉浸布局</span>
                            <small>左右区域与时间线填满模式</small>
                        </div>
                        <div class="xuo-settings-grid">
                            ${settingToggle('xuo-hide-left-navigation', '隐藏左侧导航栏', 'hideLeftNavigation')}
                            ${settingToggle('xuo-hide-right-sidebar', '隐藏右侧栏', 'hideRightSidebar')}
                            ${settingToggle('xuo-fill-center', '中栏填满', 'fillCenter', '临时隐藏左右栏并使用全部可用宽度')}
                        </div>
                    </div>

                    <div class="xuo-advanced-panel">
                        <div class="xuo-advanced-title">
                            <span>导航入口</span>
                            <small>每个左侧导航项都可独立隐藏</small>
                        </div>
                        <div class="xuo-settings-grid">
                            ${settingToggle('xuo-hide-nav-bookmarks', '书签', 'hideNavBookmarks')}
                            ${settingToggle('xuo-hide-nav-jobs', '工作', 'hideNavJobs')}
                            ${settingToggle('xuo-hide-nav-creator-studio', '创作者工作室', 'hideNavCreatorStudio')}
                            ${settingToggle('xuo-hide-nav-communities', '社群', 'hideNavCommunities')}
                            ${settingToggle('xuo-hide-nav-business', '商业', 'hideNavBusiness')}
                            ${settingToggle('xuo-hide-nav-premium', 'Premium', 'hideNavPremium')}
                            ${settingToggle('xuo-hide-nav-verified-organizations', '认证组织', 'hideNavVerifiedOrganizations')}
                            ${settingToggle('xuo-hide-nav-monetization', '营利', 'hideNavMonetization')}
                            ${settingToggle('xuo-hide-nav-ads', '广告入口', 'hideNavAds')}
                        </div>
                    </div>

                    <div class="xuo-advanced-panel">
                        <div class="xuo-advanced-title">
                            <span>页面清理</span>
                            <small>抽屉、推广内容与帖子辅助元素</small>
                        </div>
                        <div class="xuo-settings-grid">
                            ${settingToggle('xuo-hide-chat-drawer', '聊天抽屉', 'hideChatDrawer')}
                            ${settingToggle('xuo-hide-grok-drawer', 'Grok 抽屉', 'hideGrokDrawer')}
                            ${settingToggle('xuo-hide-premium-upsells', 'Premium 推广卡', 'hidePremiumUpsells')}
                            ${settingToggle('xuo-hide-trends', '有什么新鲜事', 'hideTrends', '隐藏右侧趋势模块')}
                            ${settingToggle('xuo-hide-who-to-follow', '推荐关注', 'hideWhoToFollow', '隐藏右侧账号推荐模块')}
                            ${settingToggle('xuo-hide-promoted-posts', '时间线推广帖子', 'hidePromotedPosts')}
                            ${settingToggle('xuo-hide-discover-more', '帖子详情“发现更多”', 'hideDiscoverMore', '隐藏标题及后续推荐帖子')}
                            ${settingToggle('xuo-hide-footer', '页脚导航', 'hideFooter')}
                        </div>
                    </div>

                    <div class="xuo-advanced-panel">
                        <div class="xuo-advanced-title">
                            <span>浮动控件</span>
                            <small>目录弹层、按钮位置和滚动阈值</small>
                        </div>
                        <div class="xuo-settings-grid">
                            ${settingInput('xuo-floating-gap', '按钮与内容间距（px）', 'floatingGap')}
                            ${settingInput('xuo-toc-panel-width', '目录面板宽度（px）', 'tocPanelWidth')}
                            ${settingInput('xuo-toc-panel-offset-x', '目录横向偏移（px）', 'tocPanelOffsetX')}
                            ${settingInput('xuo-scroll-visibility-offset', '箭头显示阈值（px）', 'scrollVisibilityOffset')}
                        </div>
                    </div>
                </div>

                <div class="xuo-modal-footer">
                    <button class="xuo-btn-reset" id="xuo-reset-btn" type="button">恢复默认</button>
                    <div class="xuo-footer-actions">
                        <button class="xuo-btn xuo-btn-cancel" id="xuo-cancel-btn" type="button">取消</button>
                        <button class="xuo-btn xuo-btn-save" id="xuo-save-btn" type="button">${CHECK_ICON_SVG}<span>保存</span></button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modalOverlay);

        const closeModal = () => {
            modalOverlay.classList.remove('show');
            unlockSettingsPageScroll();
        };

        modalOverlay.querySelector('#xuo-close-btn').addEventListener('click', closeModal);
        modalOverlay.querySelector('#xuo-cancel-btn').addEventListener('click', closeModal);
        modalOverlay.querySelector('#xuo-reset-btn').addEventListener('click', resetSettings);
        modalOverlay.querySelector('#xuo-save-btn').addEventListener('click', () => {
            const nextSettings = {};
            modalOverlay.querySelectorAll('[data-setting-key]').forEach(input => {
                nextSettings[input.dataset.settingKey] = input.type === 'checkbox'
                    ? input.checked
                    : input.value;
            });
            saveSettings(nextSettings);
            populateSettingsModal(currentSettings);
            closeModal();
            showToast('页面优化配置已保存');
        });
        modalOverlay.addEventListener('click', (event) => {
            if (event.target === modalOverlay) closeModal();
        });
        modalOverlay.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') closeModal();
        });
    }

    function populateSettingsModal(settings) {
        if (!modalOverlay) return;
        modalOverlay.querySelectorAll('[data-setting-key]').forEach(input => {
            const key = input.dataset.settingKey;
            if (input.type === 'checkbox') input.checked = Boolean(settings[key]);
            else input.value = settings[key];
        });
    }

    function showSettingsModal() {
        createSettingsModal();
        populateSettingsModal(currentSettings);
        modalOverlay.classList.toggle('xuo-dark', isDarkTheme());
        lockSettingsPageScroll();
        setTimeout(() => modalOverlay.classList.add('show'), 50);
    }

    function showToast(message) {
        if (!toastEl) {
            toastEl = document.createElement('div');
            toastEl.className = 'xuo-toast';
            document.body.appendChild(toastEl);
        }
        toastEl.classList.toggle('xuo-dark', isDarkTheme());
        toastEl.innerHTML = `${CHECK_ICON_SVG}<span>${escapeHtml(message)}</span>`;
        toastEl.classList.add('show');
        setTimeout(() => toastEl.classList.remove('show'), 3000);
    }

    if (typeof GM_registerMenuCommand === 'function') {
        GM_registerMenuCommand('配置 X 页面优化', showSettingsModal);
    }

    function observePageChanges() {
        const target = document.body;
        if (!target) return;

        // X 是单页应用，滚动和切换路由时会复用 DOM；这里统一触发布局和目录刷新。
        const observer = new MutationObserver((mutations) => {
            const hasRelevantChange = mutations.some(mutation => {
                if (mutation.type !== 'childList' || !mutation.addedNodes.length) return false;
                return Array.from(mutation.addedNodes).some(node => {
                    if (node.nodeType !== Node.ELEMENT_NODE) return false;
                    if (node.matches?.('.xuo-scroll-nav-button, .xuo-toc-root')) return false;
                    return true;
                });
            });
            if (hasRelevantChange) scheduleFullUpdate();
        });
        observer.observe(target, { childList: true, subtree: true });
    }

    function init() {
        applySettingsToDocument();
        initFloatingControls();
        markArticleLayout();
        renderArticleToc();
        scheduleScrollUpdate();
        observePageChanges();
        setInterval(scheduleFullUpdate, 800);
        setTimeout(scheduleFullUpdate, 1000);
        setTimeout(scheduleFullUpdate, 3000);
    }

    init();
})();
