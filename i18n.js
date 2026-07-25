(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.ImageXpertI18n = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const VERSION = 1;
    const dictionaries = Object.freeze({
        en: Object.freeze({
            'app.name': 'ImageXpert',
            'nav.history': 'History',
            'nav.help': 'How it works',
            'engines.summary': 'Search engines',
            'drop.title': 'Drop an image or short video',
            'drop.subtitle': 'Local files stay on this device unless you explicitly enable a 1-hour external upload.',
            'url.placeholder': 'https://example.com/image.jpg',
            'url.search': 'Search URL',
            'privacy.local': 'Local-only mode',
            'privacy.external': 'External upload enabled',
            'dispatch.heading': 'Engine dispatch queue',
            'settings.heading': '📂 History & Settings',
            'settings.auto': 'Auto-search on load',
            'settings.history': 'Save history',
            'settings.noUpload': 'No-upload dispatch',
            'history.heading': '📂 Search History',
            'diagnostics.heading': '🩺 Diagnostics',
            'help.heading': '❓ How it works'
        })
    });

    function resolveLocale(requested) {
        const normalized = String(requested || 'en').toLowerCase().split('-')[0];
        return dictionaries[normalized] ? normalized : 'en';
    }

    function t(key, locale = 'en') {
        const selected = dictionaries[resolveLocale(locale)];
        return selected[key] ?? dictionaries.en[key] ?? key;
    }

    function apply(rootNode, requestedLocale) {
        const locale = resolveLocale(requestedLocale);
        if (rootNode?.documentElement) rootNode.documentElement.lang = locale;
        rootNode?.querySelectorAll?.('[data-i18n]').forEach((element) => {
            element.textContent = t(element.dataset.i18n, locale);
        });
        rootNode?.querySelectorAll?.('[data-i18n-placeholder]').forEach((element) => {
            element.placeholder = t(element.dataset.i18nPlaceholder, locale);
        });
        return locale;
    }

    return Object.freeze({ VERSION, dictionaries, resolveLocale, t, apply });
}));
