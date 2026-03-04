function clampMaxImages(maxImages) {
    if (maxImages === undefined || maxImages === null) return Number.POSITIVE_INFINITY;
    const n = Number(maxImages);
    if (!Number.isFinite(n)) return Number.POSITIVE_INFINITY;
    return Math.max(0, Math.floor(n));
}

function clamp01(v, fallback = 0.6) {
    const n = Number(v);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(0, Math.min(1, n));
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

function countImageScenes(sceneChoices, scenes) {
    let count = 0;
    for (const scene of scenes) {
        if (sceneChoices[String(scene.scene_id)] === "image") count += 1;
    }
    return count;
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

function buildRunningRatioChoices({
    scenes,
    imageEligibleSceneIds,
    targetImageRatio,
    maxImages
}) {
    const sceneChoices = {};
    const cap = clampMaxImages(maxImages);
    let imageCount = 0;

    const startType = Math.random() >= 0.5 ? "image" : "video";

    for (let i = 0; i < scenes.length; i++) {
        const sceneId = String(scenes[i].scene_id);
        const eligibleImage = imageEligibleSceneIds.has(sceneId);
        if (!eligibleImage || imageCount >= cap) {
            sceneChoices[sceneId] = "video";
            continue;
        }

        if (i === 0) {
            sceneChoices[sceneId] = startType;
            if (startType === "image") imageCount += 1;
            continue;
        }

        const currentRatio = imageCount / i;
        if (currentRatio > targetImageRatio) {
            sceneChoices[sceneId] = "video";
        } else {
            sceneChoices[sceneId] = "image";
            imageCount += 1;
        }
    }

    return sceneChoices;
}

function assignReferencesForImageScenes({
    scenes,
    sceneChoices,
    sceneReferenceMap,
    referenceCatalog,
    sceneAssetPaths,
    sceneSourceMap,
    maxReferenceReuse,
    minSceneGap,
    eligibleSceneIds,
    maxImages,
    targetImageCount,
    minReferenceMatchScore = 0
}) {
    const usage = new Map();
    const lastUseSceneIndex = new Map();
    let assignedCount = 0;
    let convertedToVideo = 0;
    let forcedImageScenes = 0;
    let unassignedReferenceImages = 0;

    if (!referenceCatalog.length) {
        return { assignedCount, convertedToVideo, forcedImageScenes, unassignedReferenceImages };
    }

    const sceneOrderIndex = new Map();
    for (let i = 0; i < scenes.length; i++) {
        sceneOrderIndex.set(String(scenes[i].scene_id), i);
    }

    const cap = clampMaxImages(maxImages);
    const imageSceneIds = [];
    for (const s of scenes) {
        const sceneId = String(s.scene_id);
        if (sceneChoices[sceneId] === "image" && eligibleSceneIds.has(sceneId)) {
            imageSceneIds.push(sceneId);
        }
    }

    if (imageSceneIds.length < targetImageCount) {
        for (const s of scenes) {
            if (imageSceneIds.length >= targetImageCount) break;
            if (imageSceneIds.length >= cap) break;
            const sceneId = String(s.scene_id);
            if (sceneChoices[sceneId] === "video" && eligibleSceneIds.has(sceneId)) {
                sceneChoices[sceneId] = "image";
                imageSceneIds.push(sceneId);
                forcedImageScenes += 1;
            }
        }
    }

    for (const sceneId of imageSceneIds) {
        const idx = Number(sceneOrderIndex.get(String(sceneId)) ?? 0);
        const picked = pickReferenceForScene({
            sceneId,
            sceneIndex: idx,
            sceneReferenceMap,
            referenceCatalog,
            usage,
            lastUseSceneIndex,
            maxReferenceReuse,
            minSceneGap,
            minMatchScore: minReferenceMatchScore
        });

        if (!picked) {
            sceneChoices[String(sceneId)] = "video";
            delete sceneAssetPaths[String(sceneId)];
            sceneSourceMap[String(sceneId)] = "stock";
            convertedToVideo += 1;
            continue;
        }

        usage.set(picked.id, (usage.get(picked.id) || 0) + 1);
        lastUseSceneIndex.set(picked.id, idx);
        sceneAssetPaths[String(sceneId)] = picked.path;
        sceneSourceMap[String(sceneId)] = "reference";
        assignedCount += 1;
    }

    // Count how many references were never used at least once.
    for (const ref of referenceCatalog) {
        if (!usage.has(ref.id)) unassignedReferenceImages += 1;
    }

    return { assignedCount, convertedToVideo, forcedImageScenes, unassignedReferenceImages };
}

export function buildSceneAllocation({
    scenes,
    initialChoices,
    referenceCatalog,
    referencePlan,
    config,
    draftOptions,
    minSceneGap = 3
}) {
    const sceneAssetPaths = {};
    const sceneSourceMap = {};
    const sceneReferenceMap = {};

    const { eligibleSceneIds: imageEligibleSceneIds, imageRange } = getImageEligibleSceneIds(scenes, config);
    const requestedImageRatio = clamp01(
        draftOptions?.imageRatio ?? config?.visual?.decision?.imageRatio,
        0.6
    );
    const targetImageCountRaw = Math.round(scenes.length * requestedImageRatio);
    const eligibleCount = Array.from(imageEligibleSceneIds).length;
    const maxImagesCap = clampMaxImages(draftOptions?.maxImages);
    const referenceCapacity = Number(draftOptions?.useReferencesOnly)
        ? Math.max(
            0,
            referenceCatalog.length * Math.max(1, Number(draftOptions?.maxReferenceReuse ?? 2))
        )
        : Number.POSITIVE_INFINITY;
    const targetImageCount = Math.max(
        0,
        Math.min(targetImageCountRaw, eligibleCount, maxImagesCap, referenceCapacity)
    );

    const sceneChoices = buildRunningRatioChoices({
        scenes,
        imageEligibleSceneIds,
        targetImageRatio: requestedImageRatio,
        maxImages: draftOptions?.maxImages
    });

    // Keep initial choices only as fallback if something unexpected happened.
    if (!Object.keys(sceneChoices).length && initialChoices) {
        for (const scene of scenes) {
            sceneChoices[String(scene.scene_id)] = initialChoices[String(scene.scene_id)] || "video";
        }
    }

    for (const scene of scenes) {
        const sceneId = String(scene.scene_id);
        const plan = referencePlan[scene.scene_id];
        sceneReferenceMap[sceneId] = plan?.matches || [];
        if (
            plan?.primaryAsset &&
            imageEligibleSceneIds.has(sceneId) &&
            sceneChoices[sceneId] === "image"
        ) {
            sceneAssetPaths[sceneId] = plan.primaryAsset.path;
            sceneSourceMap[sceneId] = "reference";
        }
    }

    let referencePoolAssigned = 0;
    let imageScenesConvertedToVideo = 0;
    let forcedImageScenes = 0;
    let unassignedReferenceImages = 0;

    if (draftOptions?.useReferencesOnly) {
        const minReferenceMatchScore = draftOptions?.useReferenceCaptionMatching ? 0.35 : 0;
        const result = assignReferencesForImageScenes({
            scenes,
            sceneChoices,
            sceneReferenceMap,
            referenceCatalog,
            sceneAssetPaths,
            sceneSourceMap,
            maxReferenceReuse: Number(draftOptions?.maxReferenceReuse ?? 2),
            minSceneGap,
            eligibleSceneIds: imageEligibleSceneIds,
            maxImages: draftOptions?.maxImages,
            targetImageCount,
            minReferenceMatchScore
        });
        referencePoolAssigned = result.assignedCount;
        imageScenesConvertedToVideo = result.convertedToVideo;
        forcedImageScenes = result.forcedImageScenes;
        unassignedReferenceImages = result.unassignedReferenceImages;
    }

    const finalImageCount = countImageScenes(sceneChoices, scenes);
    const finalVideoCount = Math.max(0, scenes.length - finalImageCount);

    return {
        sceneChoices,
        sceneAssetPaths,
        sceneSourceMap,
        sceneReferenceMap,
        stats: {
            imageRange,
            requestedImageRatio,
            requestedVideoRatio: Number((1 - requestedImageRatio).toFixed(3)),
            targetImageCount,
            referenceCapacity: Number.isFinite(referenceCapacity) ? referenceCapacity : null,
            finalImageCount,
            finalVideoCount,
            referenceScenesUsed: Object.values(sceneSourceMap).filter((v) => v === "reference").length,
            referencePoolAssigned,
            imageScenesConvertedToVideo,
            forcedImageScenes,
            unassignedReferenceImages
        }
    };
}
