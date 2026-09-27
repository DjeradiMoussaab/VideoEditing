import fs from 'node:fs';
import { createHash } from 'node:crypto';

const hashes = new Map();
function contentHash(file) {
    if (!file || !fs.existsSync(file)) return null;
    const stat = fs.statSync(file);
    const key = `${file}|${stat.size}|${stat.mtimeMs}|${stat.ctimeMs}`;
    if (hashes.has(key)) return hashes.get(key);
    const hash = createHash('sha256');
    const buffer = Buffer.alloc(1024 * 1024);
    const fd = fs.openSync(file, 'r');
    try {
        let bytes;
        while ((bytes = fs.readSync(fd, buffer, 0, buffer.length, null)) > 0) hash.update(buffer.subarray(0, bytes));
    } finally { fs.closeSync(fd); }
    const result = hash.digest('hex');
    if (hashes.size > 1000) hashes.clear();
    hashes.set(key, result);
    return result;
}

// Trims, crops and animations do not make the same source different footage.
export function sameFootage(a, b) {
    if (!a || !b) return false;
    const first = a.assetPath || a.path, second = b.assetPath || b.path;
    if (String(a.source || '').includes('fallback') && String(b.source || '').includes('fallback')
        && a.source !== 'reference_fallback' && b.source !== 'reference_fallback') return true;
    if (a.selectedSuggestionId && b.selectedSuggestionId && String(a.selectedSuggestionId) === String(b.selectedSuggestionId)) return true;
    if (first && first === second) return true;
    if (a.signature && a.signature === b.signature) return true;
    const hash = contentHash(first);
    return Boolean(hash && hash === contentHash(second));
}

export function assertNoConsecutiveFootage(scenes) {
    for (let i = 1; i < scenes.length; i++) {
        if (sameFootage(scenes[i - 1], scenes[i])) {
            throw Object.assign(new Error(`Scenes ${scenes[i - 1].scene_id} and ${scenes[i].scene_id} use the same footage consecutively. Choose a different image or video for one of these scenes.`), { statusCode: 409 });
        }
    }
}
