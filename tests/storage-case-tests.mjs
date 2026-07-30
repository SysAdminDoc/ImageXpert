import assert from 'node:assert/strict';
import {
    CASE_SCHEMA_VERSION,
    MAX_CASE_FILE_BYTES,
    validateCaseImport
} from '../modules/storage-case-controller.js';

function test(name, fn) {
    try {
        fn();
        process.stdout.write(`ok - ${name}\n`);
    } catch (error) {
        process.stderr.write(`not ok - ${name}\n${error.stack}\n`);
        process.exitCode = 1;
    }
}

const base = {
    app: 'ImageXpert',
    schemaVersion: 3,
    version: '1.3.0',
    createdAt: '2026-07-29T12:00:00.000Z',
    source: 'https://images.example/photo.jpg',
    sourceType: 'remote',
    selectedEngines: [{ id: 'google', name: 'Google Lens' }],
    hashes: {
        sha256: 'a'.repeat(64),
        phash: '0123456789abcdef',
        dhash: 'fedcba9876543210'
    },
    originalHashes: null,
    localMetadata: {
        name: 'photo.jpg',
        type: 'image/jpeg',
        size: 1024,
        width: 800,
        height: 600,
        lastModified: 1_700_000_000_000
    },
    provenance: {
        status: 'not-found',
        signatureValidity: 'unknown',
        trust: 'unknown',
        detail: 'No manifest'
    },
    preprocessing: [{ mode: 'rotate', degrees: 90, timestamp: '2026-07-29T12:01:00.000Z' }],
    batchCount: 1,
    dispatches: [{
        id: 'dispatch-1',
        engineId: 'google',
        sourceId: 'single',
        status: 'opened',
        timestamp: '2026-07-29T12:02:00.000Z',
        targetHost: 'lens.google.com',
        error: ''
    }]
};

test('case import validates and copies only the data schema', () => {
    const payload = validateCaseImport({
        ...base,
        executable: '<script>alert(1)</script>',
        dispatches: [{ ...base.dispatches[0], target: 'javascript:alert(1)', executable: true }]
    }, { validEngineIds: ['google'] });
    assert.equal(payload.schemaVersion, CASE_SCHEMA_VERSION);
    assert.equal(payload.canReopen, true);
    assert.equal(payload.expired, false);
    assert.deepEqual(payload.selectedEngines, ['google']);
    assert.equal(Object.hasOwn(payload, 'executable'), false);
    assert.equal(Object.hasOwn(payload.dispatches[0], 'target'), false);
});

test('old cases migrate and expired hosted cases cannot reopen', () => {
    const payload = validateCaseImport({
        ...base,
        schemaVersion: 1,
        source: 'https://litterbox.example/expired.jpg',
        sourceType: 'hosted-local',
        hostedAt: '2026-07-29T10:00:00.000Z',
        expiresAt: '2026-07-29T11:00:00.000Z',
        selectedEngines: ['google'],
        dispatches: []
    }, {
        validEngineIds: ['google'],
        now: Date.parse('2026-07-29T12:00:00.000Z')
    });
    assert.equal(payload.migrated, true);
    assert.equal(payload.expired, true);
    assert.equal(payload.canReopen, false);
});

test('case import rejects oversized, executable, malformed, and unavailable records', () => {
    assert.throws(
        () => validateCaseImport(`{"padding":"${'x'.repeat(MAX_CASE_FILE_BYTES)}"}`, { validEngineIds: ['google'] }),
        /512 KB/
    );
    assert.throws(
        () => validateCaseImport({ ...base, source: 'javascript:alert(1)' }, { validEngineIds: ['google'] }),
        /HTTP or HTTPS/
    );
    assert.throws(
        () => validateCaseImport({ ...base, createdAt: 'not-a-date' }, { validEngineIds: ['google'] }),
        /timestamp/
    );
    assert.throws(
        () => validateCaseImport({ ...base, hashes: { sha256: 'not-a-hash' } }, { validEngineIds: ['google'] }),
        /SHA-256/
    );
    assert.throws(
        () => validateCaseImport({
            ...base,
            dispatches: [{ ...base.dispatches[0], engineId: 'missing' }]
        }, { validEngineIds: ['google'] }),
        /unavailable engine/
    );
});
