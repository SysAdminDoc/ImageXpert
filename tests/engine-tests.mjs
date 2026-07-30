import assert from 'node:assert/strict';
import {
    createEngineRegistry,
    engineControlMetadata,
    validateEngineRegistry,
    verifyEngineRegistry
} from '../modules/engine-controller.mjs';

const registry = createEngineRegistry();
const contract = validateEngineRegistry(registry);
assert.equal(contract.valid, true, contract.errors.join('\n'));
assert.equal(Object.keys(registry).length, 12);
for (const engine of Object.values(registry)) {
    assert.match(engine.lastVerified, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(['active', 'degraded', 'deprecated'].includes(engine.state));
    assert.ok(['url-template', 'manual-only'].includes(engine.dispatchMethod));
    assert.ok(['remote-url', 'biometric-manual'].includes(engine.privacyClass));
    assert.match(engine.url('https://example.com/image.jpg'), /^https:/);
}
assert.equal(engineControlMetadata({ ...registry.google, state: 'degraded' }).enabled, false);

const networkReport = await verifyEngineRegistry({ google: registry.google }, {
    network: true,
    fetchFunction: async () => { throw new TypeError('simulated network failure'); }
});
assert.equal(networkReport.deterministicValid, true);
assert.equal(networkReport.engines[0].reachability.reachable, false);
process.stdout.write('ok - engine registry metadata, dispatch contracts, and non-fatal reachability reports\n');
