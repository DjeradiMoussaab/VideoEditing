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

function enforceMaxImages(sceneChoices, scenes, maxImages, lockedSceneIds = new Set()) {
    const cap = clampMaxImages(maxImages);
    let imageCount = countImageScenes(sceneChoices, scenes);
    if (imageCount <= cap) return;

    // Prefer converting unlocked image scenes first, from tail to keep earlier scenes stable.
    for (let i = scenes.length - 1; i >= 0 && imageCount > cap; i--) {
        const sceneId = String(scenes[i].scene_id);
        if (sceneChoices[sceneId] !== "image") continue;
        if (lockedSceneIds.has(sceneId)) continue;
        sceneChoices[sceneId] = "video";
        imageCount -= 1;
    }

    // If still above cap, convert locked images as last resort.
    for (let i = scenes.length - 1; i >= 0 && imageCount > cap; i--) {
        const sceneId = String(scenes[i].scene_id);
        if (sceneChoices[sceneId] !== "image") continue;
        sceneChoices[sceneId] = "video";
        imageCount -= 1;
    }
}

function rebalanceToTargetImageRatio({
    scenes,
    sceneChoices,
    imageEligibleSceneIds,
    targetImageCount,
    lockedImageSceneIds = new Set()
}) {
    let imageCount = countImageScenes(sceneChoices, scenes);

    if (imageCount < targetImageCount) {
        for (const scene of scenes) {
            if (imageCount >= targetImageCount) break;
            const sceneId = String(scene.scene_id);
            if (!imageEligibleSceneIds.has(sceneId)) continue;
            if (sceneChoices[sceneId] === "video") {
                sceneChoices[sceneId] = "image";
                imageCount += 1;
            }
        }
    }

    if (imageCount > targetImageCount) {
        for (let i = scenes.length - 1; i >= 0 && imageCount > targetImageCount; i--) {
            const sceneId = String(scenes[i].scene_id);
            if (sceneChoices[sceneId] !== "image") continue;
            if (lockedImageSceneIds.has(sceneId)) continue;
            sceneChoices[sceneId] = "video";
            imageCount -= 1;
        }
    }
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
    maxImages
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

    if (imageSceneIds.length < referenceCatalog.length) {
        for (const s of scenes) {
            if (imageSceneIds.length >= referenceCatalog.length) break;
            if (imageSceneIds.length >= cap) break;
            const sceneId = String(s.scene_id);
            if (sceneChoices[sceneId] === "video" && eligibleSceneIds.has(sceneId)) {
                sceneChoices[sceneId] = "image";
                imageSceneIds.push(sceneId);
                forcedImageScenes += 1;
            }
        }
    }

    const guaranteedReferenceCount = Math.min(referenceCatalog.length, imageSceneIds.length);
    unassignedReferenceImages = Math.max(0, referenceCatalog.length - guaranteedReferenceCount);

    for (let i = 0; i < guaranteedReferenceCount; i++) {
        const sceneId = imageSceneIds[i];
        const ref = referenceCatalog[i];
        sceneAssetPaths[sceneId] = ref.path;
        sceneSourceMap[sceneId] = "reference";
        usage.set(ref.id, 1);
        lastUseSceneIndex.set(ref.id, Number(sceneOrderIndex.get(sceneId) ?? -99999));
        assignedCount += 1;
    }

    for (let idx = guaranteedReferenceCount; idx < imageSceneIds.length; idx++) {
        const sceneId = imageSceneIds[idx];
        const preferred = sceneReferenceMap[sceneId] || [];
        const preferredIds = new Set(preferred.map((x) => x.id));
        const pool = [
            ...preferred,
            ...referenceCatalog.filter((x) => !preferredIds.has(x.id))
        ];

        let picked = null;
        const currentSceneIndex = Number(sceneOrderIndex.get(sceneId) ?? idx);
        for (const ref of pool) {
            const used = usage.get(ref.id) || 0;
            const lastIdx = Number(lastUseSceneIndex.get(ref.id) ?? -99999);
            const sceneGap = currentSceneIndex - lastIdx;
            if (used < maxReferenceReuse && sceneGap >= Math.max(1, Number(minSceneGap || 1))) {
                picked = ref;
                break;
            }
        }

        if (!picked) {
            sceneChoices[sceneId] = "video";
            delete sceneAssetPaths[sceneId];
            sceneSourceMap[sceneId] = "stock";
            convertedToVideo += 1;
            continue;
        }

        usage.set(picked.id, (usage.get(picked.id) || 0) + 1);
        lastUseSceneIndex.set(picked.id, currentSceneIndex);
        sceneAssetPaths[sceneId] = picked.path;
        sceneSourceMap[sceneId] = "reference";
        assignedCount += 1;
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
    const sceneChoices = {};
    const sceneAssetPaths = {};
    const sceneSourceMap = {};
    const sceneReferenceMap = {};

    for (const scene of scenes) {
        sceneChoices[String(scene.scene_id)] = initialChoices[String(scene.scene_id)] || "image";
    }

    const { eligibleSceneIds: imageEligibleSceneIds, imageRange } = getImageEligibleSceneIds(scenes, config);
    for (const scene of scenes) {
        const sceneId = String(scene.scene_id);
        if (sceneChoices[sceneId] === "image" && !imageEligibleSceneIds.has(sceneId)) {
            sceneChoices[sceneId] = "video";
        }
    }

    const requestedImageRatio = clamp01(
        draftOptions?.imageRatio ?? config?.visual?.decision?.imageRatio,
        0.6
    );
    const targetImageCountRaw = Math.round(scenes.length * requestedImageRatio);
    const eligibleCount = Array.from(imageEligibleSceneIds).length;
    const maxImagesCap = clampMaxImages(draftOptions?.maxImages);
    const targetImageCount = Math.max(
        0,
        Math.min(targetImageCountRaw, eligibleCount, maxImagesCap)
    );

    enforceMaxImages(sceneChoices, scenes, draftOptions?.maxImages);
    rebalanceToTargetImageRatio({
        scenes,
        sceneChoices,
        imageEligibleSceneIds,
        targetImageCount
    });

    let referenceScenesUsed = 0;
    const lockedReferenceScenes = new Set();
    for (const scene of scenes) {
        const sceneId = String(scene.scene_id);
        const plan = referencePlan[scene.scene_id];
        sceneReferenceMap[sceneId] = plan?.matches || [];
        if (plan?.primaryAsset && imageEligibleSceneIds.has(sceneId)) {
            sceneChoices[sceneId] = "image";
            sceneAssetPaths[sceneId] = plan.primaryAsset.path;
            sceneSourceMap[sceneId] = "reference";
            lockedReferenceScenes.add(sceneId);
            referenceScenesUsed += 1;
        }
    }

    enforceMaxImages(sceneChoices, scenes, draftOptions?.maxImages, lockedReferenceScenes);
    rebalanceToTargetImageRatio({
        scenes,
        sceneChoices,
        imageEligibleSceneIds,
        targetImageCount,
        lockedImageSceneIds: lockedReferenceScenes
    });

    let referencePoolAssigned = 0;
    let imageScenesConvertedToVideo = 0;
    let forcedImageScenes = 0;
    let unassignedReferenceImages = 0;
    if (draftOptions?.useReferencesOnly) {
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
            maxImages: draftOptions?.maxImages
        });
        referencePoolAssigned = result.assignedCount;
        imageScenesConvertedToVideo = result.convertedToVideo;
        forcedImageScenes = result.forcedImageScenes;
        unassignedReferenceImages = result.unassignedReferenceImages;
    }

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
            referenceScenesUsed,
            referencePoolAssigned,
            imageScenesConvertedToVideo,
            forcedImageScenes,
            unassignedReferenceImages
        }
    };
}
