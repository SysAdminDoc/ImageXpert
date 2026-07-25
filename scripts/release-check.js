'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');
const version = JSON.parse(read('version.json')).version;
const expected = `v${version}`;

function check(name, fn) {
    try {
        fn();
        process.stdout.write(`ok - ${name}\n`);
    } catch (error) {
        process.stderr.write(`not ok - ${name}\n${error.message}\n`);
        process.exitCode = 1;
    }
}

function zipEntries(file) {
    const buffer = fs.readFileSync(file);
    const entries = [];
    for (let offset = 0; offset <= buffer.length - 46; offset += 1) {
        if (buffer.readUInt32LE(offset) !== 0x02014b50) continue;
        const nameLength = buffer.readUInt16LE(offset + 28);
        const extraLength = buffer.readUInt16LE(offset + 30);
        const commentLength = buffer.readUInt16LE(offset + 32);
        entries.push(buffer.subarray(offset + 46, offset + 46 + nameLength).toString('utf8').replaceAll('\\', '/'));
        offset += 45 + nameLength + extraLength + commentLength;
    }
    return entries;
}

check('version strings are synchronized', () => {
    assert.equal(JSON.parse(read('package.json')).version, version);
    assert.equal(JSON.parse(read('extension/manifest.json')).version, version);
    assert.equal(JSON.parse(read('manifest.webmanifest')).version, version);
    assert.match(read('index.html'), new RegExp(`const APP_VERSION = '${version.replaceAll('.', '\\.')}'`));
    assert.match(read('MediaHunter_Lite.user.js'), new RegExp(`@version\\s+${version.replaceAll('.', '\\.')}`));
    assert.match(read('sw.js'), new RegExp(`imagexpert-v${version.replaceAll('.', '\\.')}`));
    assert.match(read('README.md'), new RegExp(`version-${expected.replaceAll('-', '--')}-blue`));
    assert.match(read('CHANGELOG.md'), new RegExp(`## \\[${expected.replaceAll('.', '\\.')}\\]`));
});

check('branding and metadata reference shipped assets only', () => {
    const html = read('index.html');
    assert.match(html, /<title>ImageXpert/);
    assert.doesNotMatch(html, /banner\.png|ReverseSearch/);
    for (const asset of ['app-core.js', 'i18n.js', 'manifest.webmanifest', 'icon.png']) {
        assert.equal(fs.existsSync(path.join(root, asset)), true, `${asset} is missing`);
    }
});

check('PWA and extension security contracts are valid', () => {
    const extension = JSON.parse(read('extension/manifest.json'));
    assert.equal(extension.manifest_version, 3);
    assert.deepEqual(extension.permissions, ['contextMenus']);
    assert.match(extension.content_security_policy.extension_pages, /script-src 'self'/);
    const sw = read('sw.js');
    assert.match(sw, /url\.origin !== self\.location\.origin/);
    assert.doesNotMatch(sw, /MediaHunter_Lite\.user\.js/);
});

check('engine and external URL schemes are HTTPS', () => {
    const combined = `${read('index.html')}\n${read('extension/background.js')}\n${read('MediaHunter_Lite.user.js')}`;
    const urls = combined.match(/https?:\/\/[^\s"'`)]+/g) || [];
    const insecure = urls.filter((url) => url.startsWith('http://') && !url.includes('127.0.0.1'));
    assert.deepEqual(insecure, []);
});

check('release archives match the current version and allowlists', () => {
    const chromeZip = path.join(root, 'dist', `ImageXpert-Chrome-${expected}.zip`);
    const siteZip = path.join(root, 'dist', `ImageXpert-${expected}-site.zip`);
    assert.equal(fs.existsSync(chromeZip), true, `missing ${path.basename(chromeZip)}`);
    assert.equal(fs.existsSync(siteZip), true, `missing ${path.basename(siteZip)}`);
    assert.deepEqual(zipEntries(chromeZip).sort(), ['background.js', 'icon.png', 'manifest.json']);
    assert.deepEqual(zipEntries(siteZip).sort(), [
        'ImageXpert.html',
        'LICENSE',
        'MediaHunter_Lite.user.js',
        'README.md',
        'app-core.js',
        'extension/background.js',
        'extension/icon.png',
        'extension/manifest.json',
        'i18n.js',
        'index.html',
        'manifest.webmanifest',
        'sw.js',
        'version.json'
    ].sort());
    const stale = fs.readdirSync(path.join(root, 'dist')).filter((name) => name.endsWith('.zip') && ![path.basename(chromeZip), path.basename(siteZip)].includes(name));
    assert.deepEqual(stale, [], `stale archives: ${stale.join(', ')}`);
});
