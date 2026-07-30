(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.ImageXpertI18n = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const VERSION = 2;
    const STORAGE_KEY = 'rs_locale';
    const en = Object.freeze({
        'app.name': 'ImageXpert',
        'nav.history': 'History',
        'nav.help': 'How it works',
        'lifecycle.ready': 'ImageXpert is ready.',
        'lifecycle.reload': 'Save and reload',
        'workspace.kicker': 'Private visual intelligence workspace',
        'workspace.title': 'Trace an image across the open web',
        'workspace.capabilities': 'Workspace capabilities',
        'workspace.engines': '12 built-in engines',
        'workspace.local': 'Processed in this browser',
        'intake.label': 'Image intake and dispatch',
        'drop.label': 'Choose image or video files',
        'drop.title': 'Drop an image or short video',
        'drop.subtitle': 'Local files stay on this device unless you explicitly enable a 1-hour external upload.',
        'drop.file': '📁 Drop a file',
        'drop.paste': '📋 Paste an image',
        'drop.browse': '🖱️ Click to browse',
        'drop.camera': '📱 Camera',
        'preview.alt': 'Selected image preview',
        'roi.label': 'Image region selector',
        'roi.instructions': 'Drag to select. With a keyboard, use arrow keys to move the selection, Shift plus arrow keys to resize it, Enter to apply, or Escape to cancel.',
        'state.ready': 'Ready',
        'action.searchAgain': '🔍 Search Again',
        'action.copyLink': '🔗 Copy Link',
        'action.exportCase': 'Export Case',
        'action.importCase': 'Import Case',
        'action.download': '⬇️ Download',
        'action.clear': '✕ Clear',
        'preprocess.heading': 'Local preprocess',
        'preprocess.rotate': 'Rotate 90',
        'preprocess.crop': 'Center Crop',
        'preprocess.trim': 'Trim Bottom Strip',
        'preprocess.roi': 'Select Region',
        'preprocess.roiReset': 'Reset Region',
        'context.label': 'Optional Bing text context',
        'url.heading': 'Paste image URL',
        'url.label': 'Public image URL',
        'url.placeholder': 'https://example.com/image.jpg',
        'url.search': 'Search URL',
        'url.note': 'Enter a direct image URL to open it across your selected search engines.',
        'dispatch.heading': 'Engine dispatch queue',
        'dispatch.empty': 'Nothing queued',
        'dispatch.open': 'Open queued engines',
        'rail.label': 'Search configuration',
        'privacy.local': 'Local-only mode',
        'privacy.external': 'External upload enabled',
        'privacy.localDescription': 'Local files stay on this device. Engines open their manual upload pages.',
        'privacy.externalDescription': 'Session only: local files become public Litterbox URLs for 1 hour, then selected engines receive those URLs.',
        'privacy.policy': 'Catbox terms and privacy policy',
        'privacy.enable': 'Enable external upload',
        'privacy.disable': 'Use local-only mode',
        'engines.summary': 'Search engines',
        'engines.selected': '{count} selected',
        'engines.note': 'Engine pages open in your browser. Files remain local unless you deliberately switch to the 1-hour external upload flow.',
        'status.processing': 'Processing…',
        'action.cancel': 'Cancel',
        'toast.success': 'Success!',
        'settings.heading': '📂 History & Settings',
        'settings.close': 'Close history and settings',
        'settings.section': '⚙️ Settings',
        'settings.auto': 'Auto-search on load',
        'settings.autoDescription': 'Immediately search when image loads',
        'settings.history': 'Save history',
        'settings.historyDescription': 'Remember searched images',
        'settings.noUpload': 'No-upload dispatch',
        'settings.noUploadDescription': 'URL images search directly; local files open manual engine upload pages',
        'settings.language': 'Language',
        'settings.languageDescription': 'Apply a language immediately and remember it on this device',
        'locale.en': 'English',
        'locale.es': 'Español',
        'locale.qps': 'Expansion test',
        'history.heading': '📂 Search History',
        'history.empty': 'No searches yet',
        'history.clear': '🗑️ Clear All History',
        'history.search': 'Search history',
        'history.date': 'Any date',
        'history.dateDay': 'Past 24 hours',
        'history.dateWeek': 'Past 7 days',
        'history.dateMonth': 'Past 30 days',
        'history.source': 'Any source',
        'history.sourceRemote': 'Remote URL',
        'history.sourceHosted': 'Hosted file',
        'history.engine': 'Any engine',
        'history.outcome': 'Any outcome',
        'history.expiry': 'Any availability',
        'history.export': 'Export redacted history',
        'history.noMatches': 'No matching searches',
        'history.opened': 'Opened',
        'history.failed': 'Failed',
        'history.blocked': 'Blocked',
        'history.queued': 'Queued',
        'history.manual': 'Manual only',
        'history.hostedActive': 'Hosted active',
        'history.hostedExpired': 'Hosted expired',
        'history.expiryUnknown': 'Expiry unknown',
        'diagnostics.heading': '🩺 Diagnostics',
        'diagnostics.description': 'Redacted events exclude image bytes, source URLs, cookies, and page content.',
        'diagnostics.copy': 'Copy support report',
        'diagnostics.export': 'Export JSON',
        'diagnostics.clear': 'Clear diagnostics',
        'diagnostics.empty': 'No diagnostic events.',
        'custom.heading': '🧩 Custom engines',
        'custom.empty': 'No custom engines installed. Imports are data-only HTTPS templates.',
        'custom.import': 'Import manifest',
        'custom.export': 'Export manifest',
        'custom.undo': 'Undo import',
        'portable.import': 'Import settings',
        'portable.export': 'Export settings',
        'portable.rollback': 'Rollback settings import',
        'help.heading': '❓ How it works',
        'help.close': 'Close help',
        'help.reviewTitle': 'Review before dispatch',
        'help.reviewBody': 'ImageXpert prepares a per-engine queue. You choose when each external search page opens.',
        'help.sourceHeading': 'Choose the source path',
        'help.publicUrl': 'Public URL: the URL is placed directly into supported engine requests.',
        'help.localFile': 'Local-only file: hashes and edits stay here; manual engine upload pages are queued.',
        'help.externalUpload': 'External upload: after session-only consent, the file becomes a public Litterbox URL for one hour and selected engines receive that URL.',
        'help.video': 'Video: selected keyframes become local image tasks and follow the same privacy choice.',
        'help.limitsHeading': 'Browser and site limits',
        'help.cors': 'Remote sites can block pixel access with CORS. The image may still dispatch by URL, while local hashing, cropping, and provenance inspection remain unavailable for that source.',
        'help.popup': 'If a tab is blocked, its queue row remains visible with an Open / retry action. ImageXpert does not require permanent popup permission.',
        'help.intentHeading': 'Choose engines by intent',
        'file.choose': 'Choose images or videos',
        'file.capture': 'Capture an image',
        'file.engineManifest': 'Import custom engine manifest',
        'file.case': 'Import ImageXpert case',
        'file.settings': 'Import ImageXpert settings bundle',
        'dispatch.openAgain': 'Open again',
        'dispatch.openRetry': 'Open / retry',
        'dispatch.summary': '{count} engines • {pending} ready to open',
        'dispatch.summaryOne': '1 engine • {pending} ready to open',
        'batch.preview': 'Preview',
        'batch.retry': 'Retry',
        'batch.cancel': 'Cancel',
        'history.copy': 'Copy URL',
        'history.remove': 'Remove',
        'history.manual': 'Open manual pages',
        'history.expired': 'Expired hosted link',
        'history.active': 'Hosted link active',
        'history.unknown': 'Hosted expiry unknown',
        'history.remote': 'Remote URL',
        'metadata.type': 'Type',
        'metadata.size': 'Size',
        'metadata.dimensions': 'Dimensions',
        'metadata.modified': 'Modified',
        'metadata.provenance': 'C2PA provenance',
        'value.unknown': 'Unknown',
        'value.pending': 'Pending',
        'value.custom': 'custom',
        'hashes.heading': 'Hashes',
        'hashes.calculating': 'Calculating…',
        'hashes.unavailable': 'Unavailable for this image',
        'lifecycle.offline': 'Offline — local analysis and the cached shell remain available.',
        'lifecycle.online': 'Connection restored.',
        'lifecycle.installing': 'A new ImageXpert version is downloading in the background.',
        'lifecycle.updateReady': 'Update ready. Save the current workspace and reload when convenient.',
        'lifecycle.activating': 'Saving workspace and activating the update…',
        'lifecycle.activated': 'Update activated. Reloading…',
        'lifecycle.installFailed': 'Update download failed. The current offline version remains available.'
    });

    const es = Object.freeze({
        'app.name': 'ImageXpert',
        'nav.history': 'Historial',
        'nav.help': 'Cómo funciona',
        'lifecycle.ready': 'ImageXpert está listo.',
        'lifecycle.reload': 'Guardar y recargar',
        'workspace.kicker': 'Espacio privado de inteligencia visual',
        'workspace.title': 'Rastrea una imagen en la web abierta',
        'workspace.capabilities': 'Capacidades del espacio de trabajo',
        'workspace.engines': '12 motores integrados',
        'workspace.local': 'Procesado en este navegador',
        'intake.label': 'Entrada de imágenes y envío',
        'drop.label': 'Elegir archivos de imagen o vídeo',
        'drop.title': 'Suelta una imagen o un vídeo corto',
        'drop.subtitle': 'Los archivos locales permanecen en este dispositivo salvo que habilites explícitamente una carga externa de 1 hora.',
        'drop.file': '📁 Suelta un archivo',
        'drop.paste': '📋 Pega una imagen',
        'drop.browse': '🖱️ Haz clic para explorar',
        'drop.camera': '📱 Cámara',
        'preview.alt': 'Vista previa de la imagen seleccionada',
        'roi.label': 'Selector de región de imagen',
        'roi.instructions': 'Arrastra para seleccionar. Con el teclado, usa las flechas para mover la selección, Mayús más flechas para cambiar su tamaño, Intro para aplicar o Escape para cancelar.',
        'state.ready': 'Listo',
        'action.searchAgain': '🔍 Buscar de nuevo',
        'action.copyLink': '🔗 Copiar enlace',
        'action.exportCase': 'Exportar caso',
        'action.importCase': 'Importar caso',
        'action.download': '⬇️ Descargar',
        'action.clear': '✕ Limpiar',
        'preprocess.heading': 'Preprocesamiento local',
        'preprocess.rotate': 'Girar 90',
        'preprocess.crop': 'Recorte central',
        'preprocess.trim': 'Recortar franja inferior',
        'preprocess.roi': 'Seleccionar región',
        'preprocess.roiReset': 'Restablecer región',
        'context.label': 'Contexto de texto opcional para Bing',
        'url.heading': 'Pega la URL de una imagen',
        'url.label': 'URL pública de la imagen',
        'url.placeholder': 'https://example.com/imagen.jpg',
        'url.search': 'Buscar URL',
        'url.note': 'Introduce una URL directa para abrirla en los motores de búsqueda seleccionados.',
        'dispatch.heading': 'Cola de envío a motores',
        'dispatch.empty': 'Nada en cola',
        'dispatch.open': 'Abrir motores en cola',
        'rail.label': 'Configuración de búsqueda',
        'privacy.local': 'Modo solo local',
        'privacy.external': 'Carga externa habilitada',
        'privacy.localDescription': 'Los archivos locales permanecen en este dispositivo. Los motores abren sus páginas de carga manual.',
        'privacy.externalDescription': 'Solo durante la sesión: los archivos locales se convierten en URL públicas de Litterbox durante 1 hora y los motores seleccionados reciben esas URL.',
        'privacy.policy': 'Términos y política de privacidad de Catbox',
        'privacy.enable': 'Habilitar carga externa',
        'privacy.disable': 'Usar modo solo local',
        'engines.summary': 'Motores de búsqueda',
        'engines.selected': '{count} seleccionados',
        'engines.note': 'Las páginas de los motores se abren en tu navegador. Los archivos permanecen locales salvo que cambies deliberadamente al flujo de carga externa de 1 hora.',
        'status.processing': 'Procesando…',
        'action.cancel': 'Cancelar',
        'toast.success': '¡Correcto!',
        'settings.heading': '📂 Historial y configuración',
        'settings.close': 'Cerrar historial y configuración',
        'settings.section': '⚙️ Configuración',
        'settings.auto': 'Buscar automáticamente al cargar',
        'settings.autoDescription': 'Buscar inmediatamente al cargar una imagen',
        'settings.history': 'Guardar historial',
        'settings.historyDescription': 'Recordar las imágenes buscadas',
        'settings.noUpload': 'Envío sin carga',
        'settings.noUploadDescription': 'Las URL se buscan directamente; los archivos locales abren páginas de carga manual',
        'settings.language': 'Idioma',
        'settings.languageDescription': 'Aplicar un idioma de inmediato y recordarlo en este dispositivo',
        'locale.en': 'English',
        'locale.es': 'Español',
        'locale.qps': 'Prueba de expansión',
        'history.heading': '📂 Historial de búsquedas',
        'history.empty': 'Aún no hay búsquedas',
        'history.clear': '🗑️ Borrar todo el historial',
        'history.search': 'Buscar en el historial',
        'history.date': 'Cualquier fecha',
        'history.dateDay': 'Últimas 24 horas',
        'history.dateWeek': 'Últimos 7 días',
        'history.dateMonth': 'Últimos 30 días',
        'history.source': 'Cualquier origen',
        'history.sourceRemote': 'URL remota',
        'history.sourceHosted': 'Archivo alojado',
        'history.engine': 'Cualquier motor',
        'history.outcome': 'Cualquier resultado',
        'history.expiry': 'Cualquier disponibilidad',
        'history.export': 'Exportar historial censurado',
        'history.noMatches': 'No hay búsquedas que coincidan',
        'history.opened': 'Abierto',
        'history.failed': 'Fallido',
        'history.blocked': 'Bloqueado',
        'history.queued': 'En cola',
        'history.manual': 'Solo manual',
        'history.hostedActive': 'Alojado activo',
        'history.hostedExpired': 'Alojado caducado',
        'history.expiryUnknown': 'Caducidad desconocida',
        'diagnostics.heading': '🩺 Diagnósticos',
        'diagnostics.description': 'Los eventos censurados excluyen bytes de imágenes, URL de origen, cookies y contenido de páginas.',
        'diagnostics.copy': 'Copiar informe de soporte',
        'diagnostics.export': 'Exportar JSON',
        'diagnostics.clear': 'Borrar diagnósticos',
        'diagnostics.empty': 'No hay eventos de diagnóstico.',
        'custom.heading': '🧩 Motores personalizados',
        'custom.empty': 'No hay motores personalizados. Las importaciones son plantillas HTTPS de solo datos.',
        'custom.import': 'Importar manifiesto',
        'custom.export': 'Exportar manifiesto',
        'custom.undo': 'Deshacer importación',
        'portable.import': 'Importar ajustes',
        'portable.export': 'Exportar ajustes',
        'portable.rollback': 'Revertir importación de ajustes',
        'help.heading': '❓ Cómo funciona',
        'help.close': 'Cerrar ayuda',
        'help.reviewTitle': 'Revisar antes de enviar',
        'help.reviewBody': 'ImageXpert prepara una cola por motor. Tú eliges cuándo se abre cada página de búsqueda externa.',
        'help.sourceHeading': 'Elige la ruta de origen',
        'help.publicUrl': 'URL pública: la URL se inserta directamente en las solicitudes compatibles.',
        'help.localFile': 'Archivo solo local: los hashes y las ediciones permanecen aquí; se ponen en cola páginas de carga manual.',
        'help.externalUpload': 'Carga externa: tras el consentimiento de la sesión, el archivo se convierte en una URL pública de Litterbox durante una hora y los motores seleccionados reciben esa URL.',
        'help.video': 'Vídeo: los fotogramas clave seleccionados se convierten en tareas de imagen locales y siguen la misma opción de privacidad.',
        'help.limitsHeading': 'Límites del navegador y los sitios',
        'help.cors': 'Los sitios remotos pueden bloquear el acceso a píxeles mediante CORS. La imagen aún puede enviarse por URL, pero el hash local, el recorte y la inspección de procedencia no estarán disponibles.',
        'help.popup': 'Si se bloquea una pestaña, su fila permanece visible con la acción Abrir / reintentar. ImageXpert no requiere permiso permanente para ventanas emergentes.',
        'help.intentHeading': 'Elige motores según la intención',
        'file.choose': 'Elegir imágenes o vídeos',
        'file.capture': 'Capturar una imagen',
        'file.engineManifest': 'Importar manifiesto de motor personalizado',
        'file.case': 'Importar caso de ImageXpert',
        'file.settings': 'Importar paquete de ajustes de ImageXpert',
        'dispatch.openAgain': 'Abrir de nuevo',
        'dispatch.openRetry': 'Abrir / reintentar',
        'dispatch.summary': '{count} motores • {pending} listos para abrir',
        'dispatch.summaryOne': '1 motor • {pending} listos para abrir',
        'batch.preview': 'Vista previa',
        'batch.retry': 'Reintentar',
        'batch.cancel': 'Cancelar',
        'history.copy': 'Copiar URL',
        'history.remove': 'Eliminar',
        'history.manual': 'Abrir páginas manuales',
        'history.expired': 'Enlace alojado caducado',
        'history.active': 'Enlace alojado activo',
        'history.unknown': 'Caducidad desconocida',
        'history.remote': 'URL remota',
        'metadata.type': 'Tipo',
        'metadata.size': 'Tamaño',
        'metadata.dimensions': 'Dimensiones',
        'metadata.modified': 'Modificado',
        'metadata.provenance': 'Procedencia C2PA',
        'value.unknown': 'Desconocido',
        'value.pending': 'Pendiente',
        'value.custom': 'personalizado',
        'hashes.heading': 'Hashes',
        'hashes.calculating': 'Calculando…',
        'hashes.unavailable': 'No disponible para esta imagen',
        'lifecycle.offline': 'Sin conexión: el análisis local y la aplicación almacenada siguen disponibles.',
        'lifecycle.online': 'Conexión restablecida.',
        'lifecycle.installing': 'Se está descargando una nueva versión de ImageXpert en segundo plano.',
        'lifecycle.updateReady': 'Actualización lista. Guarda el espacio de trabajo y recarga cuando te convenga.',
        'lifecycle.activating': 'Guardando el espacio de trabajo y activando la actualización…',
        'lifecycle.activated': 'Actualización activada. Recargando…',
        'lifecycle.installFailed': 'La descarga falló. La versión sin conexión actual sigue disponible.'
    });

    const accent = Object.freeze({ a: 'à', e: 'ë', i: 'ï', o: 'ö', u: 'ü', A: 'À', E: 'Ë', I: 'Ï', O: 'Ö', U: 'Ü' });
    function pseudo(value) {
        const expanded = String(value).replace(/[aeiouAEIOU]/g, (letter) => accent[letter] || letter);
        return `［${expanded} ${'~'.repeat(Math.max(3, Math.ceil(expanded.length * 0.3)))}］`;
    }

    const qps = Object.freeze(Object.fromEntries(Object.entries(en).map(([key, value]) => [key, pseudo(value)])));
    const dictionaries = Object.freeze({ en, es, qps });

    function resolveLocale(requested) {
        const normalized = String(requested || 'en').toLowerCase().replace('_', '-');
        if (normalized.startsWith('qps')) return 'qps';
        const language = normalized.split('-')[0];
        return dictionaries[language] ? language : 'en';
    }

    function getLocale(storage, browserLocale = 'en') {
        let saved = '';
        try {
            saved = storage?.getItem?.(STORAGE_KEY) || '';
        } catch {
            // Storage denial is a supported browser state.
        }
        return resolveLocale(saved || browserLocale);
    }

    function persistLocale(storage, locale) {
        const selected = resolveLocale(locale);
        try {
            storage?.setItem?.(STORAGE_KEY, selected);
        } catch {
            // The locale still applies for the current document.
        }
        return selected;
    }

    function t(key, locale = 'en', values = {}) {
        const selected = dictionaries[resolveLocale(locale)];
        const template = selected[key] ?? dictionaries.en[key] ?? key;
        return String(template).replace(/\{(\w+)\}/g, (_, name) => values[name] ?? `{${name}}`);
    }

    function apply(rootNode, requestedLocale) {
        const locale = resolveLocale(requestedLocale);
        if (rootNode?.documentElement) {
            rootNode.documentElement.lang = locale === 'qps' ? 'en-xa' : locale;
            rootNode.documentElement.dataset.locale = locale;
        }
        rootNode?.querySelectorAll?.('[data-i18n]').forEach((element) => {
            element.textContent = t(element.dataset.i18n, locale);
        });
        for (const attribute of ['placeholder', 'aria-label', 'alt', 'title']) {
            rootNode?.querySelectorAll?.(`[data-i18n-${attribute}]`).forEach((element) => {
                const suffix = attribute.replace(/(^|-)([a-z])/g, (_, __, letter) => letter.toUpperCase());
                element.setAttribute(attribute, t(element.dataset[`i18n${suffix}`], locale));
            });
        }
        return locale;
    }

    function formatDate(value, locale = 'en', options = { dateStyle: 'medium' }) {
        return new Intl.DateTimeFormat(resolveLocale(locale) === 'qps' ? 'en' : resolveLocale(locale), options).format(new Date(value));
    }

    function formatNumber(value, locale = 'en', options) {
        return new Intl.NumberFormat(resolveLocale(locale) === 'qps' ? 'en' : resolveLocale(locale), options).format(value);
    }

    function formatList(values, locale = 'en', options = { style: 'long', type: 'conjunction' }) {
        return new Intl.ListFormat(resolveLocale(locale) === 'qps' ? 'en' : resolveLocale(locale), options).format(values);
    }

    function missingKeys(locale) {
        const selected = dictionaries[resolveLocale(locale)];
        return Object.keys(en).filter((key) => !Object.hasOwn(selected, key));
    }

    return Object.freeze({
        VERSION,
        STORAGE_KEY,
        dictionaries,
        resolveLocale,
        getLocale,
        persistLocale,
        t,
        apply,
        formatDate,
        formatNumber,
        formatList,
        missingKeys
    });
}));
