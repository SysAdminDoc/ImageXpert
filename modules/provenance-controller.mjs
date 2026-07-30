export const C2PA_ADAPTER_CONTRACT_VERSION = 1;
export const MINIMUM_C2PA_WEB_VERSION = '0.8.3';
export const MAX_PROVENANCE_BYTES = 25 * 1024 * 1024;
export const MAX_PROVENANCE_PIXELS = 40_000_000;
export const PROVENANCE_TIMEOUT_MS = 5_000;

function parseVersion(version) {
    const match = String(version ?? '').match(/^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/);
    return match ? match.slice(1).map(Number) : null;
}

function versionAtLeast(version, minimum) {
    const candidate = parseVersion(version);
    const floor = parseVersion(minimum);
    if (!candidate || !floor) return false;
    for (let index = 0; index < 3; index += 1) {
        if (candidate[index] !== floor[index]) return candidate[index] > floor[index];
    }
    return true;
}

export function adapterCompatibility(adapter) {
    if (!adapter || typeof adapter !== 'object') return { compatible: false, reason: 'Optional C2PA adapter is not installed.' };
    if (adapter.contractVersion !== C2PA_ADAPTER_CONTRACT_VERSION) {
        return { compatible: false, reason: `Unsupported adapter contract ${String(adapter.contractVersion ?? 'unknown')}.` };
    }
    if (adapter.sdk?.name !== '@contentauth/c2pa-web') {
        return { compatible: false, reason: 'Adapter must identify @contentauth/c2pa-web.' };
    }
    if (!versionAtLeast(adapter.sdk.version, MINIMUM_C2PA_WEB_VERSION)) {
        return { compatible: false, reason: `Rejected affected or invalid c2pa-web version; ${MINIMUM_C2PA_WEB_VERSION}+ is required.` };
    }
    if (adapter.execution !== 'worker' || adapter.abortable !== true) {
        return { compatible: false, reason: 'Adapter must be abortable and execute parsing in a worker.' };
    }
    if (typeof adapter.inspect !== 'function') return { compatible: false, reason: 'Adapter inspect function is missing.' };
    return { compatible: true, reason: '' };
}

function outcome(status, signatureValidity, trust, detail) {
    return Object.freeze({ status, signatureValidity, trust, detail: String(detail).slice(0, 200) });
}

export async function inspectProvenance(file, {
    dimensions = {},
    adapter = globalThis.ImageXpertC2PAAdapter,
    timeoutMs = PROVENANCE_TIMEOUT_MS
} = {}) {
    const compatibility = adapterCompatibility(adapter);
    if (!compatibility.compatible) return outcome('unsupported', 'unknown', 'unknown', compatibility.reason);
    if (!file || !Number.isFinite(file.size) || file.size < 0 || file.size > MAX_PROVENANCE_BYTES) {
        return outcome('budget-rejected', 'unknown', 'unknown', `File exceeds the ${MAX_PROVENANCE_BYTES / 1024 / 1024} MB provenance budget.`);
    }
    const pixels = Number(dimensions.width || 0) * Number(dimensions.height || 0);
    if (pixels > MAX_PROVENANCE_PIXELS) {
        return outcome('budget-rejected', 'unknown', 'unknown', `Image exceeds the ${MAX_PROVENANCE_PIXELS.toLocaleString('en-US')} pixel provenance budget.`);
    }

    const controller = new AbortController();
    let timeout;
    try {
        const result = await Promise.race([
            Promise.resolve().then(async () => {
                const bytes = new Uint8Array(await file.arrayBuffer());
                return adapter.inspect(bytes, { signal: controller.signal });
            }),
            new Promise((_, reject) => {
                timeout = setTimeout(() => {
                    controller.abort('timeout');
                    reject(new DOMException('C2PA inspection timed out', 'TimeoutError'));
                }, Math.max(1, Math.min(Number(timeoutMs) || PROVENANCE_TIMEOUT_MS, PROVENANCE_TIMEOUT_MS)));
            })
        ]);
        if (!result || typeof result !== 'object') {
            return outcome('unreadable', 'unknown', 'unknown', 'Adapter returned a malformed result.');
        }
        if (!result.manifest) return outcome('no-manifest', 'unknown', 'unknown', 'No C2PA manifest was found.');
        const signatureValidity = result.valid === true ? 'valid' : result.valid === false ? 'invalid' : 'unknown';
        const trust = ['trusted', 'untrusted', 'unknown'].includes(result.trust) ? result.trust : 'unknown';
        const status = signatureValidity === 'valid' ? 'manifest-valid' : signatureValidity === 'invalid' ? 'manifest-invalid' : 'manifest-unknown';
        const detail = result.detail || (
            signatureValidity === 'valid'
                ? 'Manifest signature validated; trust is evaluated separately.'
                : signatureValidity === 'invalid'
                    ? 'Manifest signature validation failed.'
                    : 'Manifest validity could not be determined.'
        );
        return outcome(status, signatureValidity, trust, detail);
    } catch (error) {
        const timedOut = error?.name === 'TimeoutError' || controller.signal.reason === 'timeout';
        return outcome(timedOut ? 'timeout' : 'unreadable', 'unknown', 'unknown', timedOut ? 'C2PA inspection exceeded 5 seconds.' : (error?.message || 'C2PA inspection failed.'));
    } finally {
        clearTimeout(timeout);
        controller.abort('complete');
    }
}
