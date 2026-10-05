import path from 'node:path';

// Older manifests contain absolute paths (including path-keyed analysis caches).
// Rebase only paths inside this job; never substitute by filename or fall back to
// a different project's files when the transferred copy is incomplete.
export function relocateProjectPaths(manifest, jobId, jobDir) {
    const marker = `/${jobId}/`;
    const folders = new Set(['input', 'out', 'custom', 'suggestions', 'versions']);
    function relocate(value) {
        if (typeof value !== 'string') return value;
        const normalized = value.replace(/\\/g, '/');
        const apiPrefix = `/api/media/${jobId}/`;
        const isMediaUrl = normalized.startsWith(apiPrefix);
        if (!isMediaUrl && !path.posix.isAbsolute(normalized) && !path.win32.isAbsolute(value)) return value;
        const index = normalized.lastIndexOf(marker);
        if (index < 0) return value;
        const suffix = normalized.slice(index + marker.length);
        if (!folders.has(suffix.split('/')[0]) || suffix.split('/').includes('..')) return value;
        return isMediaUrl ? `${apiPrefix}${suffix}` : path.join(jobDir, ...suffix.split('/'));
    }
    function visit(value) {
        if (Array.isArray(value)) return value.map(visit);
        if (value && typeof value === 'object') {
            return Object.fromEntries(Object.entries(value).map(([key, item]) => [relocate(key), visit(item)]));
        }
        return relocate(value);
    }
    return visit(manifest);
}
