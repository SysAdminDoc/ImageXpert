'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const core = require('../app-core.js');
const i18n = require('../i18n.js');
const mediaHunter = require('../MediaHunter_Lite.user.js');

function test(name, fn) {
    try {
        fn();
        process.stdout.write(`ok - ${name}\n`);
    } catch (error) {
        process.stderr.write(`not ok - ${name}\n${error.stack}\n`);
        process.exitCode = 1;
    }
}

test('safeParse returns fallback for corrupt storage', () => {
    assert.deepEqual(core.safeParse('{broken', { safe: true }), { safe: true });
});

test('URL validation only permits HTTP and HTTPS', () => {
    assert.equal(core.isHttpUrl('https://example.com/image.jpg'), true);
    assert.equal(core.isHttpUrl('javascript:alert(1)'), false);
    assert.equal(core.isApprovedImageSource('data:text/html;base64,PHNjcmlwdD4='), false);
});

test('legacy gallery records migrate once and deduplicate', () => {
    const state = core.migrateState({
        version: '0',
        settings: '{"saveHistory":true}',
        engines: '["google","unknown"]',
        history: '[{"url":"https://example.com/a.jpg","time":2}]',
        legacyGallery: '[{"url":"https://example.com/a.jpg","added":1},{"url":"https://example.com/b.jpg","added":3}]'
    }, ['google', 'yandex'], {
        settings: { autoSearch: false, saveHistory: true, noUpload: true },
        engines: ['google', 'yandex']
    });
    assert.equal(state.version, core.STORAGE_VERSION);
    assert.deepEqual(state.engines, ['google']);
    assert.deepEqual(state.history.map((item) => item.url), [
        'https://example.com/a.jpg',
        'https://example.com/b.jpg'
    ]);
});

test('history rejects non-network URLs and oversized data thumbnails', () => {
    const hugeThumb = `data:image/png;base64,${'a'.repeat(30_000)}`;
    const result = core.normalizeHistory([
        { url: 'javascript:alert(1)' },
        { url: 'https://example.com/a.jpg', thumb: hugeThumb, engines: ['google'] }
    ], ['google']);
    assert.equal(result.length, 1);
    assert.equal(result[0].thumb, '');
});

test('hosted history tracks active, expired, and legacy unknown availability', () => {
    const now = 1_000_000;
    const records = core.normalizeHistory([
        {
            url: 'https://litterbox.example/active.jpg',
            sourceType: 'hosted',
            hostedAt: now - 1_000,
            expiresAt: now + 1_000,
            engines: ['google']
        },
        {
            url: 'https://litterbox.example/expired.jpg',
            sourceType: 'hosted',
            hostedAt: now - core.HOSTED_RETENTION_MS,
            expiresAt: now,
            engines: ['google']
        },
        {
            url: 'https://litterbox.example/legacy.jpg',
            sourceType: 'hosted',
            engines: ['google']
        },
        {
            url: 'https://example.com/remote.jpg',
            sourceType: 'remote',
            engines: ['google']
        }
    ], ['google']);
    assert.equal(core.historyAvailability(records[0], now), 'active');
    assert.equal(core.historyAvailability(records[1], now), 'expired');
    assert.equal(core.historyAvailability(records[2], now), 'expiry-unknown');
    assert.equal(core.historyAvailability(records[3], now), 'remote');
});

test('state migration forgets external-upload authorization and starts local-only', () => {
    const state = core.migrateState({
        version: '2',
        settings: '{"saveHistory":true,"noUpload":false,"externalUploadConsent":true}',
        engines: '["google"]',
        history: '[{"url":"https://litterbox.example/legacy.jpg","sourceType":"hosted"}]'
    }, ['google'], {
        settings: { autoSearch: false, saveHistory: true, noUpload: true },
        engines: ['google']
    });
    assert.equal(state.settings.noUpload, true);
    assert.equal(Object.hasOwn(state.settings, 'externalUploadConsent'), false);
    assert.equal(state.history[0].expiresAt, null);
});

test('file validation reports every discarded input', () => {
    const files = Array.from({ length: 12 }, (_, index) => ({
        name: `${index}.png`,
        type: 'image/png',
        size: index === 0 ? core.MAX_FILE_BYTES + 1 : 1
    }));
    const result = core.validateFiles(files);
    assert.equal(result.accepted.length, 9);
    assert.equal(result.rejected.length, 3);
    assert.match(result.rejected[0].reason, /25 MB/);
    assert.match(result.rejected[2].reason, /Maximum 10/);
});

test('i18n resolves supported locales and falls back to English', () => {
    assert.equal(i18n.resolveLocale('en-US'), 'en');
    assert.equal(i18n.resolveLocale('zz-ZZ'), 'en');
    assert.equal(i18n.t('app.name', 'zz'), 'ImageXpert');
    assert.equal(i18n.t('missing.key'), 'missing.key');
});

test('custom engine manifests accept data-only HTTPS templates', () => {
    const manifest = core.validateEngineManifest({
        schemaVersion: 1,
        engines: [{
            id: 'example',
            displayName: 'Example Search',
            urlTemplate: 'https://example.com/search?url={url}',
            manualUrl: 'https://example.com/upload',
            capabilities: ['exact-match'],
            consentClass: 'none',
            order: 4
        }]
    });
    assert.equal(manifest.engines[0].id, 'example');
});

test('custom engine manifests reject scripts and unsafe schemes', () => {
    assert.throws(() => core.validateEngineManifest({
        schemaVersion: 1,
        engines: [{
            id: 'unsafe',
            displayName: 'Unsafe',
            urlTemplate: 'javascript:{url}',
            manualUrl: 'https://example.com'
        }]
    }), /HTTPS/);
});

test('userscript URL boundary rejects hostile, credentialed, and oversized values', () => {
    assert.equal(mediaHunter.url('javascript:alert(1)'), '');
    assert.equal(mediaHunter.url('https://user:pass@example.com/a.jpg'), '');
    assert.equal(mediaHunter.url(`https://example.com/${'a'.repeat(mediaHunter.MAX_URL_LENGTH)}`), '');
    assert.equal(mediaHunter.url('https://cdn.pexels.com/a.jpg', undefined, ['pexels.com']), 'https://cdn.pexels.com/a.jpg');
    assert.equal(mediaHunter.url('https://evilpexels.com/a.jpg', undefined, ['pexels.com']), '');
});

test('userscript storage normalization contains corruption and unsafe media', () => {
    assert.deepEqual(mediaHunter.collections({ broken: true }), [{ name: 'Default', items: [] }]);
    const collections = mediaHunter.collections([{
        name: '<script>alert(1)</script>',
        items: [
            { full: 'javascript:alert(1)', thumb: 'https://example.com/thumb.jpg' },
            { full: 'https://example.com/full.jpg', thumb: 'https://example.com/thumb.jpg', type: 'image', name: 'safe.jpg' }
        ]
    }]);
    assert.equal(collections[0].items.length, 1);
    assert.equal(collections[0].items[0].full, 'https://example.com/full.jpg');
    assert.deepEqual(mediaHunter.history(['one', null, 'one', 'x'.repeat(300)]), ['one', 'x'.repeat(200)]);
    assert.equal(mediaHunter.theme('red; background:url(https://evil.example)'), '#00E676');
});

test('userscript response parser and request wrapper enforce size, host, timeout, and anonymity', () => {
    assert.throws(() => mediaHunter.json('{broken'), SyntaxError);
    assert.throws(() => mediaHunter.json('x'.repeat(mediaHunter.MAX_RESPONSE_BYTES + 1)), /2 MB/);
    const hostileHtml = '<img src="javascript:alert(1)" onerror="alert(2)"><script>alert(3)</script>';
    let parsedAs = '';
    const parsed = mediaHunter.html(hostileHtml, class {
        parseFromString(value, mime) {
            parsedAs = mime;
            return { inertSource: value };
        }
    });
    assert.equal(parsedAs, 'text/html');
    assert.equal(parsed.inertSource, hostileHtml);
    assert.throws(() => mediaHunter.html('x'.repeat(mediaHunter.MAX_RESPONSE_BYTES + 1), class {}), /2 MB/);

    let requestOptions;
    let loaded = false;
    mediaHunter.request({
        requestFunction: (options) => {
            requestOptions = options;
            options.onload({ status: 200, responseText: '{"ok":true}' });
        },
        requestUrl: 'https://api.unsplash.com/data',
        allowedHosts: ['unsplash.com'],
        onload: () => { loaded = true; },
        onerror: assert.fail
    });
    assert.equal(loaded, true);
    assert.equal(requestOptions.anonymous, true);
    assert.equal(requestOptions.timeout, mediaHunter.REQUEST_TIMEOUT_MS);

    let timeoutName = '';
    mediaHunter.request({
        requestFunction: (options) => options.ontimeout(),
        requestUrl: 'https://unsplash.com/data',
        allowedHosts: ['unsplash.com'],
        onerror: (error) => { timeoutName = error.name; }
    });
    assert.equal(timeoutName, 'TimeoutError');

    let invoked = false;
    mediaHunter.request({
        requestFunction: () => { invoked = true; },
        requestUrl: 'https://attacker.example/data',
        allowedHosts: ['unsplash.com'],
        onerror: () => {}
    });
    assert.equal(invoked, false);
});

test('userscript keeps native context menus and routes external labels through text nodes', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../MediaHunter_Lite.user.js'), 'utf8');
    const contextHandler = source.match(/document\.addEventListener\('contextmenu',[\s\S]*?\}, true\);/)?.[0] || '';
    assert.notEqual(contextHandler, '');
    assert.doesNotMatch(contextHandler, /preventDefault|stopPropagation/);
    assert.match(source, /badge\.textContent = Boundary\.text\(label, 80\)/);
    assert.doesNotMatch(source, /innerHTML\s*=\s*(?:String\()?label/);
    assert.equal((source.match(/new DOMParser/g) || []).length, 0);
    assert.doesNotMatch(source, /GM_xmlhttpRequest\(\{/);
});
