'use strict';

const assert = require('node:assert/strict');
const core = require('../app-core.js');
const i18n = require('../i18n.js');

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
