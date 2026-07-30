import assert from 'node:assert/strict';
import {
    MAX_PROVENANCE_BYTES,
    MAX_PROVENANCE_PIXELS,
    adapterCompatibility,
    inspectProvenance
} from '../modules/provenance-controller.mjs';

function test(name, fn) {
    return Promise.resolve()
        .then(fn)
        .then(() => process.stdout.write(`ok - ${name}\n`))
        .catch((error) => {
            process.stderr.write(`not ok - ${name}\n${error.stack}\n`);
            process.exitCode = 1;
        });
}

const adapter = (overrides = {}) => ({
    contractVersion: 1,
    sdk: { name: '@contentauth/c2pa-web', version: '0.8.3' },
    execution: 'worker',
    abortable: true,
    inspect: async () => ({ manifest: {}, valid: true, trust: 'unknown' }),
    ...overrides
});

const file = (size = 32) => ({
    size,
    arrayBuffer: async () => new ArrayBuffer(size)
});

await test('C2PA adapter rejects affected, unidentified, and main-thread parsers', () => {
    assert.equal(adapterCompatibility(adapter()).compatible, true);
    assert.match(adapterCompatibility(adapter({ sdk: { name: '@contentauth/c2pa-web', version: '0.7.1' } })).reason, /0\.8\.3/);
    assert.equal(adapterCompatibility(adapter({ sdk: { name: 'unknown', version: '9.0.0' } })).compatible, false);
    assert.equal(adapterCompatibility(adapter({ execution: 'main' })).compatible, false);
});

await test('C2PA inspection enforces byte and pixel budgets before parsing', async () => {
    let calls = 0;
    const countingAdapter = adapter({ inspect: async () => { calls += 1; return {}; } });
    const oversized = await inspectProvenance(file(MAX_PROVENANCE_BYTES + 1), { adapter: countingAdapter });
    assert.equal(oversized.status, 'budget-rejected');
    const oversizedDimensions = await inspectProvenance(file(), {
        adapter: countingAdapter,
        dimensions: { width: MAX_PROVENANCE_PIXELS + 1, height: 1 }
    });
    assert.equal(oversizedDimensions.status, 'budget-rejected');
    assert.equal(calls, 0);
});

await test('C2PA validity and trust remain independent', async () => {
    const validUnknown = await inspectProvenance(file(), { adapter: adapter() });
    assert.deepEqual([validUnknown.signatureValidity, validUnknown.trust], ['valid', 'unknown']);
    const invalidUntrusted = await inspectProvenance(file(), {
        adapter: adapter({ inspect: async () => ({ manifest: {}, valid: false, trust: 'untrusted' }) })
    });
    assert.deepEqual([invalidUntrusted.signatureValidity, invalidUntrusted.trust], ['invalid', 'untrusted']);
    const malformed = await inspectProvenance(file(), { adapter: adapter({ inspect: async () => '<script>' }) });
    assert.equal(malformed.status, 'unreadable');
});

await test('C2PA inspection aborts an over-budget worker', async () => {
    let observedAbort = false;
    const slowAdapter = adapter({
        inspect: async (_bytes, { signal }) => new Promise((resolve) => {
            signal.addEventListener('abort', () => {
                observedAbort = true;
                resolve({});
            }, { once: true });
        })
    });
    const result = await inspectProvenance(file(), { adapter: slowAdapter, timeoutMs: 5 });
    assert.equal(result.status, 'timeout');
    assert.equal(observedAbort, true);
});
