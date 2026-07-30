export const SETTINGS_BUNDLE_SCHEMA_VERSION = 1;
export const MAX_SETTINGS_BUNDLE_BYTES = 128 * 1024;
export const SETTINGS_BACKUP_KEY = 'rs_portable_settings_backup';

function assertDataOnly(value, depth = 0) {
    if (depth > 10) throw new Error('Settings bundle is nested too deeply');
    if (Array.isArray(value)) {
        value.forEach((item) => assertDataOnly(item, depth + 1));
        return;
    }
    if (!value || typeof value !== 'object') {
        if (typeof value === 'string' && (/^\s*(?:javascript|data|file):/i.test(value) || /<script\b/i.test(value))) {
            throw new Error('Settings bundle contains executable content');
        }
        return;
    }
    for (const [key, item] of Object.entries(value)) {
        if (/(?:script|executable|headers?|cookies?|secrets?|tokens?|passwords?|credentials?)/i.test(key)) {
            throw new Error(`Settings bundle contains forbidden field: ${key}`);
        }
        assertDataOnly(item, depth + 1);
    }
}

function parseBundle(input) {
    const text = typeof input === 'string' ? input : JSON.stringify(input);
    if (!text || new TextEncoder().encode(text).byteLength > MAX_SETTINGS_BUNDLE_BYTES) {
        throw new Error('Settings bundle exceeds the 128 KB limit');
    }
    try {
        return typeof input === 'string' ? JSON.parse(input) : input;
    } catch {
        throw new Error('Settings bundle is not valid JSON');
    }
}

function normalizeSettings(value) {
    const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    return {
        autoSearch: source.autoSearch === true,
        saveHistory: source.saveHistory !== false,
        noUpload: true,
        locale: ['en', 'es', 'qps'].includes(source.locale) ? source.locale : 'en'
    };
}

export function createSettingsBundle({
    appVersion,
    settings,
    activeEngines,
    customEngines,
    now = new Date()
}) {
    return {
        app: 'ImageXpert',
        kind: 'settings-bundle',
        schemaVersion: SETTINGS_BUNDLE_SCHEMA_VERSION,
        appVersion,
        exportedAt: now.toISOString(),
        settings: normalizeSettings(settings),
        activeEngines: [...new Set((activeEngines || []).map(String))],
        customEngines
    };
}

export function validateSettingsBundle(input, {
    validateEngineManifest,
    builtinEngineIds = []
} = {}) {
    const source = parseBundle(input);
    assertDataOnly(source);
    if (!source || typeof source !== 'object' || Array.isArray(source)
        || source.app !== 'ImageXpert' || source.kind !== 'settings-bundle'
        || source.schemaVersion !== SETTINGS_BUNDLE_SCHEMA_VERSION) {
        throw new Error('File is not an ImageXpert settings bundle');
    }
    if (typeof validateEngineManifest !== 'function') throw new Error('Engine validator is unavailable');
    const customEngines = validateEngineManifest(source.customEngines || { schemaVersion: 1, engines: [] });
    const builtin = new Set(builtinEngineIds);
    const customIds = new Set(customEngines.engines.map((engine) => engine.id));
    const conflict = [...customIds].find((id) => builtin.has(id));
    if (conflict) throw new Error(`Custom engine id conflicts with built-in engine: ${conflict}`);
    const allowed = new Set([...builtin, ...customIds]);
    if (!Array.isArray(source.activeEngines) || source.activeEngines.length > 25) {
        throw new Error('Settings bundle activeEngines must be an array of at most 25 ids');
    }
    const activeEngines = [...new Set(source.activeEngines.map(String))];
    if (activeEngines.some((id) => !allowed.has(id))) throw new Error('Settings bundle references an unavailable engine');
    return {
        app: 'ImageXpert',
        kind: 'settings-bundle',
        schemaVersion: SETTINGS_BUNDLE_SCHEMA_VERSION,
        appVersion: String(source.appVersion || '').slice(0, 30),
        exportedAt: Number.isFinite(Date.parse(source.exportedAt)) ? new Date(source.exportedAt).toISOString() : null,
        settings: normalizeSettings(source.settings),
        activeEngines,
        customEngines
    };
}

export function settingsBundleChanges(currentManifest, nextManifest) {
    const current = new Set((currentManifest?.engines || []).map((engine) => engine.id));
    const next = new Set((nextManifest?.engines || []).map((engine) => engine.id));
    return {
        added: [...next].filter((id) => !current.has(id)).sort(),
        updated: [...next].filter((id) => current.has(id)).sort(),
        removed: [...current].filter((id) => !next.has(id)).sort()
    };
}
