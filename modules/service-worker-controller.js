export async function registerServiceWorker({
    navigatorObject = navigator,
    locationObject = location,
    scriptUrl = './sw.js'
} = {}) {
    if (!('serviceWorker' in navigatorObject)) return { status: 'unsupported' };
    if (!['https:', 'http:'].includes(locationObject.protocol)) return { status: 'unsupported' };
    const registration = await navigatorObject.serviceWorker.register(scriptUrl);
    return { status: 'registered', registration };
}
