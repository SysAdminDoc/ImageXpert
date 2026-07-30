export function settingsForStorage(settings) {
    const persisted = { ...settings, noUpload: true };
    delete persisted.externalUploadConsent;
    return persisted;
}

export function createCasePayload({
    appVersion,
    source,
    sourceType,
    hostedAt,
    expiresAt,
    selectedEngines,
    hashes,
    originalHashes,
    localMetadata,
    provenance,
    preprocessing,
    batchCount,
    dispatches,
    now = new Date()
}) {
    return {
        app: 'ImageXpert',
        schemaVersion: 3,
        version: appVersion,
        createdAt: now.toISOString(),
        source,
        sourceType,
        hostedAt,
        expiresAt,
        selectedEngines,
        hashes,
        originalHashes,
        localMetadata,
        provenance,
        preprocessing,
        batchCount,
        dispatches
    };
}
