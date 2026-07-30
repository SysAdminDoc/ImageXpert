export function engineControlMetadata(engine) {
    return {
        title: `${engine.host} • ${engine.capabilities.join(', ')} • ${engine.maintenance}`,
        summary: engine.maintenance === 'active' ? engine.input.replaceAll('-', ' ') : engine.maintenance,
        enabled: engine.maintenance === 'active'
    };
}
