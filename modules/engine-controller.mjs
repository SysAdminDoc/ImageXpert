const VERIFIED_DATE = '2026-07-29';
const SAMPLE_IMAGE_URL = 'https://example.com/image.jpg';
const STATES = new Set(['active', 'degraded', 'deprecated']);
const DISPATCH_METHODS = new Set(['url-template', 'manual-only']);

export function createEngineRegistry() {
    return {
        google: { name: 'Google Lens', host: 'lens.google.com', input: 'url-or-manual', dispatchMethod: 'url-template', privacyClass: 'remote-url', capabilities: ['general', 'products'], state: 'active', lastVerified: VERIFIED_DATE, manualUrl: 'https://lens.google.com/', url: (url) => `https://lens.google.com/uploadbyurl?url=${encodeURIComponent(url)}` },
        yandex: { name: 'Yandex', host: 'yandex.com', input: 'url-or-manual', dispatchMethod: 'url-template', privacyClass: 'remote-url', capabilities: ['general', 'similar'], state: 'active', lastVerified: VERIFIED_DATE, manualUrl: 'https://yandex.com/images/', url: (url) => `https://yandex.com/images/search?rpt=imageview&url=${encodeURIComponent(url)}` },
        bing: { name: 'Bing', host: 'bing.com', input: 'url-or-manual', dispatchMethod: 'url-template', privacyClass: 'remote-url', capabilities: ['general', 'products', 'text-context'], state: 'active', lastVerified: VERIFIED_DATE, supportsText: true, manualUrl: 'https://www.bing.com/images/search?form=HDRSC3', url: (url, context = '') => `https://www.bing.com/images/search?view=detailv2&iss=sbi&form=SBIVSP&sbisrc=UrlPaste&q=${encodeURIComponent(`imgurl:${url}${context ? ` ${context}` : ''}`)}` },
        tineye: { name: 'TinEye', host: 'tineye.com', input: 'url-or-manual', dispatchMethod: 'url-template', privacyClass: 'remote-url', capabilities: ['exact-match'], state: 'active', lastVerified: VERIFIED_DATE, manualUrl: 'https://tineye.com/', url: (url) => `https://tineye.com/search?url=${encodeURIComponent(url)}` },
        saucenao: { name: 'SauceNAO', host: 'saucenao.com', input: 'url-or-manual', dispatchMethod: 'url-template', privacyClass: 'remote-url', capabilities: ['art-source'], state: 'active', lastVerified: VERIFIED_DATE, manualUrl: 'https://saucenao.com/', url: (url) => `https://saucenao.com/search.php?url=${encodeURIComponent(url)}` },
        ascii2d: { name: 'ASCII2D', host: 'ascii2d.net', input: 'url-or-manual', dispatchMethod: 'url-template', privacyClass: 'remote-url', capabilities: ['art-source'], state: 'active', lastVerified: VERIFIED_DATE, manualUrl: 'https://ascii2d.net/', url: (url) => `https://ascii2d.net/search/url/${encodeURIComponent(url)}` },
        tracemoe: { name: 'TraceMoe', host: 'trace.moe', input: 'url-or-manual', dispatchMethod: 'url-template', privacyClass: 'remote-url', capabilities: ['anime-frame'], state: 'active', lastVerified: VERIFIED_DATE, manualUrl: 'https://trace.moe/', url: (url) => `https://trace.moe/?url=${encodeURIComponent(url)}` },
        iqdb: { name: 'IQDB', host: 'iqdb.org', input: 'url-or-manual', dispatchMethod: 'url-template', privacyClass: 'remote-url', capabilities: ['art-similar'], state: 'active', lastVerified: VERIFIED_DATE, manualUrl: 'https://iqdb.org/', url: (url) => `https://iqdb.org/?url=${encodeURIComponent(url)}` },
        iqdb_danbooru: { name: 'IQDB Danbooru', host: 'danbooru.iqdb.org', input: 'url-or-manual', dispatchMethod: 'url-template', privacyClass: 'remote-url', capabilities: ['art-similar'], state: 'active', lastVerified: VERIFIED_DATE, manualUrl: 'https://danbooru.iqdb.org/', url: (url) => `https://danbooru.iqdb.org/?url=${encodeURIComponent(url)}` },
        iqdb_gelbooru: { name: 'IQDB Gelbooru', host: 'gelbooru.iqdb.org', input: 'url-or-manual', dispatchMethod: 'url-template', privacyClass: 'remote-url', capabilities: ['art-similar'], state: 'active', lastVerified: VERIFIED_DATE, manualUrl: 'https://gelbooru.iqdb.org/', url: (url) => `https://gelbooru.iqdb.org/?url=${encodeURIComponent(url)}` },
        iqdb_sankaku: { name: 'IQDB Sankaku', host: 'sankaku.iqdb.org', input: 'url-or-manual', dispatchMethod: 'url-template', privacyClass: 'remote-url', capabilities: ['art-similar'], state: 'active', lastVerified: VERIFIED_DATE, manualUrl: 'https://sankaku.iqdb.org/', url: (url) => `https://sankaku.iqdb.org/?url=${encodeURIComponent(url)}` },
        pimeyes: { name: 'PimEyes', host: 'pimeyes.com', input: 'manual-only', dispatchMethod: 'manual-only', privacyClass: 'biometric-manual', capabilities: ['face-search'], state: 'active', lastVerified: VERIFIED_DATE, consentClass: 'biometric', manualUrl: 'https://pimeyes.com/en', manualOnly: true, consentNotice: 'PimEyes is face search. Use only with consent.', url: () => 'https://pimeyes.com/en' }
    };
}

export function validateEngineRegistry(registry) {
    const errors = [];
    for (const [id, engine] of Object.entries(registry || {})) {
        if (!/^[a-z][a-z0-9_]{1,40}$/.test(id)) errors.push(`${id}: invalid id`);
        if (!engine?.name || !engine.host) errors.push(`${id}: missing identity`);
        if (!Array.isArray(engine?.capabilities) || engine.capabilities.length === 0) errors.push(`${id}: missing capabilities`);
        if (!STATES.has(engine?.state)) errors.push(`${id}: invalid state`);
        if (!DISPATCH_METHODS.has(engine?.dispatchMethod)) errors.push(`${id}: invalid dispatch method`);
        if (!['remote-url', 'biometric-manual', 'custom-remote-url'].includes(engine?.privacyClass)) errors.push(`${id}: invalid privacy class`);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(engine?.lastVerified || '')) errors.push(`${id}: invalid verification date`);
        try {
            const manual = new URL(engine.manualUrl);
            const target = new URL(engine.url(SAMPLE_IMAGE_URL));
            if (manual.protocol !== 'https:' || target.protocol !== 'https:') errors.push(`${id}: non-HTTPS target`);
        } catch {
            errors.push(`${id}: invalid URL constructor`);
        }
    }
    return Object.freeze({ valid: errors.length === 0, errors });
}

export async function verifyEngineRegistry(registry, { network = false, fetchFunction = globalThis.fetch } = {}) {
    const contract = validateEngineRegistry(registry);
    const engines = [];
    for (const [id, engine] of Object.entries(registry)) {
        const record = { id, state: engine.state, lastVerified: engine.lastVerified, contract: contract.errors.filter((error) => error.startsWith(`${id}:`)) };
        if (network) {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort('timeout'), 5_000);
            try {
                const response = await fetchFunction(engine.manualUrl, { method: 'HEAD', redirect: 'manual', signal: controller.signal });
                record.reachability = { reachable: response.status > 0 && response.status < 500, status: response.status };
            } catch (error) {
                record.reachability = { reachable: false, error: String(error?.name || 'network-error') };
            } finally {
                clearTimeout(timeout);
            }
        }
        engines.push(record);
    }
    return Object.freeze({ generatedAt: new Date().toISOString(), deterministicValid: contract.valid, engines });
}

export function engineControlMetadata(engine) {
    return {
        title: `${engine.host} • ${engine.capabilities.join(', ')} • ${engine.state} • verified ${engine.lastVerified}`,
        summary: engine.state === 'active' ? engine.input.replaceAll('-', ' ') : engine.state,
        enabled: engine.state === 'active'
    };
}
