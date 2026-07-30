'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const appVersion = JSON.parse(fs.readFileSync(path.join(root, 'version.json'), 'utf8')).version;
const httpPort = 18765 + (process.pid % 1000);
const debugPort = 19765 + (process.pid % 1000);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'imagexpert-smoke-'));
const chromeCandidates = process.platform === 'win32'
    ? [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
        'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
    ]
    : ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
const chromePath = chromeCandidates.find(fs.existsSync);

if (!chromePath) {
    process.stderr.write('not ok - browser smoke\nChrome or Edge was not found\n');
    process.exit(1);
}

const mimeTypes = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.webmanifest': 'application/manifest+json',
    '.png': 'image/png'
};

let serviceWorkerCacheVariant = '';
const server = http.createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, `http://127.0.0.1:${httpPort}`).pathname);
    const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    const target = path.resolve(root, relative);
    if (!target.startsWith(`${root}${path.sep}`) || !fs.existsSync(target) || !fs.statSync(target).isFile()) {
        response.writeHead(404).end('Not found');
        return;
    }
    response.setHeader('Content-Type', mimeTypes[path.extname(target)] || 'application/octet-stream');
    if (relative === 'sw.js' && serviceWorkerCacheVariant) {
        let worker = fs.readFileSync(target, 'utf8').replace(
            `'imagexpert-v${appVersion}'`,
            `'imagexpert-test-${serviceWorkerCacheVariant}'`
        );
        if (serviceWorkerCacheVariant === 'broken-install') {
            worker = worker.replace("'./icons/icon-512.png'", "'./icons/icon-512.png', './missing-install-asset.js'");
        }
        response.end(worker);
        return;
    }
    fs.createReadStream(target).pipe(response);
});

class CdpClient {
    constructor(url) {
        this.nextId = 1;
        this.pending = new Map();
        this.events = [];
        this.socket = new WebSocket(url);
        this.ready = new Promise((resolve, reject) => {
            this.socket.addEventListener('open', resolve, { once: true });
            this.socket.addEventListener('error', reject, { once: true });
        });
        this.socket.addEventListener('message', (event) => {
            const message = JSON.parse(event.data);
            if (!message.id) {
                this.events.push(message);
                return;
            }
            if (!this.pending.has(message.id)) return;
            const { resolve, reject } = this.pending.get(message.id);
            this.pending.delete(message.id);
            if (message.error) reject(new Error(message.error.message));
            else resolve(message.result);
        });
    }

    async send(method, params = {}) {
        await this.ready;
        const id = this.nextId++;
        const result = new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
        this.socket.send(JSON.stringify({ id, method, params }));
        return result;
    }

    async evaluate(expression) {
        const result = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
        if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
        return result.result.value;
    }

    close() {
        this.socket.close();
    }

    runtimeErrors() {
        return this.events
            .filter((event) => ['Runtime.exceptionThrown', 'Log.entryAdded'].includes(event.method))
            .map((event) => event.params?.exceptionDetails?.exception?.description || event.params?.entry?.text || event.method);
    }
}

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function waitForPage() {
    for (let attempt = 0; attempt < 60; attempt += 1) {
        try {
            const pages = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json();
            const page = pages.find((entry) => entry.type === 'page');
            if (page) return page;
        } catch {
            // Browser is still starting.
        }
        await sleep(100);
    }
    throw new Error('Timed out waiting for browser debugging endpoint');
}

async function waitForApp(client) {
    for (let attempt = 0; attempt < 50; attempt += 1) {
        try {
            if (await client.evaluate('Boolean(window.__ImageXpertTest)')) return;
        } catch {
            // Runtime context is being replaced during navigation.
        }
        await sleep(100);
    }
    throw new Error(`Timed out waiting for app initialization: ${client.runtimeErrors().join(' | ')}`);
}

async function waitForServiceWorkerController(client) {
    for (let attempt = 0; attempt < 50; attempt += 1) {
        if (await client.evaluate('Boolean(navigator.serviceWorker.controller)')) return;
        await sleep(100);
    }
    const detail = await client.evaluate(`navigator.serviceWorker.getRegistrations().then(registrations => registrations.map(registration => ({
        scope: registration.scope,
        active: registration.active?.state,
        installing: registration.installing?.state,
        waiting: registration.waiting?.state
    })))`);
    throw new Error(`Timed out waiting for the service worker to control the page: ${JSON.stringify(detail)}`);
}

async function waitForExpression(client, expression, label) {
    for (let attempt = 0; attempt < 80; attempt += 1) {
        if (await client.evaluate(`Promise.resolve(${expression}).then(Boolean)`)) return;
        await sleep(100);
    }
    const detail = await client.evaluate(`(async () => ({
        lifecycle: document.getElementById('lifecycleBanner')?.dataset.state || '',
        lifecycleText: document.getElementById('lifecycleText')?.textContent || '',
        waiting: Boolean((await navigator.serviceWorker.getRegistration())?.waiting),
        diagnostics: window.__ImageXpertTest?.getState().diagnostics.slice(-8) || []
    }))()`);
    throw new Error(`Timed out waiting for ${label}: ${JSON.stringify(detail)}`);
}

async function setViewport(client, width, height) {
    await client.send('Emulation.setDeviceMetricsOverride', {
        width,
        height,
        deviceScaleFactor: 1,
        mobile: width <= 768
    });
    await client.send('Page.reload', { ignoreCache: true });
    await waitForApp(client);
}

function report(name, fn) {
    return Promise.resolve()
        .then(fn)
        .then(() => process.stdout.write(`ok - ${name}\n`))
        .catch((error) => {
            process.stderr.write(`not ok - ${name}\n${error.stack}\n`);
            process.exitCode = 1;
        });
}

async function main() {
    await new Promise((resolve) => server.listen(httpPort, '127.0.0.1', resolve));
    const browser = spawn(chromePath, [
        '--headless=new',
        '--disable-gpu',
        '--no-first-run',
        '--no-default-browser-check',
        `--remote-debugging-port=${debugPort}`,
        `--user-data-dir=${profile}`,
        'about:blank'
    ], { stdio: 'ignore', windowsHide: true });

    let client;
    try {
        const page = await waitForPage();
        client = new CdpClient(page.webSocketDebuggerUrl);
        await client.send('Page.enable');
        await client.send('Runtime.enable');
        await client.send('Log.enable');
        await client.send('Accessibility.enable');
        await client.send('Page.navigate', { url: `http://127.0.0.1:${httpPort}/` });
        await waitForApp(client);

        await report('desktop URL, local file, history, export, popup, and failure flows', async () => {
            await setViewport(client, 1280, 900);
            const result = await client.evaluate(`(async () => {
                const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
                const hooks = window.__ImageXpertTest;
                if (!hooks) return { error: 'test hooks missing' };
                window.open = () => null;
                const clicked = [];
                HTMLAnchorElement.prototype.click = function () { clicked.push(this.download || this.href); };
                hooks.loadFromUrl(location.origin + '/icon.png');
                await wait(250);
                await hooks.performSearch(location.origin + '/icon.png', false);
                document.getElementById('openQueuedBtn').click();
                const afterUrl = hooks.getState();
                const persistedSettings = JSON.parse(localStorage.getItem('rs_settings'));
                hooks.setHistory([{
                    id: 'expired-host',
                    url: 'https://litterbox.example/expired.png',
                    thumb: '',
                    time: Date.now() - 7200000,
                    engines: ['google'],
                    sourceType: 'hosted',
                    hostedAt: Date.now() - 7200000,
                    expiresAt: Date.now() - 3600000
                }]);
                const expiredHistory = document.getElementById('historyList').innerText;
                const expiredHasSearch = [...document.querySelectorAll('#historyList button')].some(button => button.textContent.includes('Search'));
                hooks.setSettings({ noUpload: true, externalUploadConsent: false });
                const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+Xb7zAAAAAElFTkSuQmCC'), c => c.charCodeAt(0));
                const dataUrl = 'data:image/png;base64,' + btoa(String.fromCharCode(...png));
                let consentFetches = 0;
                window.fetch = async () => { consentFetches += 1; return new Response('https://litterbox.example/upload.png'); };
                window.confirm = () => false;
                hooks.setSettings({ noUpload: false, externalUploadConsent: false });
                await hooks.performSearch(dataUrl, true);
                const consentCancellationTransfers = consentFetches;
                await hooks.loadFromFile(new File([png], 'one.png', { type: 'image/png' }), true);
                const localLoaded = document.getElementById('dropZone').classList.contains('has-image');
                await hooks.loadFromFile(new File(['not-video'], 'bad.mp4', { type: 'video/mp4' }), true);
                const videoFailure = document.getElementById('toastMessage').textContent;
                const videoMetadata = document.getElementById('fileMetadata').innerText;
                window.confirm = () => true;
                window.fetch = async () => new Response('https://litterbox.example/active.png');
                hooks.setSettings({ noUpload: false, externalUploadConsent: true });
                await hooks.loadFromFile(new File([png], 'hosted.png', { type: 'image/png' }), true);
                await hooks.performSearch(dataUrl, true);
                const hostedCase = hooks.getCasePayload();
                hooks.exportCaseFile();
                window.fetch = async () => { throw new TypeError('network unavailable'); };
                hooks.setSettings({ noUpload: false, externalUploadConsent: true });
                await hooks.performSearch(dataUrl, true);
                const finalState = hooks.getState();
                return {
                    title: document.title,
                    semanticButtons: document.querySelectorAll('button.engine-toggle[aria-pressed]').length,
                    queued: afterUrl.dispatches.length,
                    blocked: afterUrl.dispatches.every(item => item.status === 'blocked'),
                    history: afterUrl.history.length,
                    persistedLocalOnly: persistedSettings.noUpload === true && !Object.hasOwn(persistedSettings, 'externalUploadConsent'),
                    expiredHistory,
                    expiredHasSearch,
                    consentCancellationTransfers,
                    localLoaded,
                    metadata: videoMetadata,
                    videoFailure,
                    exported: clicked.some(name => String(name).includes('imagexpert_case_')),
                    hostedCaseHasExpiry: hostedCase.sourceType === 'hosted-local'
                        && Date.parse(hostedCase.expiresAt) - Date.parse(hostedCase.hostedAt) === 3600000,
                    uploadFailure: finalState.diagnostics.some(event => event.phase === 'upload' && event.code !== 'ok')
                };
            })()`);
            if (result.error) result.runtimeErrors = client.runtimeErrors();
            assert.equal(result.error, undefined, JSON.stringify(result.runtimeErrors || []));
            assert.match(result.title, /^ImageXpert/);
            assert.equal(result.semanticButtons, 12);
            assert.equal(result.queued, 2);
            assert.equal(result.blocked, true);
            assert.ok(result.history >= 1);
            assert.equal(result.persistedLocalOnly, true);
            assert.match(result.expiredHistory, /expired/i);
            assert.equal(result.expiredHasSearch, false);
            assert.equal(result.consentCancellationTransfers, 0);
            assert.equal(result.localLoaded, true);
            assert.match(result.metadata, /Type[\s\S]*video\/mp4/);
            assert.match(result.metadata, /C2PA provenance[\s\S]*unsupported/);
            assert.match(result.videoFailure, /decoded|readable|video|extract/i);
            assert.equal(result.exported, true);
            assert.equal(result.hostedCaseHasExpiry, true);
            assert.equal(result.uploadFailure, true);
        });

        await report('WCAG 2.2 names, states, focus, motion, contrast, and keyboard flows', async () => {
            await setViewport(client, 1280, 900);
            const domAudit = await client.evaluate(`(() => {
                const visible = element => {
                    const style = getComputedStyle(element);
                    const rect = element.getBoundingClientRect();
                    return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
                };
                const accessibleName = element => element.getAttribute('aria-label')
                    || (element.id && document.querySelector('label[for="' + CSS.escape(element.id) + '"]')?.textContent)
                    || element.textContent || element.getAttribute('title') || element.getAttribute('placeholder') || '';
                const controls = [...document.querySelectorAll('button, input, select, textarea, a[href], summary, [role="button"], [role="switch"]')]
                    .filter(visible);
                const unnamed = controls.filter(element => !accessibleName(element).trim()).map(element => element.id || element.outerHTML.slice(0, 80));
                const invalidSwitches = [...document.querySelectorAll('[role="switch"]')]
                    .filter(element => !['true', 'false'].includes(element.getAttribute('aria-checked')))
                    .map(element => element.id);
                const duplicateIds = [...document.querySelectorAll('[id]')]
                    .map(element => element.id)
                    .filter((id, index, ids) => ids.indexOf(id) !== index);
                const missingAlt = [...document.querySelectorAll('img')].filter(image => !image.hasAttribute('alt')).map(image => image.id);
                const hiddenDialogsFocusable = [...document.querySelectorAll('[role="dialog"][aria-hidden="true"]')]
                    .filter(dialog => !dialog.inert).map(dialog => dialog.id);
                const parse = value => (value.match(/[\\d.]+/g) || []).slice(0, 3).map(Number);
                const luminance = rgb => {
                    const channels = rgb.map(value => {
                        const channel = value / 255;
                        return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
                    });
                    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
                };
                const ratio = (foreground, background) => {
                    const values = [luminance(parse(foreground)), luminance(parse(background))].sort((a, b) => b - a);
                    return (values[0] + 0.05) / (values[1] + 0.05);
                };
                const contrastFailures = ['.workspace-kicker', '.drop-subtitle', '.privacy-banner p', '.engine-meta', '.rail-note']
                    .flatMap(selector => [...document.querySelectorAll(selector)])
                    .filter(visible)
                    .flatMap(element => {
                        const foreground = getComputedStyle(element).color;
                        let ancestor = element;
                        let background = 'rgb(7, 16, 21)';
                        while (ancestor) {
                            const candidate = getComputedStyle(ancestor).backgroundColor;
                            if (candidate && !candidate.endsWith(', 0)') && candidate !== 'transparent') {
                                background = candidate;
                                break;
                            }
                            ancestor = ancestor.parentElement;
                        }
                        const value = ratio(foreground, background);
                        return value < 4.5 ? [{ selector, ratio: value }] : [];
                    });
                document.getElementById('historyBtn').focus();
                const focusStyle = getComputedStyle(document.getElementById('historyBtn'));
                return {
                    unnamed,
                    invalidSwitches,
                    duplicateIds,
                    missingAlt,
                    hiddenDialogsFocusable,
                    contrastFailures,
                    focusVisible: parseFloat(focusStyle.outlineWidth) >= 3
                };
            })()`);
            assert.deepEqual(domAudit.unnamed, []);
            assert.deepEqual(domAudit.invalidSwitches, []);
            assert.deepEqual(domAudit.duplicateIds, []);
            assert.deepEqual(domAudit.missingAlt, []);
            assert.deepEqual(domAudit.hiddenDialogsFocusable, []);
            assert.deepEqual(domAudit.contrastFailures, []);
            assert.equal(domAudit.focusVisible, true);
            await client.evaluate(`window.__ImageXpertTest.loadFromUrl('javascript:alert(1)')`);
            assert.deepEqual(await client.evaluate(`({
                role: document.getElementById('toast').getAttribute('role'),
                live: document.getElementById('toast').getAttribute('aria-live')
            })`), { role: 'alert', live: 'assertive' });

            const accessibilityTree = await client.send('Accessibility.getFullAXTree');
            const interactiveRoles = new Set(['button', 'link', 'textbox', 'switch', 'combobox']);
            const unnamedAxNodes = accessibilityTree.nodes.filter((node) => (
                !node.ignored
                && interactiveRoles.has(node.role?.value)
                && !String(node.name?.value || '').trim()
            ));
            assert.equal(unnamedAxNodes.length, 0, JSON.stringify(unnamedAxNodes.slice(0, 5)));

            await client.evaluate(`document.getElementById('historyBtn').click()`);
            assert.equal(await client.evaluate(`document.activeElement === document.getElementById('panelClose')`), true);
            await client.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape' });
            await client.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape' });
            assert.equal(await client.evaluate(`document.getElementById('panel').getAttribute('aria-hidden')`), 'true');
            assert.equal(await client.evaluate(`document.activeElement === document.getElementById('historyBtn')`), true);

            const help = await client.evaluate(`(() => {
                document.getElementById('helpBtn').click();
                const text = document.getElementById('helpPanel').innerText;
                document.getElementById('helpClose').click();
                return text;
            })()`);
            assert.match(help, /per-engine queue/i);
            assert.match(help, /local-only file/i);
            assert.match(help, /external upload/i);
            assert.match(help, /CORS/);
            assert.match(help, /Exact copies and source tracing/);
            assert.match(help, /Objects, products, and general scenes/);
            assert.match(help, /Illustration, artwork, and anime/);
            assert.match(help, /Biometric intent/);
            assert.doesNotMatch(help, /Fully Automatic|Always allow popups|\bbest\b/i);

            await client.evaluate(`window.__ImageXpertTest.loadFromUrl(location.origin + '/icon.png')`);
            await client.evaluate(`document.getElementById('roiBtn').click()`);
            assert.equal(await client.evaluate(`document.activeElement === document.getElementById('roiCanvas')`), true);
            await client.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowRight', code: 'ArrowRight' });
            await client.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowRight', code: 'ArrowRight' });
            await client.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape' });
            await client.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape' });
            assert.equal(await client.evaluate(`document.getElementById('roiCanvas').hidden`), true);

            await client.send('Emulation.setEmulatedMedia', {
                features: [{ name: 'prefers-reduced-motion', value: 'reduce' }]
            });
            const motion = await client.evaluate(`getComputedStyle(document.querySelector('.header-btn')).transitionDuration`);
            assert.ok(parseFloat(motion) <= 0.01, motion);
            await client.send('Emulation.setEmulatedMedia', { features: [] });

            for (const width of [640, 320]) {
                await setViewport(client, width, 720);
                const reflow = await client.evaluate(`({
                    scrollWidth: document.documentElement.scrollWidth,
                    innerWidth,
                    mainVisible: document.getElementById('mainContent').getBoundingClientRect().width > 0
                })`);
                assert.ok(reflow.scrollWidth <= reflow.innerWidth, `${width}px reflow overflows`);
                assert.equal(reflow.mainVisible, true);
            }
        });

        for (const [width, height] of [[1366, 768], [1280, 720]]) {
            await report(`${width}x${height} laptop layout keeps investigation actions in the first viewport`, async () => {
                await setViewport(client, width, height);
                const emptyLayout = await client.evaluate(`(() => {
                    const visibleInViewport = element => {
                        const rect = element.getBoundingClientRect();
                        return rect.width > 0 && rect.height > 0 && rect.top >= 0 && rect.bottom <= innerHeight;
                    };
                    const picker = document.getElementById('enginePicker');
                    const targets = {
                        drop: document.getElementById('dropZone'),
                        urlInput: document.getElementById('urlInput'),
                        urlAction: document.getElementById('urlSearchBtn'),
                        privacy: document.getElementById('privacyBanner'),
                        engineSummary: picker.querySelector('summary')
                    };
                    return {
                        visible: Object.fromEntries(Object.entries(targets).map(([key, element]) => [key, visibleInViewport(element)])),
                        engineCollapsed: !picker.open,
                        selectedSummary: document.getElementById('engineSelectionCount').textContent,
                        overflow: document.documentElement.scrollWidth - innerWidth
                    };
                })()`);
                assert.deepEqual(emptyLayout.visible, {
                    drop: true,
                    urlInput: true,
                    urlAction: true,
                    privacy: true,
                    engineSummary: true
                });
                assert.equal(emptyLayout.engineCollapsed, true);
                assert.match(emptyLayout.selectedSummary, /2 selected/);
                assert.ok(emptyLayout.overflow <= 0);

                await client.evaluate(`window.__ImageXpertTest.loadFromUrl(location.origin + '/icon.png')`);
                const loadedLayout = await client.evaluate(`(() => {
                    const drop = document.getElementById('dropZone').getBoundingClientRect();
                    const rotate = document.getElementById('rotateBtn').getBoundingClientRect();
                    const searchAgain = document.getElementById('searchAgainBtn').getBoundingClientRect();
                    return {
                        rotateReachable: rotate.width > 0 && rotate.top >= drop.top && rotate.bottom <= drop.bottom,
                        searchReachable: searchAgain.width > 0 && searchAgain.top >= drop.top && searchAgain.bottom <= drop.bottom,
                        utilityScrollable: document.querySelector('.utility-panel').scrollHeight >= document.querySelector('.utility-panel').clientHeight
                    };
                })()`);
                assert.equal(loadedLayout.rotateReachable, true);
                assert.equal(loadedLayout.searchReachable, true);
                assert.equal(loadedLayout.utilityScrollable, true);
            });
        }

        await report('batch review removes exact duplicates and only warns on perceptual matches', async () => {
            const result = await client.evaluate(`(async () => {
                const hooks = window.__ImageXpertTest;
                const makeFile = (color, name) => new Promise((resolve) => {
                    const canvas = document.createElement('canvas');
                    canvas.width = 8;
                    canvas.height = 8;
                    const context = canvas.getContext('2d');
                    context.fillStyle = color;
                    context.fillRect(0, 0, 8, 8);
                    canvas.toBlob((blob) => resolve(new File([blob], name, { type: 'image/png', lastModified: 1700000000000 })), 'image/png');
                });
                const red = await makeFile('#ff0000', 'red.png');
                const redCopy = new File([await red.arrayBuffer()], 'red-copy.png', { type: 'image/png', lastModified: 1700000000001 });
                const blue = await makeFile('#0000ff', 'blue.png');
                await hooks.loadFromFiles([red, redCopy, blue]);
                document.getElementById('phashThreshold').value = '0';
                document.getElementById('dhashThreshold').value = '0';
                document.getElementById('recheckDuplicatesBtn').click();
                await new Promise((resolve) => setTimeout(resolve, 100));
                const state = hooks.getState();
                return {
                    batchCount: state.currentBatch.length,
                    allSelected: state.currentBatch.every((item) => item.selected === true),
                    groupCount: state.duplicateGroups.length,
                    reviewHidden: document.getElementById('duplicateReview').hidden,
                    reviewText: document.getElementById('duplicateReview').innerText
                };
            })()`);
            assert.equal(result.batchCount, 2);
            assert.equal(result.allSelected, true);
            assert.ok(result.groupCount >= 1, JSON.stringify(result));
            assert.equal(result.reviewHidden, false);
            assert.match(result.reviewText, /Advisory only/i);
            assert.match(result.reviewText, /pHash.*dHash/is);
        });

        await report('history filters compose and export only redacted portable metadata', async () => {
            const result = await client.evaluate(`(async () => {
                const hooks = window.__ImageXpertTest;
                hooks.setHistory([
                    {
                        id: 'remote-opened',
                        url: 'https://secret.example/person-name.jpg?query=private',
                        thumb: 'data:image/png;base64,AAAA',
                        time: Date.now() - 1000,
                        engines: ['google'],
                        sourceType: 'remote',
                        dispatchOutcomes: [{ engineId: 'google', status: 'opened' }]
                    },
                    {
                        id: 'hosted-failed',
                        url: 'https://host.example/private-file.jpg',
                        thumb: '',
                        time: Date.now() - 100000,
                        engines: ['bing'],
                        sourceType: 'hosted',
                        expiresAt: Date.now() - 1,
                        dispatchOutcomes: [{ engineId: 'bing', status: 'failed' }]
                    }
                ]);
                const search = document.getElementById('historySearch');
                search.value = 'Google Lens';
                search.dispatchEvent(new Event('input', { bubbles: true }));
                const queryCount = document.querySelectorAll('#historyList .history-item').length;
                search.value = '';
                search.dispatchEvent(new Event('input', { bubbles: true }));
                for (const [id, value] of [
                    ['historySourceFilter', 'hosted'],
                    ['historyEngineFilter', 'bing'],
                    ['historyOutcomeFilter', 'failed'],
                    ['historyExpiryFilter', 'expired']
                ]) {
                    const control = document.getElementById(id);
                    control.value = value;
                    control.dispatchEvent(new Event('change', { bubbles: true }));
                }
                const composedCount = document.querySelectorAll('#historyList .history-item').length;
                let captured;
                const originalCreate = URL.createObjectURL;
                URL.createObjectURL = (blob) => { captured = blob; return 'blob:history-smoke'; };
                document.getElementById('exportHistoryBtn').click();
                URL.createObjectURL = originalCreate;
                const exported = captured ? await captured.text() : '';
                return { queryCount, composedCount, exported };
            })()`);
            assert.equal(result.queryCount, 1);
            assert.equal(result.composedCount, 1);
            assert.match(result.exported, /"kind": "redacted-history"/);
            assert.doesNotMatch(result.exported, /secret\.example|person-name|private-file|data:image|https?:/i);
            assert.match(result.exported, /"status": "failed"/);
        });

        await report('portable settings import is data-only and durably reversible', async () => {
            const result = await client.evaluate(`(() => {
                const hooks = window.__ImageXpertTest;
                const bundle = hooks.getSettingsBundle();
                let rejected = '';
                try {
                    hooks.importSettingsBundle({ ...bundle, headers: { Authorization: 'secret' } });
                } catch (error) {
                    rejected = error.message;
                }
                const imported = hooks.importSettingsBundle({
                    ...bundle,
                    settings: { autoSearch: true, saveHistory: false, noUpload: false, locale: 'es' },
                    activeEngines: ['google'],
                    customEngines: { schemaVersion: 1, engines: [] }
                });
                const stored = JSON.parse(localStorage.getItem('rs_settings'));
                const backupPresent = Boolean(localStorage.getItem('rs_portable_settings_backup'));
                const locale = localStorage.getItem('rs_locale');
                const rolledBack = hooks.rollbackSettingsBundle();
                return {
                    rejected,
                    imported,
                    stored,
                    backupPresent,
                    locale,
                    rolledBack,
                    backupAfter: localStorage.getItem('rs_portable_settings_backup')
                };
            })()`);
            assert.match(result.rejected, /forbidden field/i);
            assert.equal(result.imported.settings.noUpload, true);
            assert.equal(result.stored.noUpload, true);
            assert.equal(result.backupPresent, true);
            assert.equal(result.locale, 'es');
            assert.equal(result.rolledBack, true);
            assert.equal(result.backupAfter, null);
        });

        await report('diagnostics expose runtime health while redacting investigation data', async () => {
            const result = await client.evaluate(`(async () => {
                const hooks = window.__ImageXpertTest;
                hooks.setHistory([{
                    id: 'sensitive',
                    url: 'https://secret.example/private-file.jpg?query=person-name',
                    thumb: 'data:image/png;base64,AAAA',
                    time: Date.now(),
                    engines: ['google'],
                    sourceType: 'remote'
                }]);
                const report = await hooks.getSupportReport();
                return { report, serialized: JSON.stringify(report) };
            })()`);
            assert.equal(result.report.runtime.appVersion, appVersion);
            assert.equal(result.report.runtime.schemaVersion, 3);
            assert.equal(result.report.runtime.historyRecordCount, 1);
            assert.ok(Array.isArray(result.report.runtime.cacheVersions));
            assert.equal(Object.hasOwn(result.report.runtime.storage, 'quota'), true);
            assert.doesNotMatch(result.serialized, /secret\.example|private-file|person-name|data:image/i);
        });

        await report('case import previews, restores safe state, and rolls back invalid input', async () => {
            const result = await client.evaluate(`(() => {
                const hooks = window.__ImageXpertTest;
                const before = hooks.getState();
                let invalidError = '';
                try {
                    hooks.importCasePayload({
                        app: 'ImageXpert',
                        schemaVersion: 3,
                        createdAt: '2026-07-29T12:00:00.000Z',
                        source: 'javascript:alert(1)',
                        sourceType: 'remote',
                        selectedEngines: []
                    });
                } catch (error) {
                    invalidError = error.message;
                }
                const afterInvalid = hooks.getState();
                const imported = hooks.importCasePayload({
                    app: 'ImageXpert',
                    schemaVersion: 2,
                    version: '1.1.0',
                    createdAt: '2026-07-29T12:00:00.000Z',
                    source: location.origin + '/icon.png',
                    sourceType: 'remote',
                    selectedEngines: [{ id: 'google', name: 'Google Lens' }],
                    hashes: { sha256: '${'a'.repeat(64)}', phash: '0123456789abcdef', dhash: 'fedcba9876543210' },
                    originalHashes: null,
                    localMetadata: { name: 'icon.png', type: 'image/png', size: 4096, width: 512, height: 512, lastModified: 1700000000000 },
                    provenance: { status: 'not-found', signatureValidity: 'unknown', trust: 'unknown', detail: 'No manifest' },
                    preprocessing: [{ mode: 'rotate', degrees: 90, timestamp: '2026-07-29T12:01:00.000Z' }],
                    batchCount: 1,
                    dispatches: [{
                        id: 'old-dispatch',
                        engineId: 'google',
                        sourceId: 'single',
                        status: 'opened',
                        timestamp: '2026-07-29T12:02:00.000Z',
                        targetHost: 'lens.google.com'
                    }]
                });
                const afterImport = hooks.getState();
                return {
                    invalidError,
                    invalidUnchanged: JSON.stringify(before) === JSON.stringify(afterInvalid),
                    imported,
                    afterImport,
                    previewVisible: document.getElementById('dropZone').classList.contains('has-image')
                };
            })()`);
            assert.match(result.invalidError, /HTTP or HTTPS/);
            assert.equal(result.invalidUnchanged, true);
            assert.equal(result.imported.migrated, true);
            assert.match(result.afterImport.source, /icon\.png$/);
            assert.equal(result.afterImport.sourceType, 'remote');
            assert.equal(result.afterImport.hashes.sha256, 'a'.repeat(64));
            assert.equal(result.afterImport.dispatches.length, 1);
            assert.equal(result.previewVisible, true);
        });

        await report('Spanish and expansion locales persist without layout overflow', async () => {
            await setViewport(client, 1280, 720);
            const pseudo = await client.evaluate(`(() => {
                const select = document.getElementById('localeSelect');
                select.value = 'qps';
                select.dispatchEvent(new Event('change', { bubbles: true }));
                return {
                    lang: document.documentElement.lang,
                    locale: document.documentElement.dataset.locale,
                    saved: localStorage.getItem('rs_locale'),
                    title: document.getElementById('workspaceTitle').textContent,
                    scrollWidth: document.documentElement.scrollWidth,
                    innerWidth
                };
            })()`);
            assert.equal(pseudo.lang, 'en-xa');
            assert.equal(pseudo.locale, 'qps');
            assert.equal(pseudo.saved, 'qps');
            assert.match(pseudo.title, /^［/);
            assert.ok(pseudo.scrollWidth <= pseudo.innerWidth, JSON.stringify(pseudo));

            await client.evaluate(`(() => {
                const select = document.getElementById('localeSelect');
                select.value = 'es';
                select.dispatchEvent(new Event('change', { bubbles: true }));
            })()`);
            await client.send('Page.reload', { ignoreCache: true });
            await waitForApp(client);
            const spanish = await client.evaluate(`({
                lang: document.documentElement.lang,
                saved: localStorage.getItem('rs_locale'),
                heading: document.getElementById('workspaceTitle').textContent,
                aria: document.getElementById('historyBtn').getAttribute('aria-label')
            })`);
            assert.equal(spanish.lang, 'es');
            assert.equal(spanish.saved, 'es');
            assert.match(spanish.heading, /Rastrea/);
            assert.equal(spanish.aria, 'Historial');
            await client.evaluate(`localStorage.setItem('rs_locale', 'en')`);
            await client.send('Page.reload', { ignoreCache: true });
            await waitForApp(client);
        });

        await report('CSP-constrained module shell reloads from the offline cache', async () => {
            await client.evaluate('navigator.serviceWorker.ready.then(() => true)');
            await client.send('Page.navigate', { url: `http://127.0.0.1:${httpPort}/` });
            await waitForApp(client);
            await waitForServiceWorkerController(client);
            await client.send('Network.enable');
            try {
                await client.send('Network.emulateNetworkConditions', {
                    offline: true,
                    latency: 0,
                    downloadThroughput: 0,
                    uploadThroughput: 0
                });
                await client.send('Page.reload', { ignoreCache: true });
                await waitForApp(client);
                const offlineShell = await client.evaluate(`({
                    hooksPresent: Boolean(window.__ImageXpertTest),
                    stylesheetLoaded: [...document.styleSheets].some(sheet => sheet.href?.endsWith('/app.css')),
                    moduleLoaded: typeof window.__ImageXpertTest?.getState === 'function'
                })`);
                assert.equal(offlineShell.hooksPresent, true);
                assert.equal(offlineShell.stylesheetLoaded, true);
                assert.equal(offlineShell.moduleLoaded, true);
            } finally {
                await client.send('Network.emulateNetworkConditions', {
                    offline: false,
                    latency: 0,
                    downloadThroughput: -1,
                    uploadThroughput: -1
                });
                await client.send('Page.navigate', { url: `http://127.0.0.1:${httpPort}/` });
                await waitForApp(client);
                await waitForServiceWorkerController(client);
            }
        });

        await report('service-worker updates preserve work and recover from interrupted installs', async () => {
            await waitForServiceWorkerController(client);
            serviceWorkerCacheVariant = 'broken-install';
            const failedInstall = await client.evaluate(`navigator.serviceWorker.getRegistration()
                .then(registration => {
                    const updating = new Promise(resolve => {
                        const found = () => {
                            const worker = registration.installing;
                            if (!worker) return;
                            const reportState = () => {
                                if (['redundant', 'installed', 'activated'].includes(worker.state)) {
                                    resolve({ state: worker.state, controller: navigator.serviceWorker.controller?.scriptURL || '' });
                                }
                            };
                            worker.addEventListener('statechange', reportState);
                            reportState();
                        };
                        registration.addEventListener('updatefound', found, { once: true });
                    });
                    return registration.update().then(() => updating);
                })`);
            assert.equal(failedInstall.state, 'redundant');
            await waitForServiceWorkerController(client);
            await waitForExpression(client, `caches.has('imagexpert-test-broken-install').then(present => !present)`, 'failed install cache cleanup');

            await client.evaluate(`Promise.all([
                caches.open('imagexpert-stale-smoke'),
                Promise.resolve().then(() => {
                    document.getElementById('urlInput').value = location.origin + '/icon.png';
                    window.__ImageXpertTest.loadFromUrl(location.origin + '/icon.png');
                })
            ])`);
            serviceWorkerCacheVariant = 'next-version';
            const mixedVersion = await client.evaluate(`navigator.serviceWorker.getRegistration()
                .then(registration => {
                    const updating = new Promise(resolve => {
                        const found = () => {
                            const worker = registration.installing;
                            if (!worker) return;
                            const reportState = () => {
                                if (worker.state === 'installed') resolve({
                                    waiting: Boolean(registration.waiting),
                                    controller: Boolean(navigator.serviceWorker.controller)
                                });
                            };
                            worker.addEventListener('statechange', reportState);
                            reportState();
                        };
                        registration.addEventListener('updatefound', found, { once: true });
                    });
                    return registration.update().then(() => updating);
                })`);
            assert.equal(mixedVersion.waiting, true);
            assert.equal(mixedVersion.controller, true);
            await waitForExpression(client, `document.getElementById('lifecycleBanner').dataset.state === 'update-ready'`, 'update-ready banner');
            const beforeActivation = await client.evaluate(`(async () => ({
                hooksPresent: Boolean(window.__ImageXpertTest),
                source: document.getElementById('urlInput').value,
                stalePresent: await caches.has('imagexpert-stale-smoke')
            }))()`);
            assert.equal(beforeActivation.hooksPresent, true);
            assert.match(beforeActivation.source, /icon\.png$/);
            assert.equal(beforeActivation.stalePresent, true);

            await client.evaluate(`document.getElementById('activateUpdateBtn').click()`);
            await waitForApp(client);
            await waitForServiceWorkerController(client);
            await waitForExpression(client, `Promise.all([
                caches.has('imagexpert-test-next-version'),
                caches.has('imagexpert-v${appVersion}')
            ]).then(([next, previous]) => next && !previous)`, 'new service-worker cache');
            await waitForExpression(client, `document.getElementById('urlInput')?.value.endsWith('/icon.png')`, 'restored remote investigation');
            const recovered = await client.evaluate(`(async () => ({
                source: document.getElementById('urlInput').value,
                restored: document.getElementById('dropZone').classList.contains('has-image'),
                caches: await caches.keys()
            }))()`);
            assert.match(recovered.source, /icon\.png$/);
            assert.equal(recovered.restored, true);
            assert.equal(recovered.caches.includes('imagexpert-stale-smoke'), false);
            assert.equal(recovered.caches.includes('imagexpert-test-next-version'), true);
        });

        for (const width of [390, 320]) {
            await report(`${width}px mobile layout has no overflow and keeps primary privacy controls visible`, async () => {
                await setViewport(client, width, width === 390 ? 844 : 720);
                const layout = await client.evaluate(`(() => {
                    const privacy = document.getElementById('privacyBanner');
                    const picker = document.getElementById('enginePicker');
                    const camera = document.getElementById('cameraBtn');
                    const visibleTargets = [...document.querySelectorAll('button')].filter((button) => button.offsetParent !== null);
                    return {
                        innerWidth,
                        scrollWidth: document.documentElement.scrollWidth,
                        pickerCollapsed: !picker.open,
                        hooksPresent: Boolean(window.__ImageXpertTest),
                        cameraVisible: getComputedStyle(camera).display !== 'none',
                        privacyVisible: privacy.getBoundingClientRect().top < innerHeight && privacy.getBoundingClientRect().bottom > 0,
                        undersizedTargets: visibleTargets.filter((button) => {
                            const rect = button.getBoundingClientRect();
                            return rect.width > 0 && rect.height > 0 && rect.height < 44;
                        }).length
                    };
                })()`);
                assert.equal(layout.innerWidth, width);
                assert.ok(layout.scrollWidth <= width, `scroll width ${layout.scrollWidth} exceeds ${width}`);
                assert.equal(layout.hooksPresent, true, JSON.stringify(layout));
                assert.equal(layout.pickerCollapsed, true, JSON.stringify(layout));
                assert.equal(layout.cameraVisible, true);
                assert.equal(layout.privacyVisible, true);
                assert.equal(layout.undersizedTargets, 0);
            });
        }
    } finally {
        try {
            await client?.send('Browser.close');
        } catch {
            browser.kill();
        }
        await Promise.race([
            new Promise((resolve) => browser.once('exit', resolve)),
            sleep(2000)
        ]);
        client?.close();
        await new Promise((resolve) => server.close(resolve));
        try {
            fs.rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
        } catch {
            // Chrome can hold a transient Windows lock after a clean Browser.close.
        }
    }
}

main().catch((error) => {
    process.stderr.write(`not ok - browser smoke\n${error.stack}\n`);
    process.exitCode = 1;
    server.close();
    try {
        fs.rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    } catch {
        // Best-effort cleanup after browser startup failure.
    }
});
