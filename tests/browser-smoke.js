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
        this.socket = new WebSocket(url);
        this.ready = new Promise((resolve, reject) => {
            this.socket.addEventListener('open', resolve, { once: true });
            this.socket.addEventListener('error', reject, { once: true });
        });
        this.socket.addEventListener('message', (event) => {
            const message = JSON.parse(event.data);
            if (!message.id || !this.pending.has(message.id)) return;
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

async function setViewport(client, width, height) {
    await client.send('Emulation.setDeviceMetricsOverride', {
        width,
        height,
        deviceScaleFactor: 1,
        mobile: width <= 768
    });
    await client.send('Page.reload', { ignoreCache: true });
    await sleep(500);
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
        `http://127.0.0.1:${httpPort}/`
    ], { stdio: 'ignore', windowsHide: true });

    let client;
    try {
        const page = await waitForPage();
        client = new CdpClient(page.webSocketDebuggerUrl);
        await client.send('Page.enable');
        await client.send('Runtime.enable');
        await sleep(300);

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
                hooks.setSettings({ noUpload: true, externalUploadConsent: false });
                const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+Xb7zAAAAAElFTkSuQmCC'), c => c.charCodeAt(0));
                await hooks.loadFromFile(new File([png], 'one.png', { type: 'image/png' }), true);
                const localLoaded = document.getElementById('dropZone').classList.contains('has-image');
                await hooks.loadFromFile(new File(['not-video'], 'bad.mp4', { type: 'video/mp4' }), true);
                const videoFailure = document.getElementById('toastMessage').textContent;
                hooks.exportCaseFile();
                window.fetch = async () => { throw new TypeError('network unavailable'); };
                hooks.setSettings({ noUpload: false, externalUploadConsent: true });
                const dataUrl = 'data:image/png;base64,' + btoa(String.fromCharCode(...png));
                await hooks.performSearch(dataUrl, true);
                const finalState = hooks.getState();
                return {
                    title: document.title,
                    semanticButtons: document.querySelectorAll('button.engine-toggle[aria-pressed]').length,
                    queued: afterUrl.dispatches.length,
                    blocked: afterUrl.dispatches.every(item => item.status === 'blocked'),
                    history: afterUrl.history.length,
                    localLoaded,
                    videoFailure,
                    exported: clicked.some(name => String(name).includes('imagexpert_case_')),
                    uploadFailure: finalState.diagnostics.some(event => event.phase === 'upload' && event.code !== 'ok')
                };
            })()`);
            assert.equal(result.error, undefined);
            assert.match(result.title, /^ImageXpert/);
            assert.equal(result.semanticButtons, 12);
            assert.equal(result.queued, 2);
            assert.equal(result.blocked, true);
            assert.ok(result.history >= 1);
            assert.equal(result.localLoaded, true);
            assert.match(result.videoFailure, /decoded|readable|video|extract/i);
            assert.equal(result.exported, true);
            assert.equal(result.uploadFailure, true);
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
                assert.equal(layout.pickerCollapsed, true);
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
