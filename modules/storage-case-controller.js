export function settingsForStorage(settings) {
    const persisted = { ...settings, noUpload: true };
    delete persisted.externalUploadConsent;
    return persisted;
}

export const CASE_SCHEMA_VERSION = 3;
export const MAX_CASE_FILE_BYTES = 512 * 1024;

const CASE_SOURCE_TYPES = new Set(['remote', 'hosted-local', 'local']);
const DISPATCH_STATES = new Set(['queued', 'manual-only', 'consent-required', 'opened', 'blocked', 'failed']);
const PREPROCESS_MODES = new Set(['rotate', 'crop', 'trim', 'region']);

function plainObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function boundedText(value, maximum = 160) {
    return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, maximum);
}

function validIso(value, nullable = false) {
    if (nullable && (value === null || value === undefined || value === '')) return null;
    const text = String(value || '');
    const timestamp = Date.parse(text);
    if (!text || !Number.isFinite(timestamp)) throw new Error('Case contains an invalid timestamp');
    return new Date(timestamp).toISOString();
}

function validHttpUrl(value) {
    const text = String(value || '');
    if (text.length > 4096) throw new Error('Case source URL is too long');
    try {
        const parsed = new URL(text);
        if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error();
        return parsed.href;
    } catch {
        throw new Error('Case source must be an HTTP or HTTPS URL');
    }
}

function sanitizeHashes(value) {
    const hashes = plainObject(value);
    const result = {};
    if (hashes.sha256 !== undefined) {
        if (!/^[a-f0-9]{64}$/i.test(String(hashes.sha256))) throw new Error('Case SHA-256 hash is invalid');
        result.sha256 = String(hashes.sha256).toLowerCase();
    }
    for (const name of ['phash', 'dhash']) {
        if (hashes[name] === undefined) continue;
        if (!/^[a-f0-9]{16}$/i.test(String(hashes[name]))) throw new Error(`Case ${name} is invalid`);
        result[name] = String(hashes[name]).toLowerCase();
    }
    return Object.keys(result).length ? result : null;
}

function sanitizeMetadata(value) {
    const metadata = plainObject(value);
    const size = Number(metadata.size);
    const width = Number(metadata.width);
    const height = Number(metadata.height);
    const lastModified = Number(metadata.lastModified);
    return {
        name: boundedText(metadata.name, 180),
        type: /^image\/[a-z0-9.+-]+$|^video\/[a-z0-9.+-]+$/i.test(String(metadata.type || '')) ? String(metadata.type) : '',
        size: Number.isFinite(size) && size >= 0 && size <= 100 * 1024 * 1024 ? size : 0,
        width: Number.isFinite(width) && width > 0 && width <= 16_384 ? Math.round(width) : 0,
        height: Number.isFinite(height) && height > 0 && height <= 16_384 ? Math.round(height) : 0,
        lastModified: Number.isFinite(lastModified) && lastModified >= 0 ? lastModified : 0
    };
}

function sanitizeProvenance(value) {
    const provenance = plainObject(value);
    return {
        status: boundedText(provenance.status, 40) || 'not-checked',
        signatureValidity: boundedText(provenance.signatureValidity, 40) || 'unknown',
        trust: boundedText(provenance.trust, 40) || 'unknown',
        detail: boundedText(provenance.detail, 300)
    };
}

function sanitizePreprocessing(value) {
    if (!Array.isArray(value)) return [];
    if (value.length > 50) throw new Error('Case has too many preprocessing records');
    return value.map((record) => {
        const item = plainObject(record);
        if (!PREPROCESS_MODES.has(item.mode)) throw new Error('Case contains an unknown preprocessing mode');
        const sanitized = { mode: item.mode };
        for (const field of ['degrees', 'x', 'y', 'width', 'height']) {
            if (item[field] === undefined) continue;
            const number = Number(item[field]);
            if (!Number.isFinite(number) || Math.abs(number) > 100_000) throw new Error(`Case preprocessing ${field} is invalid`);
            sanitized[field] = number;
        }
        if (item.timestamp) sanitized.timestamp = validIso(item.timestamp);
        return sanitized;
    });
}

function sanitizeDispatches(value, validEngineIds) {
    if (!Array.isArray(value)) return [];
    if (value.length > 100) throw new Error('Case has too many dispatch records');
    const valid = new Set(validEngineIds);
    return value.map((record, index) => {
        const item = plainObject(record);
        const engineId = boundedText(item.engineId, 32);
        if (!valid.has(engineId)) throw new Error(`Case dispatch ${index + 1} references an unavailable engine`);
        if (!DISPATCH_STATES.has(item.status)) throw new Error(`Case dispatch ${index + 1} has an invalid state`);
        const host = boundedText(item.targetHost, 255);
        if (host && !/^(?:[a-z0-9-]+\.)*[a-z0-9-]+(?::\d{1,5})?$/i.test(host)) {
            throw new Error(`Case dispatch ${index + 1} has an invalid target host`);
        }
        return {
            id: boundedText(item.id, 100) || `imported-${index + 1}`,
            engineId,
            sourceId: boundedText(item.sourceId, 100) || 'imported',
            status: item.status,
            timestamp: validIso(item.timestamp),
            error: boundedText(item.error, 300),
            targetHost: host
        };
    });
}

export function validateCaseImport(input, {
    validEngineIds = [],
    now = Date.now(),
    maximumBytes = MAX_CASE_FILE_BYTES
} = {}) {
    const text = typeof input === 'string' ? input : JSON.stringify(input);
    if (!text || new TextEncoder().encode(text).byteLength > maximumBytes) {
        throw new Error('Case file exceeds the 512 KB limit');
    }
    let source;
    try {
        source = typeof input === 'string' ? JSON.parse(input) : input;
    } catch {
        throw new Error('Case file is not valid JSON');
    }
    if (!source || typeof source !== 'object' || Array.isArray(source) || source.app !== 'ImageXpert') {
        throw new Error('File is not an ImageXpert case');
    }
    const importedSchema = Number(source.schemaVersion || 1);
    if (!Number.isInteger(importedSchema) || importedSchema < 1 || importedSchema > CASE_SCHEMA_VERSION) {
        throw new Error(`Unsupported case schema: ${source.schemaVersion}`);
    }
    const sourceType = CASE_SOURCE_TYPES.has(source.sourceType)
        ? source.sourceType
        : (source.source === 'local-data-url' ? 'local' : 'remote');
    const safeSource = sourceType === 'local' ? 'local-data-url' : validHttpUrl(source.source);
    const createdAt = validIso(source.createdAt);
    const hostedAt = sourceType === 'hosted-local' ? validIso(source.hostedAt, true) : null;
    const expiresAt = sourceType === 'hosted-local' ? validIso(source.expiresAt, true) : null;
    if (hostedAt && expiresAt && Date.parse(expiresAt) < Date.parse(hostedAt)) {
        throw new Error('Hosted case expiry precedes its upload time');
    }
    const valid = new Set(validEngineIds);
    const selectedSource = Array.isArray(source.selectedEngines) ? source.selectedEngines : [];
    if (selectedSource.length > 25) throw new Error('Case selects too many engines');
    const selectedEngines = selectedSource.map((engine) => boundedText(
        typeof engine === 'string' ? engine : engine?.id,
        32
    )).filter((id, index, values) => valid.has(id) && values.indexOf(id) === index);
    const payload = {
        app: 'ImageXpert',
        schemaVersion: CASE_SCHEMA_VERSION,
        importedSchema,
        migrated: importedSchema !== CASE_SCHEMA_VERSION,
        version: boundedText(source.version, 30),
        createdAt,
        source: safeSource,
        sourceType,
        hostedAt,
        expiresAt,
        selectedEngines,
        hashes: sanitizeHashes(source.hashes),
        originalHashes: sanitizeHashes(source.originalHashes),
        localMetadata: sanitizeMetadata(source.localMetadata),
        provenance: sanitizeProvenance(source.provenance),
        preprocessing: sanitizePreprocessing(source.preprocessing),
        batchCount: Math.max(0, Math.min(10, Math.round(Number(source.batchCount) || 0))),
        dispatches: sanitizeDispatches(source.dispatches, validEngineIds)
    };
    payload.expired = sourceType === 'hosted-local' && (!expiresAt || now >= Date.parse(expiresAt));
    payload.canReopen = sourceType === 'remote' || (sourceType === 'hosted-local' && !payload.expired);
    return payload;
}

export function createCasePayload({
    appVersion,
    source,
    sourceType,
    hostedAt,
    expiresAt,
    selectedEngines,
    hashes,
    originalHashes,
    localMetadata,
    provenance,
    preprocessing,
    batchCount,
    dispatches,
    now = new Date()
}) {
    return {
        app: 'ImageXpert',
        schemaVersion: CASE_SCHEMA_VERSION,
        version: appVersion,
        createdAt: now.toISOString(),
        source,
        sourceType,
        hostedAt,
        expiresAt,
        selectedEngines,
        hashes,
        originalHashes,
        localMetadata,
        provenance,
        preprocessing,
        batchCount,
        dispatches
    };
}
