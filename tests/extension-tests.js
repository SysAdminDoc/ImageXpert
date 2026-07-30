'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function test(name, fn) {
    try {
        fn();
        process.stdout.write(`ok - ${name}\n`);
    } catch (error) {
        process.stderr.write(`not ok - ${name}\n${error.stack}\n`);
        process.exitCode = 1;
    }
}

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'extension/background.js'), 'utf8');

function runBackground(apiName) {
    let installed;
    let clicked;
    const createdMenus = [];
    const openedTabs = [];
    const api = {
        runtime: { onInstalled: { addListener: (listener) => { installed = listener; } } },
        contextMenus: {
            removeAll: (callback) => callback(),
            create: (menu) => createdMenus.push(menu),
            onClicked: { addListener: (listener) => { clicked = listener; } }
        },
        i18n: { getMessage: (key) => key === 'contextMenuSearch' ? 'Localized search' : '' },
        tabs: { create: (tab) => openedTabs.push(tab) }
    };
    const context = { URL, globalThis: null, [apiName]: api };
    context.globalThis = context;
    vm.runInNewContext(source, context, { filename: 'background.js' });
    installed();
    return { clicked, createdMenus, openedTabs };
}

test('shared background implementation supports Chrome and Firefox namespaces', () => {
    for (const apiName of ['chrome', 'browser']) {
        const runtime = runBackground(apiName);
        assert.deepEqual(JSON.parse(JSON.stringify(runtime.createdMenus)), [{
            id: 'imagexpert-search-image',
            title: 'Localized search',
            contexts: ['image']
        }]);
        runtime.clicked({ menuItemId: 'imagexpert-search-image', srcUrl: 'https://images.example/photo.jpg?size=2' });
        assert.equal(runtime.openedTabs.length, 1);
        const handoff = new URL(runtime.openedTabs[0].url);
        assert.equal(handoff.origin, 'https://sysadmindoc.github.io');
        assert.equal(handoff.searchParams.get('image'), 'https://images.example/photo.jpg?size=2');
        runtime.clicked({ menuItemId: 'imagexpert-search-image', srcUrl: 'javascript:alert(1)' });
        assert.equal(runtime.openedTabs.length, 1);
    }
});

test('browser manifests share version, localization, and least privilege', () => {
    const chrome = JSON.parse(fs.readFileSync(path.join(root, 'extension/manifest.json'), 'utf8'));
    const firefox = JSON.parse(fs.readFileSync(path.join(root, 'extension/manifest.firefox.json'), 'utf8'));
    assert.equal(chrome.version, firefox.version);
    assert.deepEqual(chrome.permissions, ['contextMenus']);
    assert.deepEqual(firefox.permissions, ['contextMenus']);
    assert.equal(chrome.background.service_worker, 'background.js');
    assert.deepEqual(firefox.background.scripts, ['background.js']);
    assert.equal(firefox.browser_specific_settings.gecko.strict_min_version, '121.0');
    assert.equal(chrome.default_locale, 'en');
    assert.equal(firefox.default_locale, 'en');
});
