export function dataUrlToFile(dataUrl, filename = 'image.png') {
    const [header, encoded] = String(dataUrl).split(',', 2);
    const match = header?.match(/^data:([^;]+);base64$/);
    if (!match || !encoded) throw new TypeError('Expected a base64 data URL');
    const binary = atob(encoded);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return new File([bytes], filename, { type: match[1] });
}

export function readFileAsDataUrl(file, signal) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => resolve(event.target.result);
        reader.onerror = () => reject(reader.error || new Error(`Could not read ${file.name}`));
        reader.onabort = () => reject(new DOMException('File read cancelled', 'AbortError'));
        if (signal) signal.addEventListener('abort', () => reader.abort(), { once: true });
        reader.readAsDataURL(file);
    });
}
