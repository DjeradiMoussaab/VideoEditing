function clampMaxImages(maxImages) {
    if (maxImages === undefined || maxImages === null) return Number.POSITIVE_INFINITY;
    const n = Number(maxImages);
    if (!Number.isFinite(n)) return Number.POSITIVE_INFINITY;
    return Math.max(0, Math.floor(n));
}

export function sceneDurationRangeFor(configObj, type) {
    const min = Math.max(1, Number(configObj?.visual?.sceneDurationSec?.[type]?.min ?? 6));
    const max = Math.max(min, Number(configObj?.visual?.sceneDurationSec?.[type]?.max ?? 15));
    return { min, max };
}

export function inDurationRange(durationSec, range) {
    return Number(durationSec || 0) >= range.min && Number(durationSec || 0) <= range.max;
}

// Allocate strongest matches across the whole timeline before weaker ones can
// consume reuse capacity. Relevance leads; screen-time and neighbor penalties
// gently encourage variety without imposing unrelated assets or rigid quotas.
export function buildSceneAllocation({ scenes, initialChoices = {}, referenceCatalog = [], referencePlan, config, draftOptions, minSceneGap = 3 }) {
    const sceneChoices = {}, sceneAssetPaths = {}, sceneSourceMap = {}, sceneReferenceMap = {}, sceneMediaOffsets = {};
    const imageRange = sceneDurationRangeFor(config, 'image');
    const videoRange = sceneDurationRangeFor(config, 'video');
    const maxImages = clampMaxImages(draftOptions?.maxImages);
    const maxReuse = Math.max(1, Number(draftOptions?.maxReferenceReuse ?? 2));
    const catalogById = new Map(referenceCatalog.map(ref => [ref.id, ref]));
    const usage = new Map();
    const assigned = new Map();
    const seconds = { image: 0, video: 0 };
    const totalSeconds = scenes.reduce((sum, scene) => sum + Math.max(0, Number(scene.duration_sec) || 0), 0) || 1;
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
            if (type === 'video' && (ref.status !== 'ready' || !(Number(ref.duration) > 0))) continue;
            candidates.push({ i, id, ref, type, duration: Number(scene.duration_sec) });
        }
    });
    while (true) {
        let best = null, bestValue = .50;
        for (const candidate of candidates) {
            const { i, ref, type, duration } = candidate;
            if (assigned.has(i) || (type === 'image' && imageCount >= maxImages)) continue;
            const uses = usage.get(ref.signature || ref.id) || [];
            if (uses.length >= maxReuse || uses.some(index => Math.abs(i - index) < Math.max(1, minSceneGap))) continue;
            const neighbors = [assigned.get(i - 1), assigned.get(i + 1)].filter(Boolean);
            const neighborPenalty = neighbors.reduce((sum, other) => sum + (other.type === type ? .12 : .025), 0);
            const targetShare = type === 'image' ? .35 : .45;
            const sharePenalty = Math.max(0, (seconds[type] + duration) / totalSeconds - targetShare) * .45;
            const value = Number(ref.score) - neighborPenalty - sharePenalty - uses.length * .045;
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
        sceneMediaOffsets[id] = type === 'video' ? Number(ref.usableStartSec || 0) : 0;
    }
    const images = referenceCatalog.filter(ref => ref.type !== 'video');
    const clips = referenceCatalog.filter(ref => ref.type === 'video');
    const referenceClipScenes = [...assigned.values()].filter(item => item.type === 'video').length;
    return { sceneChoices, sceneAssetPaths, sceneSourceMap, sceneReferenceMap, sceneMediaOffsets, stats: {
        imageRange, strategy: 'balanced_relevance', minReferenceMatchScore: .5,
        referenceCapacity: images.length * maxReuse,
        referenceScenesUsed: assigned.size, referenceClipScenes,
        unassignedReferenceImages: images.filter(ref => !usage.has(ref.signature || ref.id)).length,
        unassignedReferenceClips: clips.filter(ref => !usage.has(ref.signature || ref.id)).length,
        finalImageCount: imageCount,
        finalVideoCount: Object.values(sceneChoices).filter(type => type === 'video').length,
        imageScenesConvertedToVideo: 0,
        referenceImageSeconds: seconds.image, referenceClipSeconds: seconds.video
    } };
}
