export const HISTORY_EXPORT_SCHEMA_VERSION = 1;

export function filterHistory(records, filters, {
    now = Date.now(),
    engineNames = {},
    availabilityFor = () => 'remote'
} = {}) {
    const query = String(filters?.query || '').trim().toLocaleLowerCase();
    const maximumAgeMs = Number(filters?.maximumAgeMs) || 0;
    return (records || []).filter((record) => {
        const availability = availabilityFor(record, now);
        const outcomes = Array.isArray(record.dispatchOutcomes) ? record.dispatchOutcomes : [];
        const searchable = [
            record.url,
            record.sourceType,
            availability,
            ...(record.engines || []),
            ...(record.engines || []).map((id) => engineNames[id] || ''),
            ...outcomes.map((outcome) => outcome.status)
        ].join(' ').toLocaleLowerCase();
        if (query && !searchable.includes(query)) return false;
        if (maximumAgeMs && now - Number(record.time || 0) > maximumAgeMs) return false;
        if (filters?.source && filters.source !== 'all' && record.sourceType !== filters.source) return false;
        if (filters?.engine && filters.engine !== 'all' && !(record.engines || []).includes(filters.engine)) return false;
        if (filters?.outcome && filters.outcome !== 'all' && !outcomes.some((item) => item.status === filters.outcome)) return false;
        if (filters?.expiry && filters.expiry !== 'all' && availability !== filters.expiry) return false;
        return true;
    });
}

export function createRedactedHistoryExport(records, {
    appVersion,
    filters = {},
    now = new Date(),
    availabilityFor = () => 'remote'
} = {}) {
    return {
        app: 'ImageXpert',
        kind: 'redacted-history',
        schemaVersion: HISTORY_EXPORT_SCHEMA_VERSION,
        appVersion,
        exportedAt: now.toISOString(),
        filters: {
            maximumAgeMs: Number(filters.maximumAgeMs) || 0,
            source: String(filters.source || 'all'),
            engine: String(filters.engine || 'all'),
            outcome: String(filters.outcome || 'all'),
            expiry: String(filters.expiry || 'all'),
            queryApplied: Boolean(String(filters.query || '').trim())
        },
        records: (records || []).map((record, index) => ({
            sequence: index + 1,
            searchedAt: new Date(Number(record.time)).toISOString(),
            sourceType: record.sourceType,
            availability: availabilityFor(record),
            expiresAt: Number.isFinite(record.expiresAt) ? new Date(record.expiresAt).toISOString() : null,
            engines: [...(record.engines || [])],
            dispatchOutcomes: (record.dispatchOutcomes || []).map(({ engineId, status }) => ({ engineId, status }))
        }))
    };
}
