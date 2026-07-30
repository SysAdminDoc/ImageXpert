export const MAX_HAMMING_THRESHOLD = 16;

export function normalizeThreshold(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number)
        ? Math.max(0, Math.min(MAX_HAMMING_THRESHOLD, Math.round(number)))
        : fallback;
}

export function hammingDistanceHex(left, right) {
    const a = String(left || '').toLowerCase();
    const b = String(right || '').toLowerCase();
    if (!a || a.length !== b.length || !/^[a-f0-9]+$/.test(a) || !/^[a-f0-9]+$/.test(b)) {
        throw new Error('Hamming distance requires equal-length hexadecimal hashes');
    }
    let distance = 0;
    for (let index = 0; index < a.length; index += 1) {
        let bits = Number.parseInt(a[index], 16) ^ Number.parseInt(b[index], 16);
        while (bits) {
            distance += bits & 1;
            bits >>>= 1;
        }
    }
    return distance;
}

export function groupPerceptualDuplicates(items, {
    phashThreshold = 8,
    dhashThreshold = 6
} = {}) {
    const pLimit = normalizeThreshold(phashThreshold, 8);
    const dLimit = normalizeThreshold(dhashThreshold, 6);
    const parents = items.map((_, index) => index);
    const find = (index) => {
        while (parents[index] !== index) {
            parents[index] = parents[parents[index]];
            index = parents[index];
        }
        return index;
    };
    const unite = (left, right) => {
        const a = find(left);
        const b = find(right);
        if (a !== b) parents[b] = a;
    };
    const pairs = [];
    for (let left = 0; left < items.length; left += 1) {
        for (let right = left + 1; right < items.length; right += 1) {
            const a = items[left]?.visualHashes || {};
            const b = items[right]?.visualHashes || {};
            if (!a.phash || !b.phash || !a.dhash || !b.dhash) continue;
            const phashDistance = hammingDistanceHex(a.phash, b.phash);
            const dhashDistance = hammingDistanceHex(a.dhash, b.dhash);
            if (phashDistance <= pLimit || dhashDistance <= dLimit) {
                unite(left, right);
                pairs.push({ left, right, phashDistance, dhashDistance });
            }
        }
    }
    const grouped = new Map();
    items.forEach((item, index) => {
        const root = find(index);
        if (!grouped.has(root)) grouped.set(root, []);
        grouped.get(root).push({ index, id: item.id, name: item.name });
    });
    return [...grouped.values()]
        .filter((members) => members.length > 1)
        .map((members, index) => ({
            id: `probable-${index + 1}`,
            members,
            pairs: pairs.filter((pair) => members.some((item) => item.index === pair.left)
                && members.some((item) => item.index === pair.right))
        }));
}
