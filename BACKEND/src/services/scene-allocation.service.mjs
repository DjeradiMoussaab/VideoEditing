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

function getImageEligibleSceneIds(scenes, configObj) {
    const imageRange = sceneDurationRangeFor(configObj, "image");
    const eligibleSceneIds = new Set();
    for (const scene of scenes) {
        if (inDurationRange(scene.duration_sec, imageRange)) {
            eligibleSceneIds.add(String(scene.scene_id));
        }
    }
    return { eligibleSceneIds, imageRange };
}

function pickReferenceForScene({
    sceneId,
    sceneIndex,
    sceneReferenceMap,
    referenceCatalog,
    usage,
    lastUseSceneIndex,
    maxReferenceReuse,
    minSceneGap,
    minMatchScore = 0
}) {
    const preferred = sceneReferenceMap[String(sceneId)] || [];
    const preferredIds = new Set(preferred.map((x) => x.id));
    const pool = [
        ...preferred,
        ...referenceCatalog.filter((x) => !preferredIds.has(x.id))
    ];

    for (const ref of pool) {
        const score = Number(ref?.score ?? 0);
        if (score < Number(minMatchScore || 0)) continue;
        const used = usage.get(ref.id) || 0;
        const lastIdx = Number(lastUseSceneIndex.get(ref.id) ?? -99999);
        const sceneGap = sceneIndex - lastIdx;
        if (used < maxReferenceReuse && sceneGap >= Math.max(1, Number(minSceneGap || 1))) {
            return ref;
        }
    }
    return null;
}

export function buildSceneAllocation({
    scenes,
    referenceCatalog,
    referencePlan,
    config,
    draftOptions,
    minSceneGap = 3
}) {
    const sceneChoices = {};
    const sceneAssetPaths = {};
    const sceneSourceMap = {};
    const sceneReferenceMap = {};

    const { eligibleSceneIds: imageEligibleSceneIds, imageRange } = getImageEligibleSceneIds(scenes, config);
    const maxImagesCap = clampMaxImages(draftOptions?.maxImages);
    const maxReferenceReuse = Math.max(1, Number(draftOptions?.maxReferenceReuse ?? 2));
    const minReferenceMatchScore = draftOptions?.useReferenceCaptionMatching ? 0.5 : 0;
    const referenceCapacity = Math.max(0, referenceCatalog.length * maxReferenceReuse);

    const usage = new Map();
    const lastUseSceneIndex = new Map();
    let imageCount = 0;
    let convertedToVideo = 0;

    for (let i = 0; i < scenes.length; i++) {
        const scene = scenes[i];
        const sceneId = String(scene.scene_id);
        const plan = referencePlan?.[scene.scene_id] || {};
        const matches = Array.isArray(plan.matches) ? plan.matches : [];
        sceneReferenceMap[sceneId] = matches;

        const eligibleImage = imageEligibleSceneIds.has(sceneId);
        if (!eligibleImage || imageCount >= maxImagesCap) {
            sceneChoices[sceneId] = "video";
            sceneSourceMap[sceneId] = "stock";
            continue;
        }

        const picked = pickReferenceForScene({
            sceneId,
            sceneIndex: i,
            sceneReferenceMap,
            referenceCatalog,
            usage,
            lastUseSceneIndex,
            maxReferenceReuse,
            minSceneGap,
            minMatchScore: minReferenceMatchScore
        });

        if (!picked) {
            sceneChoices[sceneId] = "video";
            sceneSourceMap[sceneId] = "stock";
            convertedToVideo += 1;
            continue;
        }

        usage.set(picked.id, (usage.get(picked.id) || 0) + 1);
        lastUseSceneIndex.set(picked.id, i);
        sceneChoices[sceneId] = "image";
        sceneAssetPaths[sceneId] = picked.path;
        sceneSourceMap[sceneId] = "reference";
        imageCount += 1;
    }

    let unassignedReferenceImages = 0;
    for (const ref of referenceCatalog) {
        if (!usage.has(ref.id)) unassignedReferenceImages += 1;
    }

    const finalImageCount = imageCount;
    const finalVideoCount = Math.max(0, scenes.length - finalImageCount);
    const targetImageCount = Math.max(
        0,
        Math.min(Array.from(imageEligibleSceneIds).length, maxImagesCap, referenceCapacity)
    );

    return {
        sceneChoices,
        sceneAssetPaths,
        sceneSourceMap,
        sceneReferenceMap,
        stats: {
            imageRange,
            requestedImageRatio: null,
            requestedVideoRatio: null,
            targetImageCount,
            referenceCapacity,
            referenceScenesUsed: finalImageCount,
            imageScenesConvertedToVideo: convertedToVideo,
            forcedImageScenes: 0,
            unassignedReferenceImages,
            finalImageCount,
            finalVideoCount,
            minReferenceMatchScore,
            strategy: "score_only"
        }
    };
}
