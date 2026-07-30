import assert from 'node:assert/strict';
import core from '../app-core.js';
import { createRedactedHistoryExport, filterHistory } from '../modules/history-controller.js';

function test(name, fn) {
    try {
        fn();
        process.stdout.write(`ok - ${name}\n`);
    } catch (error) {
        process.stderr.write(`not ok - ${name}\n${error.stack}\n`);
        process.exitCode = 1;
    }
}

const now = 2_000_000;
const records = core.normalizeHistory([
    {
        id: 'remote',
        url: 'https://secret.example/person-name.jpg?query=private',
        thumb: 'data:image/png;base64,AAAA',
        time: now - 1_000,
        engines: ['google'],
        sourceType: 'remote',
        dispatchOutcomes: [{ engineId: 'google', status: 'opened' }]
    },
    {
        id: 'expired',
        url: 'https://host.example/private-file.jpg',
        time: now - 100_000,
        engines: ['bing'],
        sourceType: 'hosted',
        expiresAt: now - 1,
        dispatchOutcomes: [{ engineId: 'bing', status: 'failed' }]
    }
], ['google', 'bing']);

test('history filters compose query, date, source, engine, outcome, and expiry', () => {
    const options = {
        now,
        engineNames: { google: 'Google Lens', bing: 'Bing' },
        availabilityFor: core.historyAvailability
    };
    assert.equal(filterHistory(records, { query: 'lens' }, options).length, 1);
    assert.equal(filterHistory(records, { maximumAgeMs: 60_000 }, options).length, 1);
    assert.equal(filterHistory(records, { source: 'hosted', engine: 'bing', outcome: 'failed', expiry: 'expired' }, options).length, 1);
    assert.equal(filterHistory(records, { source: 'remote', outcome: 'failed' }, options).length, 0);
});

test('history export is portable metadata with investigation content redacted', () => {
    const payload = createRedactedHistoryExport(records, {
        appVersion: '1.3.0',
        filters: { query: 'person-name', source: 'all' },
        now: new Date('2026-07-29T12:00:00.000Z'),
        availabilityFor: (record) => core.historyAvailability(record, now)
    });
    const serialized = JSON.stringify(payload);
    assert.equal(payload.records.length, 2);
    assert.equal(payload.filters.queryApplied, true);
    assert.doesNotMatch(serialized, /secret\.example|person-name|private-file|data:image|https?:/i);
    assert.deepEqual(payload.records[0].dispatchOutcomes, [{ engineId: 'google', status: 'opened' }]);
});
