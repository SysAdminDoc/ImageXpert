(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.ImageXpertCore = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const STORAGE_VERSION = 2;
    const MAX_HISTORY = 30;
    const MAX_HISTORY_THUMBNAIL_LENGTH = 24_000;
    const MAX_FILES = 10;
    const MAX_FILE_BYTES = 25 * 1024 * 1024;
    const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
    const MAX_IMAGE_DIMENSION = 16_384;
    const MAX_VIDEO_SECONDS = 300;
    const MAX_VIDEO_FRAMES = 4;

    function safeParse(value, fallback) {
        if (typeof value !== 'string' || value.length === 0) return fallback;
        try {
            return JSON.parse(value);
        } catch {
            return fallback;
        }
    }

    function isHttpUrl(value) {
        try {
            const url = new URL(String(value));
            return url.protocol === 'http:' || url.protocol === 'https:';
        } catch {
            return false;
        }
    }

    function isApprovedImageSource(value) {
        if (isHttpUrl(value)) return true;
        return /^data:image\/(?:png|jpeg|gif|webp|bmp);base64,[a-z0-9+/=\s]+$/i.test(String(value));
    }

    function boundedThumbnail(value) {
        if (typeof value !== 'string') return '';
        if (isHttpUrl(value)) return value;
        if (isApprovedImageSource(value) && value.length <= MAX_HISTORY_THUMBNAIL_LENGTH) return value;
        return '';
    }

    function normalizeHistory(records, validEngines) {
        const allowed = new Set(validEngines || []);
        if (!Array.isArray(records)) return [];
        return records.slice(0, MAX_HISTORY).flatMap((item) => {
            if (!item || !isHttpUrl(item.url)) return [];
            return [{
                id: typeof item.id === 'string' ? item.id : `history-${Number(item.time || item.added || Date.now())}`,
                url: item.url,
                thumb: boundedThumbnail(item.thumb),
                time: Number(item.time || item.added || Date.now()),
                engines: Array.isArray(item.engines) ? item.engines.filter((id) => allowed.has(id)) : [],
                sourceType: item.sourceType === 'remote' ? 'remote' : 'hosted'
            }];
        });
    }

    function migrateState(raw, validEngines, defaults) {
        const settingsValue = safeParse(raw.settings, {});
        const enginesValue = safeParse(raw.engines, defaults.engines);
        const historyValue = safeParse(raw.history, []);
        const legacyValue = safeParse(raw.legacyGallery, []);
        const storedVersion = Number(raw.version || 0);
        const engines = Array.isArray(enginesValue)
            ? enginesValue.filter((id) => validEngines.includes(id))
            : [...defaults.engines];
        const legacyHistory = Array.isArray(legacyValue) ? legacyValue.map((item) => ({
            url: item?.url,
            thumb: item?.thumb,
            time: item?.added,
            engines: defaults.engines,
            sourceType: 'remote'
        })) : [];
        const combined = storedVersion < STORAGE_VERSION ? [...historyValue, ...legacyHistory] : historyValue;
        const unique = [];
        const seen = new Set();
        for (const item of normalizeHistory(combined, validEngines)) {
            if (seen.has(item.url)) continue;
            seen.add(item.url);
            unique.push(item);
        }
        return {
            version: STORAGE_VERSION,
            settings: { ...defaults.settings, ...(settingsValue && typeof settingsValue === 'object' ? settingsValue : {}) },
            engines: engines.length ? engines : [...defaults.engines],
            history: unique.slice(0, MAX_HISTORY),
            migratedLegacy: storedVersion < STORAGE_VERSION && legacyHistory.length > 0
        };
    }

    function validateFiles(files) {
        const accepted = [];
        const rejected = [];
        Array.from(files || []).forEach((file, index) => {
            if (index >= MAX_FILES) {
                rejected.push({ name: file.name, reason: `Maximum ${MAX_FILES} files per batch` });
            } else if (!/^image\/|^video\//.test(file.type || '')) {
                rejected.push({ name: file.name, reason: 'Unsupported file type' });
            } else {
                const limit = file.type.startsWith('video/') ? MAX_VIDEO_BYTES : MAX_FILE_BYTES;
                if (file.size > limit) rejected.push({ name: file.name, reason: `File exceeds ${Math.round(limit / 1024 / 1024)} MB limit` });
                else accepted.push(file);
            }
        });
        return { accepted, rejected };
    }

    function validateEngineManifest(input) {
        const manifest = typeof input === 'string' ? safeParse(input, null) : input;
        if (!manifest || manifest.schemaVersion !== 1 || !Array.isArray(manifest.engines)) {
            throw new Error('Engine manifest must use schemaVersion 1 and an engines array');
        }
        if (manifest.engines.length > 25) throw new Error('Engine manifest exceeds the 25-engine limit');
        const ids = new Set();
        const engines = manifest.engines.map((engine, index) => {
            const id = String(engine?.id || '');
            const displayName = String(engine?.displayName || '').trim();
            const urlTemplate = String(engine?.urlTemplate || '');
            const manualUrl = String(engine?.manualUrl || '');
            if (!/^[a-z][a-z0-9_-]{1,31}$/.test(id)) throw new Error(`Engine ${index + 1} has an invalid id`);
            if (ids.has(id)) throw new Error(`Duplicate engine id: ${id}`);
            ids.add(id);
            if (!displayName || displayName.length > 60) throw new Error(`Engine ${id} has an invalid display name`);
            if ((urlTemplate.match(/\{url\}/g) || []).length !== 1) throw new Error(`Engine ${id} URL template must contain one {url}`);
            const probe = urlTemplate.replace('{url}', encodeURIComponent('https://example.com/image.jpg'));
            if (!isHttpUrl(probe) || !probe.startsWith('https://')) throw new Error(`Engine ${id} URL template must resolve to HTTPS`);
            if (!isHttpUrl(manualUrl) || !manualUrl.startsWith('https://')) throw new Error(`Engine ${id} manual URL must use HTTPS`);
            const capabilities = Array.isArray(engine.capabilities)
                ? engine.capabilities.map(String).filter((value) => /^[a-z0-9-]{1,30}$/.test(value)).slice(0, 12)
                : [];
            const consentClass = ['none', 'biometric', 'external-upload'].includes(engine.consentClass) ? engine.consentClass : 'none';
            return {
                id,
                displayName,
                urlTemplate,
                manualUrl,
                capabilities,
                consentClass,
                order: Number.isFinite(engine.order) ? Math.max(0, Math.min(999, Math.round(engine.order))) : index
            };
        });
        return { schemaVersion: 1, engines };
    }

    return Object.freeze({
        STORAGE_VERSION,
        MAX_HISTORY,
        MAX_FILES,
        MAX_FILE_BYTES,
        MAX_VIDEO_BYTES,
        MAX_IMAGE_DIMENSION,
        MAX_VIDEO_SECONDS,
        MAX_VIDEO_FRAMES,
        safeParse,
        isHttpUrl,
        isApprovedImageSource,
        boundedThumbnail,
        normalizeHistory,
        migrateState,
        validateFiles,
        validateEngineManifest
    });
}));
