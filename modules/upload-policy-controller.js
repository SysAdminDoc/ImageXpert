export function recipientNames(engineIds, registry) {
    return engineIds.map((id) => registry[id]?.name || id);
}

export function createUploadConsentMessage(recipients) {
    return [
        'Enable external upload for this browser session?',
        '',
        'Litterbox receives the file and your IP address, stores upload metadata and the file unencrypted, and returns a public URL with 1-hour retention.',
        '',
        `Selected recipients: ${recipients.length ? recipients.join(', ') : 'none selected'}`,
        '',
        'Policy: https://catbox.moe/legal.php',
        '',
        'This authorization will be forgotten when the page is reopened.'
    ].join('\n');
}

export function hostedWindow(now, retentionMilliseconds) {
    return Object.freeze({ hostedAt: now, expiresAt: now + retentionMilliseconds });
}
