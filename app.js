import { dataUrlToFile, readFileAsDataUrl } from './modules/media-controller.js';
import { createDispatchId, escapeAttribute, escapeHtml } from './modules/dispatch-controller.js';
import { createCasePayload, settingsForStorage } from './modules/storage-case-controller.js';
import { createUploadConsentMessage, hostedWindow, recipientNames } from './modules/upload-policy-controller.js';
import { createEngineRegistry, engineControlMetadata } from './modules/engine-controller.mjs';
import { registerServiceWorker } from './modules/service-worker-controller.js';
import { formatBytes } from './modules/ui-controller.js';
import { inspectProvenance } from './modules/provenance-controller.mjs';

const Core = window.ImageXpertCore;
const I18n = window.ImageXpertI18n;
const activeLocale = I18n.apply(document, navigator.language);
const APP_VERSION = '1.2.0';
const SEARCH_ENGINES = createEngineRegistry();
const BUILTIN_ENGINE_IDS = Object.freeze(Object.keys(SEARCH_ENGINES));
let customEngineManifest = { schemaVersion: 1, engines: [] };
let customEngineBackup = null;

function installCustomEngineManifest(manifest) {
    Object.keys(SEARCH_ENGINES)
        .filter((id) => !BUILTIN_ENGINE_IDS.includes(id))
        .forEach((id) => delete SEARCH_ENGINES[id]);
    customEngineManifest = Core.validateEngineManifest(manifest);
    for (const record of [...customEngineManifest.engines].sort((a, b) => a.order - b.order)) {
        if (BUILTIN_ENGINE_IDS.includes(record.id)) throw new Error(`Custom engine id conflicts with built-in engine: ${record.id}`);
        const template = record.urlTemplate;
        SEARCH_ENGINES[record.id] = {
            name: record.displayName,
            host: new URL(record.manualUrl).host,
            input: 'url-or-manual',
            dispatchMethod: 'url-template',
            privacyClass: record.consentClass === 'biometric' ? 'biometric-manual' : 'custom-remote-url',
            capabilities: record.capabilities,
            state: 'active',
            lastVerified: new Date().toISOString().slice(0, 10),
            consentClass: record.consentClass,
            consentNotice: record.consentClass === 'biometric' ? `${record.displayName} is marked as biometric search. Use only with consent.` : '',
            manualUrl: record.manualUrl,
            url: (sourceUrl) => template.replace('{url}', encodeURIComponent(sourceUrl))
        };
    }
}

try {
    installCustomEngineManifest(Core.safeParse(localStorage.getItem('rs_custom_engines'), customEngineManifest));
} catch (error) {
    localStorage.removeItem('rs_custom_engines');
    customEngineManifest = { schemaVersion: 1, engines: [] };
    console.warn('Invalid saved custom engine manifest was removed:', error);
}

const DEFAULT_SETTINGS = { autoSearch: false, saveHistory: true, noUpload: true };
const DEFAULT_ENGINES = ['google', 'yandex'];
let currentImageUrl = '';
let currentImageData = null;
let hostedUrl = null;
let hostedAt = null;
let hostedExpiresAt = null;
let currentBatch = [];
let lastHashes = null;
let originalHashes = null;
let roiOriginalSource = '';
let currentFileMetadata = null;
let currentProvenance = { status: 'not-checked', signatureValidity: 'unknown', trust: 'unknown', detail: 'Load a local file to inspect provenance.' };
let lastPreprocessing = [];
let dispatches = [];
let activeOperation = null;
let lastFocusedElement = null;
let diagnostics = [];
const migratedState = Core.migrateState({
    version: localStorage.getItem('rs_schema_version'),
    settings: localStorage.getItem('rs_settings'),
    engines: localStorage.getItem('rs_engines'),
    history: localStorage.getItem('rs_history'),
    legacyGallery: localStorage.getItem('imagexpert_gallery')
}, Object.keys(SEARCH_ENGINES), { settings: DEFAULT_SETTINGS, engines: DEFAULT_ENGINES });
let settings = migratedState.settings;
let activeEngines = migratedState.engines;
let history = migratedState.history;
let historyUndo = null;
let externalUploadAuthorized = false;

const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const previewImage = document.getElementById('previewImage');
const imageInfo = document.getElementById('imageInfo');
const urlInput = document.getElementById('urlInput');
const statusBar = document.getElementById('statusBar');
const statusText = document.getElementById('statusText');
const progressBar = document.getElementById('progressBar');
const progressFill = document.getElementById('progressFill');
const cancelOperationBtn = document.getElementById('cancelOperationBtn');
const lifecycleBanner = document.getElementById('lifecycleBanner');
const lifecycleText = document.getElementById('lifecycleText');
const activateUpdateBtn = document.getElementById('activateUpdateBtn');
let activatePendingUpdate = null;

function showToast(msg, icon = '✓', err = false) {
    const t = document.getElementById('toast');
    document.getElementById('toastMessage').textContent = msg;
    document.getElementById('toastIcon').textContent = icon;
    t.classList.toggle('error', err);
    t.setAttribute('role', err ? 'alert' : 'status');
    t.setAttribute('aria-live', err ? 'assertive' : 'polite');
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 3000);
}

function diagnosticCode(error) {
    if (!error) return 'ok';
    if (error.name === 'AbortError') return 'aborted';
    if (/timeout/i.test(error.message || '')) return 'timeout';
    if (/popup|blocked/i.test(error.message || '')) return 'popup-blocked';
    if (/storage|quota/i.test(error.message || '')) return 'storage';
    return String(error.name || 'error').toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 40);
}

function recordDiagnostic({ engine = '', phase, startedAt = performance.now(), error = null, detail = '' }) {
    diagnostics.push({
        timestamp: new Date().toISOString(),
        version: APP_VERSION,
        engine,
        phase,
        latencyMs: Math.max(0, Math.round(performance.now() - startedAt)),
        code: diagnosticCode(error),
        detail: String(detail).replace(/https?:\/\/\S+/gi, '[url]').slice(0, 120)
    });
    diagnostics = diagnostics.slice(-100);
    renderDiagnostics();
}

function supportReport() {
    return {
        app: 'ImageXpert',
        version: APP_VERSION,
        generatedAt: new Date().toISOString(),
        capabilities: {
            online: navigator.onLine,
            serviceWorker: 'serviceWorker' in navigator,
            crypto: Boolean(globalThis.crypto?.subtle),
            clipboard: Boolean(navigator.clipboard),
            userAgent: navigator.userAgent.replace(/\([^)]*\)/g, '(redacted)')
        },
        events: diagnostics
    };
}

function renderDiagnostics() {
    const list = document.getElementById('diagnosticsList');
    if (!list) return;
    list.textContent = diagnostics.length
        ? diagnostics.slice(-20).map((event) => `${event.timestamp} ${event.phase} ${event.engine || '-'} ${event.code} ${event.latencyMs}ms ${event.detail}`).join('\n')
        : 'No diagnostic events.';
}

function renderFileMetadata() {
    const container = document.getElementById('fileMetadata');
    container.replaceChildren();
    if (!currentFileMetadata) return;
    const entries = [
        ['Type', currentFileMetadata.type || 'Unknown'],
        ['Size', formatBytes(currentFileMetadata.size, activeLocale)],
        ['Dimensions', currentFileMetadata.width && currentFileMetadata.height ? `${currentFileMetadata.width} × ${currentFileMetadata.height}` : 'Pending'],
        ['Modified', currentFileMetadata.lastModified ? new Date(currentFileMetadata.lastModified).toLocaleDateString(activeLocale) : 'Unknown'],
        ['C2PA provenance', `${currentProvenance.status}; signature ${currentProvenance.signatureValidity || 'unknown'}; trust ${currentProvenance.trust || 'unknown'} — ${currentProvenance.detail}`]
    ];
    for (const [label, value] of entries) {
        const card = document.createElement('div');
        card.className = 'metadata-card';
        const heading = document.createElement('strong');
        heading.textContent = label;
        const detail = document.createElement('span');
        detail.textContent = String(value);
        card.append(heading, detail);
        container.append(card);
    }
}

async function inspectLocalProvenance(file) {
    currentProvenance = await inspectProvenance(file, {
        dimensions: currentFileMetadata || {},
        adapter: globalThis.ImageXpertC2PAAdapter
    });
    renderFileMetadata();
}

function inspectLocalFile(file, dimensions = {}) {
    currentFileMetadata = {
        name: file.name,
        type: file.type,
        size: file.size,
        lastModified: file.lastModified,
        width: dimensions.width,
        height: dimensions.height
    };
    currentProvenance = { status: 'checking', signatureValidity: 'unknown', trust: 'unknown', detail: 'Inspecting locally.' };
    renderFileMetadata();
    inspectLocalProvenance(file);
}

function showStatus(msg, prog = false) {
    statusText.textContent = msg;
    progressBar.style.display = prog ? 'block' : 'none';
    statusBar.classList.add('show');
}

function updateProgress(p) { progressFill.style.width = p + '%'; }
function hideStatus() {
    statusBar.classList.remove('show');
    progressFill.style.width = '0%';
    cancelOperationBtn.hidden = true;
}

function beginOperation(label) {
    if (activeOperation) activeOperation.abort();
    activeOperation = new AbortController();
    cancelOperationBtn.hidden = false;
    showStatus(label, true);
    return activeOperation;
}

function endOperation(controller) {
    if (activeOperation === controller) activeOperation = null;
    hideStatus();
}

function saveSettings() {
    try {
        localStorage.setItem('rs_schema_version', String(Core.STORAGE_VERSION));
        localStorage.setItem('rs_settings', JSON.stringify(settingsForStorage(settings)));
        localStorage.setItem('rs_engines', JSON.stringify(activeEngines));
    } catch (error) {
        recordDiagnostic({ phase: 'storage-settings', error });
        showToast('Settings could not be saved. Browser storage may be full.', '⚠️', true);
    }
}

function saveHistoryData() {
    history = Core.normalizeHistory(history, Object.keys(SEARCH_ENGINES));
    try {
        localStorage.setItem('rs_schema_version', String(Core.STORAGE_VERSION));
        localStorage.setItem('rs_history', JSON.stringify(history));
        if (migratedState.migratedLegacy) localStorage.removeItem('imagexpert_gallery');
    } catch (error) {
        recordDiagnostic({ phase: 'storage-history', error });
        history = history.map((item) => ({ ...item, thumb: '' }));
        try {
            localStorage.setItem('rs_history', JSON.stringify(history));
            showToast('History thumbnails removed because browser storage is full.', '⚠️', true);
        } catch {
            recordDiagnostic({ phase: 'storage-history-recovery', error: new Error('Storage unavailable') });
            settings.saveHistory = false;
            showToast('History disabled because browser storage is unavailable.', '⚠️', true);
        }
    }
}

function syncPrivacyUI() {
    const localOnly = settings.noUpload || !externalUploadAuthorized;
    document.getElementById('privacyModeLabel').textContent = I18n.t(localOnly ? 'privacy.local' : 'privacy.external', activeLocale);
    document.getElementById('privacyModeDescription').textContent = localOnly
        ? 'Local files stay on this device. Engines open their manual upload pages.'
        : 'Session only: local files become public Litterbox URLs for 1 hour, then selected engines receive those URLs.';
    document.getElementById('privacyModeBtn').textContent = localOnly ? 'Enable external upload' : 'Use local-only mode';
    document.getElementById('noUploadToggle').classList.toggle('on', localOnly);
    document.getElementById('noUploadToggle').setAttribute('aria-checked', String(localOnly));
    document.getElementById('uploadPolicyLink').hidden = localOnly;
}

function setExternalUploadEnabled(enabled) {
    if (enabled) {
        const recipients = recipientNames(activeEngines, SEARCH_ENGINES);
        const accepted = confirm(createUploadConsentMessage(recipients));
        if (!accepted) return false;
        settings.noUpload = false;
        externalUploadAuthorized = true;
    } else {
        settings.noUpload = true;
        externalUploadAuthorized = false;
    }
    syncPrivacyUI();
    saveSettings();
    return true;
}

async function uploadToLitterbox(file) {
    const startedAt = performance.now();
    const controller = beginOperation('Uploading to litterbox.catbox.moe (1-hour retention)...');
    const timeout = setTimeout(() => controller.abort('timeout'), 30_000);
    const formData = new FormData();
    formData.append('reqtype', 'fileupload');
    formData.append('time', '1h');
    formData.append('fileToUpload', file);

    try {
        updateProgress(10);
        updateProgress(30);
        const res = await fetch('https://litterbox.catbox.moe/resources/internals/api.php', {
            method: 'POST',
            body: formData,
            signal: controller.signal
        });
        updateProgress(80);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const url = (await res.text()).trim();
        updateProgress(100);
        if (Core.isHttpUrl(url)) {
            recordDiagnostic({ phase: 'upload', startedAt, detail: 'litterbox 1h' });
            return url;
        }
        throw new Error('Host returned an invalid URL');
    } catch (error) {
        recordDiagnostic({ phase: 'upload', startedAt, error, detail: controller.signal.aborted ? String(controller.signal.reason) : 'litterbox' });
        const message = controller.signal.aborted
            ? (controller.signal.reason === 'timeout' ? 'Upload timed out after 30 seconds.' : 'Upload cancelled.')
            : `Upload failed: ${error.message}`;
        showToast(`${message} Use Search Again to retry.`, '⚠️', true);
        return null;
    } finally {
        clearTimeout(timeout);
        endOperation(controller);
    }
}

function queueSelectedEngines(searchUrl, manual = false, sourceId = 'single', append = false) {
    const context = document.getElementById('textContextInput').value.trim();
    const queued = activeEngines.map((engineId) => {
        const engine = SEARCH_ENGINES[engineId];
        const consentRequired = Boolean(engine?.consentNotice);
        const unavailable = engine?.state !== 'active';
        return {
            id: createDispatchId(engineId),
            engineId,
            sourceId,
            target: manual || engine.manualOnly ? engine.manualUrl : engine.url(searchUrl, engine.supportsText ? context : ''),
            status: unavailable ? 'failed' : consentRequired ? 'consent-required' : (manual || engine.manualOnly ? 'manual-only' : 'queued'),
            timestamp: new Date().toISOString(),
            error: unavailable ? `Engine is ${engine.state}` : consentRequired ? engine.consentNotice : (context && !engine.supportsText ? 'Text context unsupported; image-only query queued.' : '')
        };
    });
    dispatches = append ? [...dispatches, ...queued] : queued;
    renderDispatchQueue();
    return queued;
}

function openDispatch(dispatch) {
    const startedAt = performance.now();
    const engine = SEARCH_ENGINES[dispatch.engineId];
    if (!engine || !Core.isHttpUrl(dispatch.target)) {
        dispatch.status = 'failed';
        dispatch.error = 'Unsafe or missing engine URL';
        dispatch.timestamp = new Date().toISOString();
        recordDiagnostic({ engine: dispatch.engineId, phase: 'dispatch', startedAt, error: new Error(dispatch.error) });
        renderDispatchQueue();
        return;
    }
    if (dispatch.status === 'consent-required') {
        if (!confirm(`${engine.consentNotice}\n\nOpen ${engine.name} now?`)) return;
        dispatch.status = 'manual-only';
    }
    try {
        const opened = window.open(dispatch.target, '_blank', 'noopener,noreferrer');
        dispatch.status = opened ? 'opened' : 'blocked';
        dispatch.error = opened ? '' : 'Browser blocked the tab. Retry this engine after allowing popups.';
        recordDiagnostic({ engine: dispatch.engineId, phase: 'dispatch', startedAt, error: opened ? null : new Error(dispatch.error), detail: dispatch.status });
    } catch (error) {
        dispatch.status = 'failed';
        dispatch.error = error.message;
        recordDiagnostic({ engine: dispatch.engineId, phase: 'dispatch', startedAt, error });
    }
    dispatch.timestamp = new Date().toISOString();
    renderDispatchQueue();
}

function renderDispatchQueue() {
    const panel = document.getElementById('dispatchPanel');
    const list = document.getElementById('dispatchList');
    panel.hidden = dispatches.length === 0;
    list.replaceChildren();
    for (const dispatch of dispatches) {
        const row = document.createElement('div');
        row.className = 'dispatch-item';
        const name = document.createElement('strong');
        name.textContent = SEARCH_ENGINES[dispatch.engineId]?.name || dispatch.engineId;
        const status = document.createElement('span');
        status.className = 'dispatch-status';
        status.dataset.status = dispatch.status;
        status.textContent = dispatch.error ? `${dispatch.status}: ${dispatch.error}` : dispatch.status;
        const retry = document.createElement('button');
        retry.type = 'button';
        retry.className = 'history-btn';
        retry.textContent = ['opened'].includes(dispatch.status) ? 'Open again' : 'Open / retry';
        retry.addEventListener('click', () => openDispatch(dispatch));
        row.append(name, status, retry);
        list.append(row);
    }
    const pending = dispatches.filter((item) => ['queued', 'manual-only', 'blocked', 'failed'].includes(item.status)).length;
    document.getElementById('dispatchSummary').textContent = `${dispatches.length} engine${dispatches.length === 1 ? '' : 's'} • ${pending} ready to open`;
    document.getElementById('openQueuedBtn').disabled = pending === 0;
}

function addHistoryRecord(searchUrl, thumb) {
    if (!settings.saveHistory || !searchUrl) return;
    const now = Date.now();
    const sourceType = currentImageUrl ? 'remote' : 'hosted';
    history.unshift({
        id: crypto.randomUUID ? crypto.randomUUID() : `history-${Date.now()}`,
        url: searchUrl,
        thumb: Core.boundedThumbnail(thumb),
        time: now,
        engines: [...activeEngines],
        sourceType,
        hostedAt: sourceType === 'hosted' ? (hostedAt || now) : null,
        expiresAt: sourceType === 'hosted' ? (hostedExpiresAt || now + Core.HOSTED_RETENTION_MS) : null
    });
    if (history.length > Core.MAX_HISTORY) history.pop();
    saveHistoryData();
    renderHistory();
}

async function performSearch(imageUrl, isLocal = false, options = {}) {
    if (activeEngines.length === 0) { showToast('Select at least one engine!', '⚠️', true); return; }

    let searchUrl = imageUrl;

    if (isLocal) {
        if (settings.noUpload) {
            queueSelectedEngines(null, true, options.sourceId || 'single', options.appendDispatches);
            showToast('Local file stayed on this device. Use the queue to open manual upload pages.', '!');
            return;
        }
        if (!externalUploadAuthorized) {
            if (!setExternalUploadEnabled(true)) {
                settings.noUpload = true;
                syncPrivacyUI();
                saveSettings();
                queueSelectedEngines(null, true, options.sourceId || 'single', options.appendDispatches);
                showToast('Upload cancelled. Manual engine pages are queued instead.', '!');
                return;
            }
        }
            const file = dataUrlToFile(imageUrl);
        const uploaded = await uploadToLitterbox(file);
        if (!uploaded) return;
        searchUrl = uploaded;
        hostedUrl = uploaded;
            ({ hostedAt, expiresAt: hostedExpiresAt } = hostedWindow(Date.now(), Core.HOSTED_RETENTION_MS));
        imageInfo.textContent = `Hosted for 1 hour: ${uploaded.substring(0, 35)}…`;
    }

    queueSelectedEngines(searchUrl, false, options.sourceId || 'single', options.appendDispatches);
    showToast('Engines queued. Use Open queued engines to dispatch with a user gesture.');
    addHistoryRecord(searchUrl, currentImageData || searchUrl);
}

function loadImage(src, isLocal = false, skipAuto = false) {
    currentImageUrl = isLocal ? '' : src;
    currentImageData = isLocal ? src : null;
    hostedUrl = null;
    hostedAt = null;
    hostedExpiresAt = null;
    previewImage.src = src;
    dropZone.classList.add('has-image');
    updateImageAnalysis(src, isLocal);

    const img = new Image();
    img.onload = () => { imageInfo.innerHTML = `<strong>${img.naturalWidth} × ${img.naturalHeight}</strong>`; };
    img.src = src;

    if (settings.autoSearch && !skipAuto) setTimeout(() => performSearch(src, isLocal), 300);
}

function loadFromUrl(url) {
    if (!Core.isHttpUrl(url)) { showToast('Enter a valid HTTP or HTTPS URL', '⚠️', true); return; }
    loadImage(url, false);
}

function validateImageDimensions(file) {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const image = new Image();
        image.onload = () => {
            URL.revokeObjectURL(url);
            if (image.naturalWidth > Core.MAX_IMAGE_DIMENSION || image.naturalHeight > Core.MAX_IMAGE_DIMENSION) {
                reject(new Error(`${file.name} exceeds the ${Core.MAX_IMAGE_DIMENSION}px dimension limit`));
            } else {
                resolve({ width: image.naturalWidth, height: image.naturalHeight });
            }
        };
        image.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error(`${file.name} could not be decoded as an image`));
        };
        image.src = url;
    });
}

async function loadFromFile(file, skipAuto = false) {
    if (!file) { showToast('Select an image or video', '⚠️', true); return; }
    const validation = Core.validateFiles([file]);
    if (validation.rejected.length) {
        showToast(`${file.name} — ${validation.rejected[0].reason}`, '⚠️', true);
        return;
    }
    if (file.type.startsWith('video/')) {
        inspectLocalFile(file);
        await loadVideoFrames(file);
        return;
    }
    if (!file.type.startsWith('image/')) { showToast('Select an image', '⚠️', true); return; }
    try {
        const dimensions = await validateImageDimensions(file);
        inspectLocalFile(file, dimensions);
            loadImage(await readFileAsDataUrl(file), true, skipAuto);
    } catch (error) {
        showToast(error.message, '⚠️', true);
    }
}

async function loadFromFiles(fileList) {
    const validation = Core.validateFiles(fileList);
    const files = validation.accepted;
    if (validation.rejected.length) {
        const first = validation.rejected[0];
        showToast(`${validation.rejected.length} file${validation.rejected.length > 1 ? 's were' : ' was'} skipped: ${first.name} — ${first.reason}`, '⚠️', true);
    }
    if (files.length === 0) { showToast('Drop image or video files', '⚠️', true); return; }
    if (files.length === 1) { await loadFromFile(files[0]); return; }

    const controller = beginOperation('Preparing batch...');
    currentBatch = [];
    try {
        for (let i = 0; i < files.length; i++) {
            if (controller.signal.aborted) throw new DOMException('Batch cancelled', 'AbortError');
            updateProgress(Math.round((i / files.length) * 80));
            const file = files[i];
            if (file.type.startsWith('video/')) {
                const frames = await extractVideoFrames(file, Core.MAX_VIDEO_FRAMES, controller.signal);
                frames.forEach((frame, idx) => currentBatch.push({ id: `${file.name}-${idx}`, name: `${file.name} frame ${idx + 1}`, dataUrl: frame.dataUrl, timestamp: frame.timestamp, metadata: { name: file.name, type: 'image/jpeg', size: file.size, width: frame.width, height: frame.height } }));
            } else {
                const dimensions = await validateImageDimensions(file);
                    currentBatch.push({ id: `${file.name}-${file.lastModified}`, name: file.name, dataUrl: await readFileAsDataUrl(file, controller.signal), timestamp: null, metadata: { name: file.name, type: file.type, size: file.size, lastModified: file.lastModified, ...dimensions } });
            }
        }
    } catch (error) {
        showToast(error.name === 'AbortError' ? 'Batch preparation cancelled.' : error.message, '⚠️', true);
    } finally {
        endOperation(controller);
    }
    updateProgress(100);
    if (currentBatch.length === 0) { showToast('No searchable frames or images found', '⚠️', true); return; }
    await dedupeCurrentBatch();
    renderBatch(0);
    currentFileMetadata = currentBatch[0].metadata || null;
    renderFileMetadata();
    loadImage(currentBatch[0].dataUrl, true, true);
    if (settings.autoSearch) performBatchSearch();
}

async function loadVideoFrames(file) {
    const controller = beginOperation('Extracting video frames...');
    try {
        currentBatch = (await extractVideoFrames(file, Core.MAX_VIDEO_FRAMES, controller.signal))
            .map((frame, idx) => ({ id: `${file.name}-${idx}`, name: `${file.name} frame ${idx + 1}`, dataUrl: frame.dataUrl, timestamp: frame.timestamp, metadata: { name: file.name, type: 'image/jpeg', size: file.size, width: frame.width, height: frame.height } }));
    } catch (error) {
        showToast(error.name === 'AbortError' ? 'Video extraction cancelled.' : error.message, '⚠️', true);
        currentBatch = [];
    } finally {
        endOperation(controller);
    }
    if (currentBatch.length === 0) { showToast('Could not extract frames', '⚠️', true); return; }
    await dedupeCurrentBatch();
    renderBatch(0);
    currentFileMetadata = currentBatch[0].metadata || currentFileMetadata;
    renderFileMetadata();
    loadImage(currentBatch[0].dataUrl, true, true);
    if (settings.autoSearch) performBatchSearch();
}

function extractVideoFrames(file, count, signal) {
    return new Promise((resolve, reject) => {
        const video = document.createElement('video');
        const url = URL.createObjectURL(file);
        const frames = [];
        const cleanup = () => {
            video.removeAttribute('src');
            video.load();
            URL.revokeObjectURL(url);
        };
        video.muted = true;
        video.preload = 'metadata';
        video.src = url;
        video.onloadedmetadata = async () => {
            if (!Number.isFinite(video.duration) || video.duration <= 0) {
                cleanup();
                reject(new Error(`${file.name} has no readable duration`));
                return;
            }
            if (video.duration > Core.MAX_VIDEO_SECONDS) {
                cleanup();
                reject(new Error(`${file.name} exceeds the ${Core.MAX_VIDEO_SECONDS}-second video limit`));
                return;
            }
            if (video.videoWidth > Core.MAX_IMAGE_DIMENSION || video.videoHeight > Core.MAX_IMAGE_DIMENSION) {
                cleanup();
                reject(new Error(`${file.name} exceeds the ${Core.MAX_IMAGE_DIMENSION}px dimension limit`));
                return;
            }
            const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : count;
            const points = Array.from({ length: count }, (_, idx) => {
                const raw = duration * ((idx + 1) / (count + 1));
                return Math.min(Math.max(0, duration - 0.05), Math.max(0.05, raw));
            });
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            canvas.width = video.videoWidth || 1280;
            canvas.height = video.videoHeight || 720;
            try {
                for (const point of points) {
                    if (signal?.aborted) throw new DOMException('Video extraction cancelled', 'AbortError');
                    await new Promise((seekDone, seekFail) => {
                        const seekTimeout = setTimeout(() => seekFail(new Error(`Frame extraction timed out for ${file.name}`)), 10_000);
                        video.onseeked = () => {
                            clearTimeout(seekTimeout);
                            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                        frames.push({ dataUrl: canvas.toDataURL('image/jpeg', 0.9), timestamp: point, width: canvas.width, height: canvas.height });
                            seekDone();
                        };
                        video.currentTime = point;
                    });
                }
            } catch (error) {
                cleanup();
                reject(error);
                return;
            }
            cleanup();
            resolve(frames);
        };
        video.onerror = () => { cleanup(); reject(new Error(`${file.name} could not be decoded as video`)); };
        signal?.addEventListener('abort', () => {
            cleanup();
            reject(new DOMException('Video extraction cancelled', 'AbortError'));
        }, { once: true });
    });
}

function renderBatch(activeIndex = 0) {
    const strip = document.getElementById('batchStrip');
    strip.replaceChildren();
    if (currentBatch.length <= 1) return;
    currentBatch.forEach((item, idx) => {
        if (!Core.isApprovedImageSource(item.dataUrl)) return;
        if (typeof item.selected !== 'boolean') item.selected = true;
        if (!item.status) item.status = 'ready';
        const card = document.createElement('div');
        card.className = `batch-item ${idx === activeIndex ? 'active' : ''}`;
        card.dataset.batchIndex = String(idx);
        const image = document.createElement('img');
        image.src = item.dataUrl;
        image.alt = '';
        const label = document.createElement('span');
        const time = Number.isFinite(item.timestamp) ? ` at ${item.timestamp.toFixed(1)}s` : '';
        label.textContent = `${item.name}${time} • ${item.status}`;
        const choose = document.createElement('button');
        choose.type = 'button';
        choose.className = 'history-btn';
        choose.textContent = 'Preview';
        choose.addEventListener('click', () => {
            renderBatch(idx);
            currentFileMetadata = currentBatch[idx].metadata || null;
            renderFileMetadata();
            loadImage(currentBatch[idx].dataUrl, true, true);
        });
        const selection = document.createElement('label');
        selection.className = 'dispatch-status';
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = item.selected;
        checkbox.addEventListener('change', () => { item.selected = checkbox.checked; });
        selection.append(checkbox, ' Include');
        const retry = document.createElement('button');
        retry.type = 'button';
        retry.className = 'history-btn';
        retry.textContent = item.status === 'processing' ? 'Cancel' : 'Retry';
        retry.hidden = !['processing', 'failed', 'cancelled'].includes(item.status);
        retry.addEventListener('click', async () => {
            if (item.status === 'processing') {
                activeOperation?.abort('user');
                item.status = 'cancelled';
                renderBatch(idx);
                return;
            }
            item.selected = true;
            item.status = 'retrying';
            renderBatch(idx);
            await performSearch(item.dataUrl, true, { sourceId: item.id, appendDispatches: true });
            item.status = 'queued';
            renderBatch(idx);
        });
        card.append(image, label, choose, selection, retry);
        strip.append(card);
    });
}

async function dedupeCurrentBatch() {
    const unique = [];
    const seen = new Set();
    let removed = 0;
    for (const item of currentBatch) {
        item.hash = item.hash || await sha256FromDataUrl(item.dataUrl);
        if (seen.has(item.hash)) {
            removed += 1;
            continue;
        }
        seen.add(item.hash);
        unique.push(item);
    }
    currentBatch = unique;
    if (removed) showToast(`${removed} duplicate batch item${removed === 1 ? '' : 's'} removed.`, '↺');
}

async function performBatchSearch() {
    if (currentBatch.length === 0) return;
    dispatches = [];
    const selected = currentBatch.filter((item) => item.selected !== false);
    if (selected.length === 0) {
        showToast('Select at least one batch item.', '⚠️', true);
        return;
    }
    for (let i = 0; i < selected.length; i++) {
        const item = selected[i];
        item.status = 'processing';
        renderBatch(currentBatch.indexOf(item));
        try {
            await performSearch(item.dataUrl, true, { sourceId: item.id, appendDispatches: true });
            item.status = 'queued';
        } catch (error) {
            item.status = error.name === 'AbortError' ? 'cancelled' : 'failed';
        }
        renderBatch(currentBatch.indexOf(item));
    }
    showToast(`${selected.length} batch item${selected.length === 1 ? '' : 's'} reviewed and queued.`);
}

function loadImageElement(src) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        if (!src.startsWith('data:')) img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
    });
}

async function sha256FromDataUrl(dataUrl) {
    const file = dataUrlToFile(dataUrl);
    const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function grayscaleFromImage(img, width, height) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, width, height);
    const data = ctx.getImageData(0, 0, width, height).data;
    const gray = [];
    for (let i = 0; i < data.length; i += 4) gray.push((data[i] * 0.299) + (data[i + 1] * 0.587) + (data[i + 2] * 0.114));
    return gray;
}

function bitsToHex(bits) {
    let hex = '';
    for (let i = 0; i < bits.length; i += 4) hex += parseInt(bits.slice(i, i + 4).join(''), 2).toString(16);
    return hex;
}

function median(values) {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
}

function dctCoefficient(gray, size, u, v) {
    let sum = 0;
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            sum += gray[(y * size) + x] * Math.cos(((2 * x + 1) * u * Math.PI) / (2 * size)) * Math.cos(((2 * y + 1) * v * Math.PI) / (2 * size));
        }
    }
    const cu = u === 0 ? 1 / Math.sqrt(2) : 1;
    const cv = v === 0 ? 1 / Math.sqrt(2) : 1;
    return 0.25 * cu * cv * sum;
}

async function computeVisualHashes(src) {
    const img = await loadImageElement(src);
    const dGray = grayscaleFromImage(img, 9, 8);
    const dBits = [];
    for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) dBits.push(dGray[(y * 9) + x] > dGray[(y * 9) + x + 1] ? 1 : 0);
    }

    const pGray = grayscaleFromImage(img, 32, 32);
    const coeffs = [];
    for (let v = 0; v < 8; v++) {
        for (let u = 0; u < 8; u++) coeffs.push(dctCoefficient(pGray, 32, u, v));
    }
    const pMedian = median(coeffs.slice(1));
    return {
        dhash: bitsToHex(dBits),
        phash: bitsToHex(coeffs.map((value, idx) => (idx === 0 ? 0 : value > pMedian ? 1 : 0)))
    };
}

async function updateImageAnalysis(src, isLocal) {
    const hashGrid = document.getElementById('hashGrid');
    hashGrid.innerHTML = '<div class="hash-card"><strong>Hashes</strong><code>Calculating...</code></div>';
    lastHashes = null;
    try {
        const hashes = await computeVisualHashes(src);
        if (isLocal && src.startsWith('data:')) hashes.sha256 = await sha256FromDataUrl(src);
        lastHashes = hashes;
        renderHashes(hashes);
    } catch (err) {
        console.warn('Hashing failed:', err);
        hashGrid.innerHTML = '<div class="hash-card"><strong>Hashes</strong><code>Unavailable for this image</code></div>';
    }
}

function renderHashes(hashes) {
    const hashGrid = document.getElementById('hashGrid');
    const entries = [
        ['SHA-256', hashes.sha256 || 'Local file only'],
        ['pHash', hashes.phash],
        ['dHash', hashes.dhash]
    ];
    hashGrid.innerHTML = entries.map(([label, value]) => `
            <button class="hash-card" data-copy="${escapeAttribute(value)}" type="button">
            <strong>${label}</strong>
            <code>${escapeHtml(value)}</code>
        </button>
    `).join('');
}

async function preprocessCurrentImage(mode) {
    const src = currentImageData || currentImageUrl;
    if (!src) { showToast('Load an image first', '⚠️', true); return; }
    try {
        const img = await loadImageElement(src);
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        let sx = 0, sy = 0, sw = img.naturalWidth, sh = img.naturalHeight;
        if (mode === 'crop') {
            const size = Math.floor(Math.min(sw, sh) * 0.86);
            sx = Math.floor((sw - size) / 2);
            sy = Math.floor((sh - size) / 2);
            sw = sh = size;
        }
        if (mode === 'trim') sh = Math.max(1, Math.floor(sh * 0.88));
        if (mode === 'rotate') {
            canvas.width = sh;
            canvas.height = sw;
            ctx.translate(canvas.width, 0);
            ctx.rotate(Math.PI / 2);
            ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
        } else {
            canvas.width = sw;
            canvas.height = sh;
            ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
        }
        currentBatch = [];
        renderBatch();
        loadImage(canvas.toDataURL('image/jpeg', 0.92), true, true);
        lastPreprocessing.push({ mode, timestamp: new Date().toISOString() });
        showToast('Preprocessed image ready');
    } catch (err) {
        console.warn('Preprocess failed:', err);
        showToast('Preprocess needs a local image or CORS-enabled URL', '⚠️', true);
    }
}

function beginRegionSelection() {
    const source = currentImageData || currentImageUrl;
    if (!source) {
        showToast('Load an image before selecting a region.', '⚠️', true);
        return;
    }
    const canvas = document.getElementById('roiCanvas');
    const wrap = canvas.parentElement;
    canvas.width = wrap.clientWidth;
    canvas.height = wrap.clientHeight;
    canvas.hidden = false;
    canvas.dataset.source = source;
    roiOriginalSource = source;
    canvas.focus();
    showToast('Drag to choose a region, or use arrow keys and Enter.', '↘');
}

async function applyRegionSelection(start, end) {
    const canvas = document.getElementById('roiCanvas');
    const source = canvas.dataset.source;
    const imageRect = previewImage.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();
    const left = Math.max(imageRect.left, Math.min(start.x, end.x) + canvasRect.left);
    const top = Math.max(imageRect.top, Math.min(start.y, end.y) + canvasRect.top);
    const right = Math.min(imageRect.right, Math.max(start.x, end.x) + canvasRect.left);
    const bottom = Math.min(imageRect.bottom, Math.max(start.y, end.y) + canvasRect.top);
    if (right - left < 12 || bottom - top < 12) {
        showToast('Selected region is too small.', '⚠️', true);
        return;
    }
    try {
        const image = await loadImageElement(source);
        const scaleX = image.naturalWidth / imageRect.width;
        const scaleY = image.naturalHeight / imageRect.height;
        const sx = Math.round((left - imageRect.left) * scaleX);
        const sy = Math.round((top - imageRect.top) * scaleY);
        const sw = Math.round((right - left) * scaleX);
        const sh = Math.round((bottom - top) * scaleY);
        const crop = document.createElement('canvas');
        crop.width = sw;
        crop.height = sh;
        crop.getContext('2d').drawImage(image, sx, sy, sw, sh, 0, 0, sw, sh);
        originalHashes = originalHashes || (lastHashes ? { ...lastHashes } : null);
        lastPreprocessing.push({ mode: 'region', x: sx, y: sy, width: sw, height: sh, timestamp: new Date().toISOString() });
        loadImage(crop.toDataURL('image/jpeg', 0.92), true, true);
        document.getElementById('roiResetBtn').hidden = false;
        showToast('Selected region is ready; original hashes remain in the case export.');
    } catch (error) {
        showToast('Region selection requires a local image or CORS-enabled URL.', '⚠️', true);
    } finally {
        canvas.hidden = true;
        canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
    }
}

function buildCasePayload() {
    const source = hostedUrl || currentImageUrl || (currentImageData ? 'local-data-url' : '');
    if (!source) return null;
    return createCasePayload({
        appVersion: APP_VERSION,
        source,
        sourceType: currentImageData ? (hostedUrl ? 'hosted-local' : 'local') : 'remote',
        hostedAt: hostedUrl && hostedAt ? new Date(hostedAt).toISOString() : null,
        expiresAt: hostedUrl && hostedExpiresAt ? new Date(hostedExpiresAt).toISOString() : null,
        selectedEngines: activeEngines.map((eng) => ({ id: eng, name: SEARCH_ENGINES[eng]?.name || eng })),
        hashes: lastHashes,
        originalHashes,
        localMetadata: currentFileMetadata,
        provenance: currentProvenance,
        preprocessing: lastPreprocessing,
        batchCount: currentBatch.length,
        dispatches: dispatches.map(({ target, ...dispatch }) => ({ ...dispatch, targetHost: new URL(target).host }))
    });
}

function exportCaseFile() {
    const data = buildCasePayload();
    if (!data) { showToast('Load an image first', '⚠️', true); return; }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `imagexpert_case_${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(url);
    showToast('Case file exported');
}

function clearImage() {
    currentImageUrl = '';
    currentImageData = null;
    hostedUrl = null;
    hostedAt = null;
    hostedExpiresAt = null;
    currentBatch = [];
    lastHashes = null;
    originalHashes = null;
    roiOriginalSource = '';
    currentFileMetadata = null;
    currentProvenance = { status: 'not-checked', signatureValidity: 'unknown', trust: 'unknown', detail: 'Load a local file to inspect provenance.' };
    lastPreprocessing = [];
    dispatches = [];
    previewImage.src = '';
    dropZone.classList.remove('has-image');
    urlInput.value = '';
    imageInfo.textContent = 'Ready';
    document.getElementById('hashGrid').innerHTML = '';
    renderFileMetadata();
    renderBatch();
    renderDispatchQueue();
}

function renderHistory() {
    const list = document.getElementById('historyList');
    list.replaceChildren();
    if (history.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'history-empty';
        empty.textContent = 'No searches yet';
        list.append(empty);
        return;
    }
    history.forEach((item, index) => {
        const availability = Core.historyAvailability(item);
        const transientUnavailable = ['expired', 'expiry-unknown'].includes(availability);
        const row = document.createElement('div');
        row.className = 'history-item';
        row.classList.toggle('expired', transientUnavailable);
        if (Core.isApprovedImageSource(item.thumb)) {
            const image = document.createElement('img');
            image.className = 'history-thumb';
            image.src = item.thumb;
            image.alt = 'Search history thumbnail';
            image.loading = 'lazy';
            image.addEventListener('error', () => image.remove());
            row.append(image);
        }
        const info = document.createElement('div');
        info.className = 'history-info';
        const time = document.createElement('div');
        time.className = 'history-time';
        time.textContent = formatTime(item.time);
        const engines = document.createElement('div');
        engines.className = 'history-engines';
        engines.textContent = item.engines.map((id) => SEARCH_ENGINES[id]?.name || id).join(', ');
        const availabilityLabel = document.createElement('div');
        availabilityLabel.className = 'history-availability';
        availabilityLabel.textContent = availability === 'active'
            ? `Hosted URL available until ${new Date(item.expiresAt).toLocaleTimeString(activeLocale)}`
            : availability === 'expired'
                ? 'Hosted URL expired — reselect the local file or open manual engine pages'
                : availability === 'expiry-unknown'
                    ? 'Legacy hosted URL expiry unknown — reselect the local file or use manual pages'
                    : 'Remote URL';
        const actions = document.createElement('div');
        actions.className = 'history-actions';
        const availableActions = transientUnavailable
            ? [
                ['📂 Reselect', () => reselectHistoryFile(index)],
                ['↗ Manual pages', () => openManualHistoryEngines(index)],
                ['🔗 Copy', () => copyHistoryUrl(index)],
                ['🗑️ Remove', () => removeFromHistory(index)]
            ]
            : [
                ['🔍 Search', () => searchFromHistory(index)],
                ['🔗 Copy', () => copyHistoryUrl(index)],
                ['🗑️ Remove', () => removeFromHistory(index)]
            ];
        availableActions.forEach(([label, action]) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'history-btn';
            button.textContent = label;
            button.addEventListener('click', action);
            actions.append(button);
        });
        info.append(time, engines, availabilityLabel, actions);
        row.append(info);
        list.append(row);
    });
}

function formatTime(ts) {
    const diff = Date.now() - ts;
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return new Date(ts).toLocaleDateString(activeLocale);
}

window.searchFromHistory = (i) => {
    const item = history[i];
    if (Core.historyAvailability(item) !== 'remote' && Core.historyAvailability(item) !== 'active') {
        showToast('That temporary hosted URL is no longer safe to dispatch. Reselect the local file or use manual pages.', '⚠️', true);
        return;
    }
    closePanel();
    if (item.thumb.startsWith('data:')) loadImage(item.thumb, true);
    else { urlInput.value = item.url; loadImage(item.url, false); }
};
window.reselectHistoryFile = () => { closePanel(); fileInput.click(); };
window.openManualHistoryEngines = (i) => {
    const item = history[i];
    const available = item.engines.filter((id) => SEARCH_ENGINES[id]);
    if (available.length) {
        activeEngines = available;
        document.querySelectorAll('.engine-toggle').forEach((button) => {
            const active = activeEngines.includes(button.dataset.engine);
            button.classList.toggle('active', active);
            button.setAttribute('aria-pressed', String(active));
        });
        updateEngineSelectionCount();
    }
    closePanel();
    queueSelectedEngines(null, true, `history-${item.id}`);
    showToast('Manual upload pages queued; no expired URL will be sent.', '↗');
};
window.copyHistoryUrl = (i) => { navigator.clipboard.writeText(history[i].url); showToast('URL copied!'); };
window.removeFromHistory = (i) => { history.splice(i, 1); saveHistoryData(); renderHistory(); showToast('Removed'); };

function openPanel(id) {
    const target = document.getElementById(id);
    lastFocusedElement = document.activeElement;
    target.classList.add('open');
    target.inert = false;
    target.setAttribute('aria-hidden', 'false');
    document.getElementById('overlay').classList.add('show');
    if (id === 'panel') renderHistory();
    target.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')?.focus();
}

function closePanel() {
    document.querySelectorAll('.panel').forEach((panel) => {
        panel.classList.remove('open');
        panel.setAttribute('aria-hidden', 'true');
        panel.inert = true;
    });
    document.getElementById('overlay').classList.remove('show');
    lastFocusedElement?.focus?.();
    lastFocusedElement = null;
}

function updateEngineSelectionCount() {
    document.getElementById('engineSelectionCount').textContent = `${activeEngines.length} selected`;
}

function appendCustomEngineControls() {
    const bar = document.querySelector('.engines-bar');
    customEngineManifest.engines
        .slice()
        .sort((a, b) => a.order - b.order)
        .forEach((record) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'engine-toggle';
            button.dataset.engine = record.id;
            button.setAttribute('aria-pressed', 'false');
            const dot = document.createElement('span');
            dot.className = 'engine-dot';
            const name = document.createElement('span');
            name.className = 'engine-name';
            name.textContent = record.displayName;
            const metadata = document.createElement('span');
            metadata.className = 'engine-meta';
            metadata.textContent = 'custom';
            button.append(dot, name, metadata);
            bar.append(button);
        });
    document.getElementById('customEngineSummary').textContent = customEngineManifest.engines.length
        ? `${customEngineManifest.engines.length} custom engine${customEngineManifest.engines.length === 1 ? '' : 's'} installed.`
        : 'No custom engines installed. Imports are data-only HTTPS templates.';
    const backup = sessionStorage.getItem('rs_custom_engine_backup');
    document.getElementById('undoEnginesBtn').hidden = !backup;
}

document.addEventListener('keydown', (event) => {
    const panel = document.querySelector('.panel.open');
    if (!panel) return;
    if (event.key === 'Escape') {
        event.preventDefault();
        closePanel();
        return;
    }
    if (event.key !== 'Tab') return;
    const focusable = [...panel.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')]
        .filter((element) => element.offsetParent !== null);
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
    }
});

appendCustomEngineControls();

// Engine toggles
document.querySelectorAll('.engine-toggle').forEach(t => {
    const eng = t.dataset.engine;
    const metadata = SEARCH_ENGINES[eng];
    const control = engineControlMetadata(metadata);
    t.title = control.title;
    t.querySelector('.engine-meta').textContent = control.summary;
    t.disabled = !control.enabled;
    t.classList.toggle('active', activeEngines.includes(eng));
    t.setAttribute('aria-pressed', String(activeEngines.includes(eng)));
    t.addEventListener('click', () => {
        if (!t.classList.contains('active') && SEARCH_ENGINES[eng]?.consentNotice) {
            const accepted = confirm(`${SEARCH_ENGINES[eng].consentNotice}\n\nAdd this manual-only engine? It will still require a separate click before opening.`);
            if (!accepted) return;
        }
        t.classList.toggle('active');
        t.setAttribute('aria-pressed', String(t.classList.contains('active')));
        if (t.classList.contains('active')) { if (!activeEngines.includes(eng)) activeEngines.push(eng); }
        else activeEngines = activeEngines.filter(e => e !== eng);
        updateEngineSelectionCount();
        saveSettings();
    });
});

// Drop zone
dropZone.addEventListener('click', (e) => { if (!dropZone.classList.contains('has-image') && !e.target.closest('.preview-actions')) fileInput.click(); });
dropZone.addEventListener('keydown', (event) => {
    if ((event.key === 'Enter' || event.key === ' ') && !dropZone.classList.contains('has-image')) {
        event.preventDefault();
        fileInput.click();
    }
});
dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragover'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    const files = e.dataTransfer.files;
    if (files && files.length) loadFromFiles(files);
    else {
        const url = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain');
        if (url && url.match(/^https?:\/\/.+/i)) { urlInput.value = url; loadFromUrl(url); }
    }
});

fileInput.addEventListener('change', (e) => { if (e.target.files[0]) loadFromFiles(e.target.files); });
document.getElementById('cameraBtn').addEventListener('click', (event) => {
    event.stopPropagation();
    document.getElementById('cameraInput').click();
});
document.getElementById('cameraInput').addEventListener('change', (event) => {
    if (event.target.files[0]) loadFromFile(event.target.files[0]);
});

// Global paste
document.addEventListener('paste', (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) { if (item.type.startsWith('image/')) { e.preventDefault(); loadFromFile(item.getAsFile()); return; } }
    const text = e.clipboardData.getData('text');
    if (text && text.match(/^https?:\/\/.+\.(jpg|jpeg|png|gif|webp|bmp|svg)/i)) { e.preventDefault(); urlInput.value = text; loadFromUrl(text); }
});

// URL input
urlInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') loadFromUrl(urlInput.value.trim()); });
document.getElementById('urlSearchBtn').addEventListener('click', () => loadFromUrl(urlInput.value.trim()));

// Actions
document.getElementById('searchAgainBtn').addEventListener('click', () => {
    if (hostedUrl) performSearch(hostedUrl, false);
    else if (currentImageUrl) performSearch(currentImageUrl, false);
    else if (currentImageData) performSearch(currentImageData, true);
});

document.getElementById('copyLinkBtn').addEventListener('click', () => {
    const url = hostedUrl || currentImageUrl;
    if (url) { navigator.clipboard.writeText(url); showToast('Link copied!'); }
    else showToast('No link available', '⚠️', true);
});

document.getElementById('downloadBtn').addEventListener('click', () => {
    const url = hostedUrl || currentImageUrl || currentImageData;
    if (url) { const link = document.createElement('a'); link.href = url; link.download = `image_${Date.now()}.jpg`; link.click(); showToast('Download started'); }
});

document.getElementById('exportCaseBtn').addEventListener('click', exportCaseFile);
document.getElementById('rotateBtn').addEventListener('click', () => preprocessCurrentImage('rotate'));
document.getElementById('cropBtn').addEventListener('click', () => preprocessCurrentImage('crop'));
document.getElementById('trimBtn').addEventListener('click', () => preprocessCurrentImage('trim'));
document.getElementById('roiBtn').addEventListener('click', beginRegionSelection);
document.getElementById('roiResetBtn').addEventListener('click', () => {
    if (!roiOriginalSource) return;
    loadImage(roiOriginalSource, roiOriginalSource.startsWith('data:'), true);
    lastPreprocessing = lastPreprocessing.filter((item) => item.mode !== 'region');
    document.getElementById('roiResetBtn').hidden = true;
    showToast('Original image restored.');
});
{
    const roiCanvas = document.getElementById('roiCanvas');
    let roiStart = null;
    let keyboardRegion = null;
    const drawKeyboardRegion = () => {
        const context = roiCanvas.getContext('2d');
        context.clearRect(0, 0, roiCanvas.width, roiCanvas.height);
        context.strokeStyle = '#00ff88';
        context.lineWidth = 3;
        context.strokeRect(keyboardRegion.x, keyboardRegion.y, keyboardRegion.width, keyboardRegion.height);
    };
    roiCanvas.addEventListener('focus', () => {
        keyboardRegion = {
            x: roiCanvas.width * 0.25,
            y: roiCanvas.height * 0.25,
            width: roiCanvas.width * 0.5,
            height: roiCanvas.height * 0.5
        };
        drawKeyboardRegion();
    });
    roiCanvas.addEventListener('keydown', (event) => {
        if (!keyboardRegion) return;
        if (event.key === 'Escape') {
            event.preventDefault();
            roiCanvas.hidden = true;
            roiCanvas.getContext('2d').clearRect(0, 0, roiCanvas.width, roiCanvas.height);
            document.getElementById('roiBtn').focus();
            showToast('Region selection cancelled.', '↩');
            return;
        }
        if (event.key === 'Enter') {
            event.preventDefault();
            applyRegionSelection(
                { x: keyboardRegion.x, y: keyboardRegion.y },
                { x: keyboardRegion.x + keyboardRegion.width, y: keyboardRegion.y + keyboardRegion.height }
            );
            return;
        }
        const directions = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
        if (!directions[event.key]) return;
        event.preventDefault();
        const [horizontal, vertical] = directions[event.key];
        const step = Math.max(4, Math.round(Math.min(roiCanvas.width, roiCanvas.height) * 0.03));
        if (event.shiftKey) {
            keyboardRegion.width = Math.max(24, Math.min(roiCanvas.width - keyboardRegion.x, keyboardRegion.width + horizontal * step));
            keyboardRegion.height = Math.max(24, Math.min(roiCanvas.height - keyboardRegion.y, keyboardRegion.height + vertical * step));
        } else {
            keyboardRegion.x = Math.max(0, Math.min(roiCanvas.width - keyboardRegion.width, keyboardRegion.x + horizontal * step));
            keyboardRegion.y = Math.max(0, Math.min(roiCanvas.height - keyboardRegion.height, keyboardRegion.y + vertical * step));
        }
        drawKeyboardRegion();
    });
    roiCanvas.addEventListener('pointerdown', (event) => {
        roiCanvas.setPointerCapture(event.pointerId);
        const rect = roiCanvas.getBoundingClientRect();
        roiStart = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    });
    roiCanvas.addEventListener('pointermove', (event) => {
        if (!roiStart) return;
        const rect = roiCanvas.getBoundingClientRect();
        const end = { x: event.clientX - rect.left, y: event.clientY - rect.top };
        const context = roiCanvas.getContext('2d');
        context.clearRect(0, 0, roiCanvas.width, roiCanvas.height);
        context.strokeStyle = '#00ff88';
        context.lineWidth = 3;
        context.strokeRect(roiStart.x, roiStart.y, end.x - roiStart.x, end.y - roiStart.y);
    });
    roiCanvas.addEventListener('pointerup', (event) => {
        if (!roiStart) return;
        const rect = roiCanvas.getBoundingClientRect();
        const end = { x: event.clientX - rect.left, y: event.clientY - rect.top };
        const start = roiStart;
        roiStart = null;
        applyRegionSelection(start, end);
    });
}
document.getElementById('hashGrid').addEventListener('click', (e) => {
    const card = e.target.closest('[data-copy]');
    if (!card) return;
    navigator.clipboard.writeText(card.dataset.copy);
    showToast('Hash copied');
});
document.getElementById('clearBtn').addEventListener('click', clearImage);
document.getElementById('openQueuedBtn').addEventListener('click', () => {
    dispatches
        .filter((dispatch) => ['queued', 'manual-only', 'blocked', 'failed'].includes(dispatch.status))
        .forEach(openDispatch);
});
cancelOperationBtn.addEventListener('click', () => activeOperation?.abort('user'));
document.getElementById('privacyModeBtn').addEventListener('click', () => setExternalUploadEnabled(settings.noUpload));

// Panels
document.getElementById('historyBtn').addEventListener('click', () => openPanel('panel'));
document.getElementById('helpBtn').addEventListener('click', () => openPanel('helpPanel'));
document.getElementById('panelClose').addEventListener('click', closePanel);
document.getElementById('helpClose').addEventListener('click', closePanel);
document.getElementById('overlay').addEventListener('click', closePanel);
document.getElementById('copyDiagnosticsBtn').addEventListener('click', async () => {
    await navigator.clipboard.writeText(JSON.stringify(supportReport(), null, 2));
    showToast('Redacted support report copied.');
});
document.getElementById('exportDiagnosticsBtn').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(supportReport(), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `imagexpert_diagnostics_${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(url);
});
document.getElementById('clearDiagnosticsBtn').addEventListener('click', () => {
    diagnostics = [];
    renderDiagnostics();
});
document.getElementById('importEnginesBtn').addEventListener('click', () => document.getElementById('engineManifestInput').click());
document.getElementById('engineManifestInput').addEventListener('change', async (event) => {
    const file = event.target.files[0];
    event.target.value = '';
    if (!file) return;
    if (file.size > 64 * 1024) {
        showToast('Engine manifest exceeds the 64 KB limit.', '⚠️', true);
        return;
    }
    try {
        const next = Core.validateEngineManifest(await file.text());
        const conflicts = next.engines.filter((engine) => BUILTIN_ENGINE_IDS.includes(engine.id));
        if (conflicts.length) throw new Error(`IDs conflict with built-in engines: ${conflicts.map((engine) => engine.id).join(', ')}`);
        const currentIds = new Set(customEngineManifest.engines.map((engine) => engine.id));
        const nextIds = new Set(next.engines.map((engine) => engine.id));
        const added = [...nextIds].filter((id) => !currentIds.has(id));
        const removed = [...currentIds].filter((id) => !nextIds.has(id));
        const preview = [
            `${next.engines.length} validated HTTPS engine${next.engines.length === 1 ? '' : 's'}.`,
            added.length ? `Add: ${added.join(', ')}` : 'Add: none',
            removed.length ? `Remove: ${removed.join(', ')}` : 'Remove: none',
            'No scripts or custom code will execute.'
        ].join('\n');
        if (!confirm(`${preview}\n\nApply this manifest?`)) return;
        sessionStorage.setItem('rs_custom_engine_backup', JSON.stringify(customEngineManifest));
        localStorage.setItem('rs_custom_engines', JSON.stringify(next));
        location.reload();
    } catch (error) {
        showToast(`Engine import rejected: ${error.message}`, '⚠️', true);
    }
});
document.getElementById('exportEnginesBtn').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(customEngineManifest, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'imagexpert_engines.json';
    link.click();
    URL.revokeObjectURL(url);
});
document.getElementById('undoEnginesBtn').addEventListener('click', () => {
    const backup = sessionStorage.getItem('rs_custom_engine_backup');
    if (!backup) return;
    localStorage.setItem('rs_custom_engines', backup);
    sessionStorage.removeItem('rs_custom_engine_backup');
    location.reload();
});
document.getElementById('clearHistoryBtn').addEventListener('click', () => {
    const button = document.getElementById('clearHistoryBtn');
    if (historyUndo) {
        history = historyUndo;
        historyUndo = null;
        saveHistoryData();
        renderHistory();
        button.innerHTML = '<span>🗑️</span> Clear All History';
        showToast('History restored');
        return;
    }
    if (history.length === 0) return;
    if (!confirm(`Clear ${history.length} history record${history.length > 1 ? 's' : ''}?`)) return;
    historyUndo = history;
    history = [];
    saveHistoryData();
    renderHistory();
    button.textContent = '↶ Undo Clear History';
    showToast('History cleared. Undo is available for 10 seconds.', '↶');
    setTimeout(() => {
        historyUndo = null;
        button.innerHTML = '<span>🗑️</span> Clear All History';
    }, 10000);
});

// Settings
document.getElementById('autoSearchToggle').addEventListener('click', function() { this.classList.toggle('on'); settings.autoSearch = this.classList.contains('on'); this.setAttribute('aria-checked', String(settings.autoSearch)); saveSettings(); });
document.getElementById('saveHistoryToggle').addEventListener('click', function() { this.classList.toggle('on'); settings.saveHistory = this.classList.contains('on'); this.setAttribute('aria-checked', String(settings.saveHistory)); saveSettings(); });
document.getElementById('noUploadToggle').addEventListener('click', () => setExternalUploadEnabled(settings.noUpload));

// Init
document.getElementById('autoSearchToggle').classList.toggle('on', settings.autoSearch);
document.getElementById('saveHistoryToggle').classList.toggle('on', settings.saveHistory);
document.getElementById('noUploadToggle').classList.toggle('on', settings.noUpload);
document.getElementById('autoSearchToggle').setAttribute('aria-checked', String(settings.autoSearch));
document.getElementById('saveHistoryToggle').setAttribute('aria-checked', String(settings.saveHistory));
syncPrivacyUI();
updateEngineSelectionCount();
if (matchMedia('(max-width: 768px), (min-width: 769px) and (max-height: 800px)').matches) {
    document.getElementById('enginePicker').removeAttribute('open');
}
saveSettings();
saveHistoryData();
renderHistory();

const params = new URLSearchParams(window.location.search);
const prefillImage = params.get('image') || params.get('url');
if (prefillImage && /^https?:\/\/.+/i.test(prefillImage)) {
    urlInput.value = prefillImage;
    loadFromUrl(prefillImage);
}

const updateRecovery = Core.safeParse(sessionStorage.getItem('rs_update_recovery'), null);
sessionStorage.removeItem('rs_update_recovery');
if (!prefillImage && updateRecovery?.source && Core.isHttpUrl(updateRecovery.source)) {
    urlInput.value = updateRecovery.source;
    document.getElementById('textContextInput').value = String(updateRecovery.textContext || '').slice(0, 300);
    loadImage(updateRecovery.source, false, true);
    showToast('Remote investigation restored after the app update.', '↻');
} else if (updateRecovery?.localFilePending) {
    showToast('App updated. Reselect the local file to continue.', '↻');
}

function renderLifecycleState(state) {
    const messages = {
        offline: 'Offline — local analysis and the cached shell remain available.',
        online: 'Connection restored.',
        installing: 'A new ImageXpert version is downloading in the background.',
        'update-ready': 'Update ready. Save the current workspace and reload when convenient.',
        activating: 'Saving workspace and activating the update…',
        activated: 'Update activated. Reloading…',
        'install-failed': 'Update download failed. The current offline version remains available.'
    };
    lifecycleBanner.dataset.state = state;
    lifecycleText.textContent = messages[state] || 'ImageXpert is ready.';
    lifecycleBanner.hidden = !messages[state] || ['online'].includes(state);
    activateUpdateBtn.hidden = state !== 'update-ready';
}

function persistWorkspaceForUpdate() {
    saveSettings();
    saveHistoryData();
    sessionStorage.setItem('rs_update_recovery', JSON.stringify({
        source: currentImageUrl || '',
        localFilePending: Boolean(currentImageData),
        textContext: document.getElementById('textContextInput').value.slice(0, 300)
    }));
}

activateUpdateBtn.addEventListener('click', async () => {
    if (!activatePendingUpdate) return;
    activateUpdateBtn.disabled = true;
    try {
        await activatePendingUpdate();
    } catch (error) {
        activateUpdateBtn.disabled = false;
        recordDiagnostic({ phase: 'service-worker-activate', error });
        renderLifecycleState('install-failed');
    }
});

window.addEventListener('offline', () => {
    recordDiagnostic({ phase: 'network', error: new Error('Offline'), detail: 'Local analysis remains available; external dispatch is unavailable.' });
    renderLifecycleState('offline');
    showToast('Offline: local analysis works, but uploads and engine dispatch may fail.', '⚠️', true);
});
window.addEventListener('online', () => {
    recordDiagnostic({ phase: 'network', detail: 'online' });
    if (!activatePendingUpdate) renderLifecycleState('online');
});

{
    const startedAt = performance.now();
    registerServiceWorker({
        beforeActivate: persistWorkspaceForUpdate,
        onUpdateReady: (activate) => {
            activatePendingUpdate = activate;
            renderLifecycleState('update-ready');
        },
        onStateChange: (state) => {
            recordDiagnostic({ phase: 'service-worker-state', detail: state });
            if (!['registered'].includes(state)) renderLifecycleState(state);
        }
    })
        .then(({ status }) => recordDiagnostic({ phase: 'service-worker', startedAt, detail: status }))
        .catch((error) => {
            recordDiagnostic({ phase: 'service-worker', startedAt, error });
            showToast('Offline shell registration failed. Online use is unaffected.', '⚠️', true);
        });
}

if (['127.0.0.1', 'localhost'].includes(location.hostname)) {
    Object.defineProperty(window, '__ImageXpertTest', {
        value: Object.freeze({
            loadFromUrl,
            loadFromFile,
            performSearch,
            performBatchSearch,
            exportCaseFile,
            getCasePayload: () => structuredClone(buildCasePayload()),
            openDispatch,
            setSettings: (next) => {
                if (Object.hasOwn(next, 'externalUploadConsent')) {
                    externalUploadAuthorized = Boolean(next.externalUploadConsent);
                }
                const { externalUploadConsent, ...persistable } = next;
                settings = { ...settings, ...persistable };
                syncPrivacyUI();
            },
            setHistory: (next) => {
                history = Core.normalizeHistory(next, Object.keys(SEARCH_ENGINES));
                renderHistory();
            },
            getState: () => ({
                history: structuredClone(history),
                dispatches: structuredClone(dispatches),
                diagnostics: structuredClone(diagnostics),
                settings: structuredClone(settings),
                externalUploadAuthorized,
                currentBatch: currentBatch.map(({ dataUrl, ...item }) => ({ ...item, hasData: Boolean(dataUrl) }))
            })
        })
    });
}
