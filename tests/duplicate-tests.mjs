import assert from 'node:assert/strict';
import {
    groupPerceptualDuplicates,
    hammingDistanceHex,
    normalizeThreshold
} from '../modules/duplicate-controller.js';

function test(name, fn) {
    try {
        fn();
        process.stdout.write(`ok - ${name}\n`);
    } catch (error) {
        process.stderr.write(`not ok - ${name}\n${error.stack}\n`);
        process.exitCode = 1;
    }
}

test('hex Hamming distance and thresholds are bounded', () => {
    assert.equal(hammingDistanceHex('0000000000000000', '000000000000000f'), 4);
    assert.equal(normalizeThreshold(-3, 8), 0);
    assert.equal(normalizeThreshold(99, 8), 16);
    assert.throws(() => hammingDistanceHex('abc', 'xy'), /equal-length hexadecimal/);
});

test('perceptual groups are advisory and preserve every input', () => {
    const items = [
        { id: 'a', name: 'A', visualHashes: { phash: '0000000000000000', dhash: '0000000000000000' } },
        { id: 'b', name: 'B', visualHashes: { phash: '0000000000000001', dhash: '0000000000000003' } },
        { id: 'c', name: 'C', visualHashes: { phash: 'ffffffffffffffff', dhash: 'ffffffffffffffff' } }
    ];
    const groups = groupPerceptualDuplicates(items, { phashThreshold: 1, dhashThreshold: 2 });
    assert.equal(groups.length, 1);
    assert.deepEqual(groups[0].members.map((item) => item.id), ['a', 'b']);
    assert.equal(groups[0].pairs[0].phashDistance, 1);
    assert.equal(groups[0].pairs[0].dhashDistance, 2);
    assert.equal(items.length, 3);
    assert.equal(items.every((item) => !Object.hasOwn(item, 'selected')), true);
});
