import assert from 'node:assert/strict';
import {
    createEngineRegistry,
    engineControlMetadata,
    engineGuidanceGroups,
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
const guidance = engineGuidanceGroups(registry);
assert.deepEqual(guidance.map((group) => group.title), [
    'Exact copies and source tracing',
    'Objects, products, and general scenes',
    'Illustration, artwork, and anime',
    'Biometric intent'
]);
assert.equal(guidance.at(-1).engines[0].id, 'pimeyes');

const networkReport = await verifyEngineRegistry({ google: registry.google }, {
    network: true,
    fetchFunction: async () => { throw new TypeError('simulated network failure'); }
});
assert.equal(networkReport.deterministicValid, true);
assert.equal(networkReport.engines[0].reachability.reachable, false);
process.stdout.write('ok - engine registry metadata, guidance, dispatch contracts, and non-fatal reachability reports\n');
