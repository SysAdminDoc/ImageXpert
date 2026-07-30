import assert from 'node:assert/strict';
import core from '../app-core.js';
import {
    createSettingsBundle,
    MAX_SETTINGS_BUNDLE_BYTES,
    settingsBundleChanges,
    validateSettingsBundle
} from '../modules/settings-portability-controller.js';

function test(name, fn) {
    try {
        fn();
        process.stdout.write(`ok - ${name}\n`);
    } catch (error) {
        process.stderr.write(`not ok - ${name}\n${error.stack}\n`);
        process.exitCode = 1;
    }
}

const engine = {
    id: 'example',
    displayName: 'Example',
    urlTemplate: 'https://example.com/search?url={url}',
    manualUrl: 'https://example.com/upload',
    capabilities: ['exact-match'],
    consentClass: 'none',
    order: 1
};

test('portable settings bundles preserve safe preferences and custom engines', () => {
    const bundle = createSettingsBundle({
        appVersion: '1.3.0',
        settings: { autoSearch: true, saveHistory: false, noUpload: false, locale: 'es', externalUploadConsent: true },
        activeEngines: ['google', 'example'],
        customEngines: { schemaVersion: 1, engines: [engine] },
        now: new Date('2026-07-29T12:00:00.000Z')
    });
    const validated = validateSettingsBundle(bundle, {
        validateEngineManifest: core.validateEngineManifest,
        builtinEngineIds: ['google']
    });
    assert.deepEqual(validated.settings, { autoSearch: true, saveHistory: false, noUpload: true, locale: 'es' });
    assert.deepEqual(validated.activeEngines, ['google', 'example']);
    assert.equal(validated.customEngines.engines[0].id, 'example');
});

test('portable settings bundles reject privilege-bearing and executable fields', () => {
    const base = createSettingsBundle({
        appVersion: '1.3.0',
        settings: {},
        activeEngines: ['google'],
        customEngines: { schemaVersion: 1, engines: [] }
    });
    for (const extra of [
        { headers: { Authorization: 'secret' } },
        { cookies: 'session=secret' },
        { apiToken: 'secret' },
        { executableCode: '<script>alert(1)</script>' }
    ]) {
        assert.throws(() => validateSettingsBundle({ ...base, ...extra }, {
            validateEngineManifest: core.validateEngineManifest,
            builtinEngineIds: ['google']
        }), /forbidden|executable/i);
    }
    assert.throws(() => validateSettingsBundle({
        ...base,
        padding: 'x'.repeat(MAX_SETTINGS_BUNDLE_BYTES)
    }, {
        validateEngineManifest: core.validateEngineManifest,
        builtinEngineIds: ['google']
    }), /128 KB/);
});

test('portable settings conflict preview reports added, updated, and removed ids', () => {
    assert.deepEqual(settingsBundleChanges(
        { engines: [{ id: 'old' }, { id: 'same' }] },
        { engines: [{ id: 'same' }, { id: 'new' }] }
    ), {
        added: ['new'],
        updated: ['same'],
        removed: ['old']
    });
});
