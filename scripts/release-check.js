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
    assert.match(read('app.js'), new RegExp(`const APP_VERSION = '${version.replaceAll('.', '\\.')}'`));
    const userscript = read('MediaHunter_Lite.user.js');
    assert.match(userscript, new RegExp(`@version\\s+${version.replaceAll('.', '\\.')}`));
    assert.match(userscript, new RegExp(`MEDIAHUNTER_VERSION = '${version.replaceAll('.', '\\.')}'`));
    assert.match(read('sw.js'), new RegExp(`imagexpert-v${version.replaceAll('.', '\\.')}`));
    assert.match(read('README.md'), new RegExp(`version-${expected.replaceAll('-', '--')}-blue`));
    assert.match(read('CHANGELOG.md'), new RegExp(`## \\[${expected.replaceAll('.', '\\.')}\\]`));
});

check('branding and metadata reference shipped assets only', () => {
    const html = read('index.html');
    assert.match(html, /<title>ImageXpert/);
    assert.doesNotMatch(html, /banner\.png|ReverseSearch/);
    for (const asset of ['app-core.js', 'app.css', 'app.js', 'i18n.js', 'manifest.webmanifest', 'icon.png']) {
        assert.equal(fs.existsSync(path.join(root, asset)), true, `${asset} is missing`);
    }
});

check('PWA and extension security contracts are valid', () => {
    const html = read('index.html');
    assert.match(html, /Content-Security-Policy[^>]+script-src 'self'/);
    assert.doesNotMatch(html, /<style\b|<script>(?:.|\n)*?<\/script>|style=|fonts\.googleapis|fonts\.gstatic/);
    assert.match(html, /<script type="module" src="\.\/app\.js"><\/script>/);
    for (const moduleName of [
        'media-controller.js',
        'provenance-controller.mjs',
        'dispatch-controller.js',
        'storage-case-controller.js',
        'upload-policy-controller.js',
        'engine-controller.mjs',
        'service-worker-controller.js',
        'ui-controller.js'
    ]) {
        assert.equal(fs.existsSync(path.join(root, 'modules', moduleName)), true, `${moduleName} is missing`);
        assert.match(read('app.js'), new RegExp(`modules/${moduleName.replace('.', '\\.')}`));
    }
    const extension = JSON.parse(read('extension/manifest.json'));
    assert.equal(extension.manifest_version, 3);
    assert.deepEqual(extension.permissions, ['contextMenus']);
    assert.match(extension.content_security_policy.extension_pages, /script-src 'self'/);
    const sw = read('sw.js');
    assert.match(sw, /url\.origin !== self\.location\.origin/);
    assert.doesNotMatch(sw, /MediaHunter_Lite\.user\.js/);
});

check('userscript privileges match the documented least-privilege boundary', () => {
    const userscript = read('MediaHunter_Lite.user.js');
    const grants = [...userscript.matchAll(/^\/\/ @grant\s+(\S+)$/gm)].map((match) => match[1]);
    assert.deepEqual(grants, [
        'GM_addStyle',
        'GM_openInTab',
        'GM_xmlhttpRequest',
        'GM_download',
        'GM_setValue',
        'GM_getValue',
        'GM_setClipboard',
        'GM_registerMenuCommand'
    ]);
    const connects = [...userscript.matchAll(/^\/\/ @connect\s+(\S+)$/gm)].map((match) => match[1]);
    assert.deepEqual(connects, ['unsplash.com', 'pexels.com', 'pixabay.com', 'mixkit.co', 'youtube.com', 'wikimedia.org']);
    assert.doesNotMatch(userscript, /GM_xmlhttpRequest\(\{/);
    assert.match(userscript, /anonymous: true/);
    assert.match(read('README.md'), /MediaHunter userscript permissions/);
});

check('optional C2PA adapter stays local and rejects affected SDK contracts', () => {
    const provenance = read('modules/provenance-controller.mjs');
    assert.match(provenance, /MINIMUM_C2PA_WEB_VERSION = '0\.8\.3'/);
    assert.match(provenance, /adapter\.execution !== 'worker'/);
    assert.match(provenance, /adapter\.abortable !== true/);
    assert.doesNotMatch(read('index.html'), /<script[^>]+src="https:/);
    assert.match(read('README.md'), /ImageXpertC2PAAdapter/);
});

check('service-worker updates require explicit recoverable activation', () => {
    const worker = read('sw.js');
    assert.doesNotMatch(worker, /\.then\(\(\) => self\.skipWaiting\(\)\)/);
    assert.match(worker, /event\.data\?\.type === 'SKIP_WAITING'/);
    assert.match(worker, /caches\.delete\(CACHE_NAME\)/);
    assert.match(worker, /const cached = await cache\.match\(event\.request\)/);
    const controller = read('modules/service-worker-controller.js');
    assert.match(controller, /beforeActivate/);
    assert.match(controller, /waiting\.postMessage\(\{ type: 'SKIP_WAITING' \}\)/);
    const smoke = read('tests/browser-smoke.js');
    assert.match(smoke, /broken-install/);
    assert.match(smoke, /imagexpert-stale-smoke/);
    assert.match(smoke, /restored remote investigation/);
});

check('engine lifecycle metadata and verifier are shipped', () => {
    const engineModule = read('modules/engine-controller.mjs');
    for (const field of ['dispatchMethod', 'privacyClass', 'lastVerified', "state: 'active'"]) {
        assert.match(engineModule, new RegExp(field));
    }
    assert.match(read('package.json'), /"check:engines": "node scripts\/check-engines\.mjs"/);
    assert.match(read('scripts/check-engines.mjs'), /deterministicValid/);
    assert.match(read('README.md'), /npm run check:engines/);
});

check('accessibility interaction contracts are test-enforced', () => {
    const html = read('index.html');
    assert.match(html, /class="skip-link"/);
    assert.match(html, /id="roiCanvas"[^>]+tabindex="0"/);
    assert.match(html, /role="dialog"[^>]+inert/);
    assert.match(read('app.css'), /prefers-reduced-motion: reduce/);
    const smoke = read('tests/browser-smoke.js');
    assert.match(smoke, /Accessibility\.getFullAXTree/);
    assert.match(smoke, /contrastFailures/);
    assert.match(smoke, /640, 320/);
});

check('laptop-height first-viewport contracts are test-enforced', () => {
    assert.match(read('app.css'), /min-width: 769px\) and \(max-height: 800px/);
    const smoke = read('tests/browser-smoke.js');
    assert.match(smoke, /\[\[1366, 768\], \[1280, 720\]\]/);
    assert.match(smoke, /rotateReachable/);
    assert.match(smoke, /engineCollapsed/);
});

check('CI builds and validates unsigned release artifacts deterministically', () => {
    const workflow = read('.github/workflows/ci.yml');
    assert.match(workflow, /runs-on: windows-latest/);
    assert.match(workflow, /node-version: 22\.18\.0/);
    assert.match(workflow, /run: npm run package/);
    assert.match(workflow, /run: npm test/);
    assert.match(workflow, /uses: actions\/upload-artifact@v4/);
    const browserSmoke = read('tests/browser-smoke.js');
    assert.doesNotMatch(browserSmoke, /litterbox\.catbox\.moe\/resources\/internals/);
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
        'app.css',
        'app.js',
        'extension/background.js',
        'extension/icon.png',
        'extension/manifest.json',
        'i18n.js',
        'index.html',
        'manifest.webmanifest',
        'modules/dispatch-controller.js',
        'modules/engine-controller.mjs',
        'modules/media-controller.js',
        'modules/provenance-controller.mjs',
        'modules/service-worker-controller.js',
        'modules/storage-case-controller.js',
        'modules/ui-controller.js',
        'modules/upload-policy-controller.js',
        'sw.js',
        'version.json'
    ].sort());
    const stale = fs.readdirSync(path.join(root, 'dist')).filter((name) => name.endsWith('.zip') && ![path.basename(chromeZip), path.basename(siteZip)].includes(name));
    assert.deepEqual(stale, [], `stale archives: ${stale.join(', ')}`);
});
