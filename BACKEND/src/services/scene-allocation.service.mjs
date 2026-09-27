import { sameFootage } from './footage-continuity.service.mjs';
export function sceneDurationRangeFor(configObj, type) {
    const min = Math.max(1, Number(configObj?.visual?.sceneDurationSec?.[type]?.min ?? 6));
    const max = Math.max(min, Number(configObj?.visual?.sceneDurationSec?.[type]?.max ?? 15));
    return { min, max };
}

export function inDurationRange(durationSec, range) {
    return Number(durationSec || 0) >= range.min && Number(durationSec || 0) <= range.max;
}

// Reference-first allocation with a strict prohibition on adjacent source reuse.
export function buildSceneAllocation({ scenes, initialChoices = {}, referenceCatalog = [], referencePlan, config }) {
    const sceneChoices = {}, sceneAssetPaths = {}, sceneSourceMap = {}, sceneReferenceMap = {}, sceneMediaOffsets = {};
    const imageRange = sceneDurationRangeFor(config, 'image');
    const videoRange = sceneDurationRangeFor(config, 'video');
    const catalogById = new Map(referenceCatalog.map(ref => [ref.id, ref]));
    const usage = new Map();
    const assigned = new Map();
    const seconds = { image: 0, video: 0 };
    let imageCount = 0;
    const candidates = [];
    scenes.forEach((scene, i) => {
        const id = String(scene.scene_id);
        sceneChoices[id] = initialChoices[id] === 'quote' ? 'quote' : 'video';
        sceneSourceMap[id] = sceneChoices[id] === 'quote' ? 'quote' : 'stock';
        const matches = referencePlan?.[id]?.matches || [];
        sceneReferenceMap[id] = matches;
        if (sceneChoices[id] === 'quote') return;
        for (const match of matches) {
            const ref = { ...catalogById.get(match.id), ...match };
            const type = ref.type === 'video' ? 'video' : 'image';
            if (!(Number(ref.score) > .5) || !ref.path) continue;
            if (!inDurationRange(scene.duration_sec, type === 'video' ? videoRange : imageRange)) continue;
            if (type === 'video') {
                const start = Number(ref.startSec ?? ref.usableStartSec ?? 0);
                const end = Math.min(Number(ref.usableEndSec ?? ref.duration), Number(ref.duration));
                const padding = i < scenes.length - 1 ? Math.max(0, Number(config?.video?.transitionDuration || 0)) : 0;
                if (ref.status !== 'ready' || !Number.isFinite(start) || start < Number(ref.usableStartSec || 0)
                    || !Number.isFinite(end) || end - start < Number(scene.duration_sec) + padding) continue;
                ref.startSec = start;
            }
            candidates.push({ i, id, ref, type, duration: Number(scene.duration_sec) });
        }
    });
    while (true) {
        let best = null, bestValue = -Infinity;
        for (const candidate of candidates) {
            const { i, ref } = candidate;
            if (assigned.has(i)) continue;
            const uses = usage.get(ref.signature || ref.id) || [];
            if ([assigned.get(i - 1), assigned.get(i + 1)].some(neighbor => sameFootage(ref, neighbor?.ref))) continue;
            const value = Number(ref.score) - Math.min(.025, uses.length * .005);
            if (value > bestValue) { bestValue = value; best = candidate; }
        }
        if (!best) break;
        const { i, id, ref, type, duration } = best;
        assigned.set(i, best);
        usage.set(ref.signature || ref.id, [...(usage.get(ref.signature || ref.id) || []), i]);
        seconds[type] += duration;
        if (type === 'image') imageCount++;
        sceneChoices[id] = type;
        sceneAssetPaths[id] = ref.path;
        sceneSourceMap[id] = type === 'video' ? 'reference_clip' : 'reference';
        sceneMediaOffsets[id] = type === 'video' ? ref.startSec : 0;
    }
    const images = referenceCatalog.filter(ref => ref.type !== 'video');
    const clips = referenceCatalog.filter(ref => ref.type === 'video');
    const referenceClipScenes = [...assigned.values()].filter(item => item.type === 'video').length;
    return { sceneChoices, sceneAssetPaths, sceneSourceMap, sceneReferenceMap, sceneMediaOffsets, stats: {
        imageRange, strategy: 'reference_first', minReferenceMatchScore: .5,
        referenceCapacity: null,
        referenceScenesUsed: assigned.size, referenceClipScenes,
        unassignedReferenceImages: images.filter(ref => !usage.has(ref.signature || ref.id)).length,
        unassignedReferenceClips: clips.filter(ref => !usage.has(ref.signature || ref.id)).length,
        finalImageCount: imageCount,
        finalVideoCount: Object.values(sceneChoices).filter(type => type === 'video').length,
        imageScenesConvertedToVideo: 0,
        referenceImageSeconds: seconds.image, referenceClipSeconds: seconds.video
    } };
}
