'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const root = path.resolve(__dirname, '..');
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
    '.json': 'application/json; charset=utf-8',
    '.webmanifest': 'application/manifest+json',
    '.png': 'image/png'
};

const server = http.createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, `http://127.0.0.1:${httpPort}`).pathname);
    const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    const target = path.resolve(root, relative);
    if (!target.startsWith(`${root}${path.sep}`) || !fs.existsSync(target) || !fs.statSync(target).isFile()) {
        response.writeHead(404).end('Not found');
        return;
    }
    response.setHeader('Content-Type', mimeTypes[path.extname(target)] || 'application/octet-stream');
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
                await client.send('Page.reload', { ignoreCache: true });
                await waitForApp(client);
            }
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
