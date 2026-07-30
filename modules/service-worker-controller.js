export async function registerServiceWorker({
    navigatorObject = navigator,
    locationObject = location,
    scriptUrl = './sw.js',
    onStateChange = () => {},
    onUpdateReady = () => {},
    beforeActivate = async () => {}
} = {}) {
    if (!('serviceWorker' in navigatorObject)) return { status: 'unsupported' };
    if (!['https:', 'http:'].includes(locationObject.protocol)) return { status: 'unsupported' };

    let reloading = false;
    let activationRequested = false;
    let reportedWaitingWorker = null;
    let registration = await navigatorObject.serviceWorker.register(scriptUrl);
    const activateWaitingWorker = async () => {
        const waiting = registration.waiting;
        if (!waiting) return false;
        await beforeActivate();
        activationRequested = true;
        onStateChange('activating');
        waiting.postMessage({ type: 'SKIP_WAITING' });
        return true;
    };
    const reportWaiting = () => {
        if (!registration.waiting) return;
        if (registration.waiting === reportedWaitingWorker) return;
        reportedWaitingWorker = registration.waiting;
        onStateChange('update-ready');
        onUpdateReady(activateWaitingWorker);
    };
    const refreshWaiting = async () => {
        const current = await navigatorObject.serviceWorker.getRegistration();
        if (current?.waiting) registration = current;
        reportWaiting();
    };
    const watchInstalling = (worker) => {
        if (!worker) return;
        onStateChange('installing');
        worker.addEventListener('statechange', () => {
            if (worker.state === 'installed' && navigatorObject.serviceWorker.controller) reportWaiting();
            if (worker.state === 'redundant') onStateChange('install-failed');
        });
    };

    if (registration.waiting) reportWaiting();
    registration.addEventListener('updatefound', () => watchInstalling(registration.installing));
    if (registration.installing) watchInstalling(registration.installing);
    setInterval(() => refreshWaiting().catch(() => {}), 1_000);
    navigatorObject.serviceWorker.addEventListener('controllerchange', () => {
        if (!activationRequested || reloading) return;
        reloading = true;
        onStateChange('activated');
        locationObject.reload();
    });
    onStateChange(registration.waiting ? 'update-ready' : 'registered');
    return { status: registration.waiting ? 'update-ready' : 'registered', registration, activateWaitingWorker };
}
