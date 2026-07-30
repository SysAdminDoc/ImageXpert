export function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (character) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    })[character]);
}

export function escapeAttribute(value) {
    return escapeHtml(value).replace(/`/g, '&#96;');
}

export function createDispatchId(engineId, now = Date.now(), random = Math.random()) {
    return `${engineId}-${now}-${random.toString(36).slice(2, 7)}`;
}
