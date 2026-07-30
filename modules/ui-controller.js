export function formatBytes(bytes, locale) {
    if (!Number.isFinite(bytes)) return 'Unknown';
    if (bytes < 1024) return `${new Intl.NumberFormat(locale).format(bytes)} B`;
    if (bytes < 1024 * 1024) return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(bytes / 1024)} KB`;
    return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(bytes / 1024 / 1024)} MB`;
}
