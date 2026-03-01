import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import child_process from "child_process";
import { config as baseConfig } from "../config.mjs";
import { apiConfig } from "../config/api.config.mjs";
import { createContext } from "../context.mjs";
import { planScenesStep } from "../steps/01-plan-scenes.mjs";
import { decideSceneVisualsStep } from "../steps/02a-decide-scene-visuals.mjs";
import { generateImagesStep } from "../steps/02-generate-images.mjs";
import { makeClipsStep } from "../steps/03-make-clips.mjs";
import { concatVisualsStep } from "../steps/04-concat-visuals.mjs";
import { addAudioStep } from "../steps/05-add-audio.mjs";
import {
    createManifest,
    ensureJobDirs,
    loadManifest,
    mediaUrl,
    saveManifest
} from "./job-store.service.mjs";
import { getStockSuggestions } from "./stock-suggestions.service.mjs";
import { PexelsVideoProvider } from "../providers/pexels-video-provider.mjs";
import {
    buildReferenceCatalog,
    matchReferencesToScenes
} from "./reference-matching.service.mjs";

function cloneConfig(config) {
    return JSON.parse(JSON.stringify(config));
}

function toIntOrNull(value) {
    if (value === undefined || value === null || value === "") return null;
    const n = Number(value);
    if (!Number.isFinite(n)) return null;
    return Math.floor(n);
}

function toNumberOrNull(value) {
    if (value === undefined || value === null || value === "") return null;
    const n = Number(value);
    if (!Number.isFinite(n)) return null;
    return n;
}

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function normalizeDraftOptions(options = {}, baseConfig) {
    const out = {};

    const maxImages = toIntOrNull(options.maxImages);
    if (maxImages !== null) out.maxImages = clamp(maxImages, 0, 1000);

    const minSceneDurationSec = toNumberOrNull(options.minSceneDurationSec);
    const maxSceneDurationSec = toNumberOrNull(options.maxSceneDurationSec);
    if (minSceneDurationSec !== null || maxSceneDurationSec !== null) {
        const minValue = minSceneDurationSec !== null
            ? clamp(minSceneDurationSec, 1, 120)
            : Number(baseConfig.visual.sceneMinDurationSec);
        const maxValue = maxSceneDurationSec !== null
            ? clamp(maxSceneDurationSec, minValue, 240)
            : Number(baseConfig.visual.sceneMaxDurationSec);
        out.minSceneDurationSec = minValue;
        out.maxSceneDurationSec = Math.max(minValue, maxValue);
    }

    if (options.useReferencesOnly !== undefined) {
        out.useReferencesOnly = Boolean(options.useReferencesOnly);
    }

    const maxReferenceReuse = toIntOrNull(options.maxReferenceReuse);
    if (maxReferenceReuse !== null) {
        out.maxReferenceReuse = clamp(maxReferenceReuse, 1, 50);
    }

    if (options.imageAnimationStyle !== undefined && options.imageAnimationStyle !== null) {
        const requested = String(options.imageAnimationStyle);
        const profiles = baseConfig.video?.imageAnimationProfiles || {};
        if (!profiles[requested]) {
            const allowed = Object.keys(profiles).join(", ");
            throw new Error(`Invalid imageAnimationStyle "${requested}". Allowed values: ${allowed}`);
        }
        out.imageAnimationStyle = requested;
    }

    return out;
}

function applyDraftOptionsToContext(ctx, draftOptions = {}) {
    const cfg = cloneConfig(ctx.config);

    if (draftOptions.minSceneDurationSec !== undefined) {
        cfg.visual.sceneMinDurationSec = Number(draftOptions.minSceneDurationSec);
    }
    if (draftOptions.maxSceneDurationSec !== undefined) {
        cfg.visual.sceneMaxDurationSec = Number(draftOptions.maxSceneDurationSec);
    }
    if (draftOptions.imageAnimationStyle !== undefined) {
        cfg.video.imageAnimationStyle = String(draftOptions.imageAnimationStyle);
    }
    ctx.config = cfg;
}

function enforceMaxImages(sceneChoices, scenes, maxImages) {
    if (maxImages === undefined || maxImages === null) return;
    if (maxImages < 0) return;

    let imageCount = 0;
    for (const scene of scenes) {
        if (sceneChoices[String(scene.scene_id)] === "image") imageCount += 1;
    }
    if (imageCount <= maxImages) return;

    let overflow = imageCount - maxImages;
    for (let i = scenes.length - 1; i >= 0 && overflow > 0; i--) {
        const sceneId = scenes[i].scene_id;
        if (sceneChoices[String(sceneId)] === "image") {
            sceneChoices[String(sceneId)] = "video";
            overflow -= 1;
        }
    }
}

function ctxForJob(jobId, draftOptions = {}) {
    const p = ensureJobDirs(jobId);
    const ctx = createContext({
        inputDir: p.inputDir,
        outDir: p.outDir,
        visualSource: "mixed_random",
        mockOpenAI: false,
        useTestImages: false,
        useReferencesOnly: Boolean(draftOptions.useReferencesOnly),
        maxReferenceReuse: Number(draftOptions.maxReferenceReuse ?? 2),
        imageAnimationStyle: String(draftOptions.imageAnimationStyle ?? baseConfig.video.imageAnimationStyle)
    });
    applyDraftOptionsToContext(ctx, draftOptions);
    return ctx;
}

function assignReferencesForImageScenes({
    scenes,
    sceneChoices,
    sceneReferenceMap,
    referenceCatalog,
    sceneAssetPaths,
    sceneSourceMap,
    ctx,
    maxReferenceReuse
}) {
    const usage = new Map();
    let assignedCount = 0;
    let convertedToVideo = 0;
    let forcedImageScenes = 0;
    let unassignedReferenceImages = 0;

    if (!referenceCatalog.length) {
        return { assignedCount, convertedToVideo, forcedImageScenes };
    }

    const imageSceneIds = [];
    for (const s of scenes) {
        const sceneId = s.scene_id;
        if (sceneChoices[String(sceneId)] === "image") {
            imageSceneIds.push(sceneId);
        }
    }

    if (imageSceneIds.length < referenceCatalog.length) {
        for (const s of scenes) {
            if (imageSceneIds.length >= referenceCatalog.length) break;
            const sceneId = s.scene_id;
            if (sceneChoices[String(sceneId)] === "video") {
                sceneChoices[String(sceneId)] = "image";
                imageSceneIds.push(sceneId);
                forcedImageScenes += 1;
            }
        }
    }

    const guaranteedReferenceCount = Math.min(referenceCatalog.length, imageSceneIds.length);
    unassignedReferenceImages = Math.max(0, referenceCatalog.length - guaranteedReferenceCount);

    // Best effort: use each reference at least once when enough image scenes exist.
    for (let i = 0; i < guaranteedReferenceCount; i++) {
        const sceneId = imageSceneIds[i];
        const ref = referenceCatalog[i];
        sceneAssetPaths[String(sceneId)] = ref.path;
        sceneSourceMap[String(sceneId)] = "reference";
        ctx.sceneVisuals[sceneId] = { type: "image", path: ref.path, source: "reference" };
        usage.set(ref.id, 1);
        assignedCount += 1;
    }

    for (let idx = guaranteedReferenceCount; idx < imageSceneIds.length; idx++) {
        const sceneId = imageSceneIds[idx];
        const preferred = sceneReferenceMap[String(sceneId)] || [];
        const preferredIds = new Set(preferred.map((x) => x.id));
        const pool = [
            ...preferred,
            ...referenceCatalog.filter((x) => !preferredIds.has(x.id))
        ];

        let picked = null;
        for (const ref of pool) {
            const used = usage.get(ref.id) || 0;
            if (used < maxReferenceReuse) {
                picked = ref;
                break;
            }
        }

        if (!picked) {
            sceneChoices[String(sceneId)] = "video";
            sceneSourceMap[String(sceneId)] = "stock";
            convertedToVideo += 1;
            continue;
        }

        usage.set(picked.id, (usage.get(picked.id) || 0) + 1);
        sceneAssetPaths[String(sceneId)] = picked.path;
        sceneSourceMap[String(sceneId)] = "reference";
        ctx.sceneVisuals[sceneId] = { type: "image", path: picked.path, source: "reference_pool" };
        assignedCount += 1;
    }

    return { assignedCount, convertedToVideo, forcedImageScenes, unassignedReferenceImages };
}

function sceneView(
    jobId,
    s,
    sceneChoices,
    sceneAssetPaths,
    suggestions = [],
    selectedSuggestionId = null,
    referenceMatches = [],
    source = null,
    imageAnimationStyle = null
) {
    const type = sceneChoices[String(s.scene_id)] || "image";
    const assetPath = sceneAssetPaths[String(s.scene_id)] || null;
    return {
        scene_id: s.scene_id,
        start_sec: s.start_sec,
        end_sec: s.end_sec,
        duration_sec: s.duration_sec,
        narration: s.narration,
        visual: s.visual,
        image_prompt: s.image_prompt,
        type,
        source,
        imageAnimationStyle: type === "image" ? imageAnimationStyle : null,
        assetPath,
        assetUrl: assetPath && fs.existsSync(assetPath) ? mediaUrl(jobId, assetPath) : null,
        selectedSuggestionId,
        referenceMatches: referenceMatches.map((x) => ({
            id: x.id,
            filename: x.filename,
            score: x.score,
            url: mediaUrl(jobId, x.path)
        })),
        stockSuggestions: suggestions.map((x) => ({
            id: x.id,
            duration: x.duration,
            width: x.width,
            height: x.height,
            pexelsUrl: x.pexelsUrl,
            thumbnail: x.thumbnail,
            previewUrl: x.file.link
        }))
    };
}

function initProgress() {
    return {
        phase: "idle",
        percent: 0,
        summary: "",
        stats: {},
        recap: []
    };
}

function pushRecap(progress, line) {
    const entry = `${new Date().toLocaleTimeString()} - ${line}`;
    const next = [...(progress.recap || []), entry];
    progress.recap = next.slice(-8);
}

function setProgress(jobId, manifest, { phase, percent, summary, stats, recap }) {
    manifest.progress = manifest.progress || initProgress();
    if (phase !== undefined) manifest.progress.phase = phase;
    if (percent !== undefined) manifest.progress.percent = Math.max(0, Math.min(100, Math.round(percent)));
    if (summary !== undefined) manifest.progress.summary = summary;
    if (stats !== undefined) {
        manifest.progress.stats = { ...(manifest.progress.stats || {}), ...stats };
    }
    if (recap) {
        pushRecap(manifest.progress, recap);
    }
    saveManifest(jobId, manifest);
}

function formatMinSec(totalSec) {
    const sec = Math.max(0, Math.round(Number(totalSec || 0)));
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
}

function getAnimationProfile(configObj, styleId) {
    const profiles = configObj.video?.imageAnimationProfiles || {};
    const resolvedId = String(styleId || configObj.video?.imageAnimationStyle || "");
    const profile = profiles[resolvedId] || profiles[Object.keys(profiles)[0]] || null;
    if (!profile) return null;
    return {
        id: profiles[resolvedId] ? resolvedId : Object.keys(profiles)[0],
        label: profile.label || resolvedId,
        estimatedM1SecPer1SecClip: Number(
            profile.estimatedM1SecPer1SecClip ??
            (Number(profile.estimatedM1SecPer10SecClip || 0) / 10)
        )
    };
}

function resolveAnimationStyleId(styleId, fallbackStyleId = null) {
    const profiles = baseConfig.video?.imageAnimationProfiles || {};
    const firstId = Object.keys(profiles)[0] || null;
    const candidate = String(
        styleId ||
        fallbackStyleId ||
        baseConfig.video?.imageAnimationStyle ||
        firstId ||
        ""
    );
    if (!candidate || !profiles[candidate]) {
        const allowed = Object.keys(profiles).join(", ");
        throw new Error(`Invalid imageAnimationStyle "${candidate}". Allowed values: ${allowed}`);
    }
    return candidate;
}

function finalRenderPercent({ phase, ratio = 0 }) {
    const clampedRatio = Math.max(0, Math.min(1, Number(ratio || 0)));
    if (phase === "final_queued") return 0;
    if (phase === "final_preparing") return 3;
    if (phase === "final_clips") return Math.round(8 + clampedRatio * 72); // 8..80
    if (phase === "final_concatenating") return 84;
    if (phase === "final_adding_audio") return 93;
    if (phase === "final_verifying") return 98;
    if (phase === "final_ready") return 100;
    return 0;
}

export function createJob() {
    const jobId = randomUUID().slice(0, 12);
    ensureJobDirs(jobId);
    const manifest = createManifest(jobId);
    saveManifest(jobId, manifest);
    return manifest;
}

export function getJob(jobId) {
    return loadManifest(jobId);
}

function removeFileIfExists(filePath) {
    if (!filePath) return;
    try {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch {
        // best-effort cleanup
    }
}

function resetFinalGenerationOutputs(jobId) {
    const p = ensureJobDirs(jobId);
    const outDir = p.outDir;
    const clipsDir = path.join(outDir, "clips");

    removeFileIfExists(path.join(outDir, "concat.txt"));
    removeFileIfExists(path.join(outDir, "visuals.mp4"));
    removeFileIfExists(path.join(outDir, "final.mp4"));
    removeFileIfExists(path.join(outDir, "final_subbed.mp4"));

    if (fs.existsSync(clipsDir)) {
        for (const name of fs.readdirSync(clipsDir)) {
            if (name.toLowerCase().endsWith(".mp4")) {
                removeFileIfExists(path.join(clipsDir, name));
            }
        }
    }
}

export function startFinalVideoJob(jobId) {
    const manifest = loadManifest(jobId);
    if (!manifest) throw new Error("Job not found");
    if (!manifest.plan) throw new Error("Draft is required before final generation");
    if (manifest.status === "FINAL_RUNNING") return manifest;
    resetFinalGenerationOutputs(jobId);
    manifest.artifacts = {};

    const totalClips = Array.isArray(manifest.plan?.scenes) ? manifest.plan.scenes.length : 0;
    const totalVideoSec = (manifest.plan?.scenes || []).reduce(
        (sum, s) => sum + Math.max(0, Number(s.duration_sec || 0)),
        0
    );
    const animationProfile = getAnimationProfile(baseConfig, manifest.draftOptions?.imageAnimationStyle);

    const finalStartedAtEpochMs = Date.now();
    manifest.status = "FINAL_RUNNING";
    setProgress(jobId, manifest, {
        phase: "final_queued",
        percent: finalRenderPercent({ phase: "final_queued" }),
        summary: "Queued final render",
        stats: {
            clipsRendered: 0,
            totalClips,
            renderedSec: 0,
            totalVideoSec,
            currentStep: "queued",
            finalStartedAtEpochMs,
            finalRenderElapsedSec: null,
            imageAnimationStyle: animationProfile?.id || null,
            imageAnimationLabel: animationProfile?.label || null,
            estimatedM1SecPer1SecClip: animationProfile?.estimatedM1SecPer1SecClip || null,
            estimatedM1TotalRenderSec: animationProfile?.estimatedM1SecPer1SecClip || null
        },
        recap: "Final render queued"
    });

    const runnerPath = path.join(apiConfig.rootDir, "src/jobs/run-final-job.mjs");
    const child = child_process.spawn(process.execPath, [runnerPath, jobId], {
        cwd: apiConfig.rootDir,
        detached: true,
        stdio: "ignore"
    });
    child.unref();

    return loadManifest(jobId);
}

function sanitizeFilename(name, idx) {
    const safe = String(name || `reference_${idx + 1}.png`)
        .replace(/[^a-zA-Z0-9._-]/g, "_")
        .replace(/^_+/, "");
    return safe || `reference_${idx + 1}.png`;
}

export function saveProjectInputs(jobId, files) {
    const manifest = loadManifest(jobId);
    if (!manifest) throw new Error("Job not found");

    const p = ensureJobDirs(jobId);
    const voiceFile = files?.voiceover?.[0];
    if (!voiceFile) throw new Error("voiceover file is required");
    fs.writeFileSync(path.join(p.inputDir, "voiceover.mp3"), voiceFile.buffer);
    manifest.inputs.voiceover = path.join(p.inputDir, "voiceover.mp3");

    const refFiles = files?.reference || [];
    if (refFiles.length) {
        const refsDir = path.join(p.inputDir, "references");
        fs.mkdirSync(refsDir, { recursive: true });
        const references = [];
        for (let i = 0; i < refFiles.length; i++) {
            const file = refFiles[i];
            const filename = sanitizeFilename(file.originalname, i);
            const outPath = path.join(refsDir, filename);
            fs.writeFileSync(outPath, file.buffer);
            references.push(outPath);
        }
        manifest.inputs.references = references;
    } else {
        manifest.inputs.references = [];
    }

    manifest.status = "INPUTS_READY";
    saveManifest(jobId, manifest);
    return manifest;
}

export async function generateDraft(jobId, draftOptionsInput = {}) {
    const manifest = loadManifest(jobId);
    if (!manifest) throw new Error("Job not found");
    const draftOptions = normalizeDraftOptions(draftOptionsInput, baseConfig);
    if (!draftOptions.imageAnimationStyle) {
        draftOptions.imageAnimationStyle = String(baseConfig.video.imageAnimationStyle);
    }
    const selectedAnimation = getAnimationProfile(baseConfig, draftOptions.imageAnimationStyle);

    manifest.status = "DRAFT_RUNNING";
    manifest.draftOptions = draftOptions;
    setProgress(jobId, manifest, {
        phase: "planning",
        percent: 5,
        summary: "Analyzing voiceover and planning scenes",
        stats: {
            imageAnimationStyle: selectedAnimation?.id || null,
            imageAnimationLabel: selectedAnimation?.label || null,
            estimatedM1SecPer1SecClip: selectedAnimation?.estimatedM1SecPer1SecClip || null
        },
        recap: "Draft started"
    });

    const ctx = ctxForJob(jobId, draftOptions);
    await planScenesStep(ctx);
    setProgress(jobId, manifest, {
        phase: "planning",
        percent: 20,
        summary: `Scene plan ready (${ctx.plan.scenes.length} scenes)`,
        stats: { totalScenes: ctx.plan.scenes.length },
        recap: `${ctx.plan.scenes.length} scenes planned`
    });

    await decideSceneVisualsStep(ctx);
    setProgress(jobId, manifest, {
        phase: "visual_decision",
        percent: 30,
        summary: "Deciding image/video distribution"
    });

    manifest.plan = ctx.plan;
    manifest.sceneChoices = {};
    const sceneAssetPaths = {};
    const suggestionMap = {};
    const selectedSuggestionMap = {};
    const sceneReferenceMap = {};
    const sceneSourceMap = {};

    for (const s of ctx.plan.scenes) {
        const choice = ctx.sceneVisualChoices[s.scene_id];
        manifest.sceneChoices[String(s.scene_id)] = choice;
    }
    enforceMaxImages(manifest.sceneChoices, ctx.plan.scenes, draftOptions.maxImages);

    const referenceCatalog = buildReferenceCatalog(manifest.inputs.references || []);
    const referencePlan = matchReferencesToScenes(ctx.plan.scenes, referenceCatalog);
    let referenceScenesUsed = 0;
    for (const s of ctx.plan.scenes) {
        const plan = referencePlan[s.scene_id];
        sceneReferenceMap[String(s.scene_id)] = plan?.matches || [];
        if (plan?.primaryAsset) {
            const sceneId = s.scene_id;
            manifest.sceneChoices[String(sceneId)] = "image";
            sceneAssetPaths[String(sceneId)] = plan.primaryAsset.path;
            ctx.sceneVisuals[sceneId] = { type: "image", path: plan.primaryAsset.path, source: "reference" };
            sceneSourceMap[String(sceneId)] = "reference";
            referenceScenesUsed += 1;
        }
    }

    let referencePoolAssigned = 0;
    let imageScenesConvertedToVideo = 0;
    let forcedImageScenes = 0;
    let unassignedReferenceImages = 0;
    if (draftOptions.useReferencesOnly) {
        const result = assignReferencesForImageScenes({
            scenes: ctx.plan.scenes,
            sceneChoices: manifest.sceneChoices,
            sceneReferenceMap,
            referenceCatalog,
            sceneAssetPaths,
            sceneSourceMap,
            ctx,
            maxReferenceReuse: Number(draftOptions.maxReferenceReuse ?? 2)
        });
        referencePoolAssigned = result.assignedCount;
        imageScenesConvertedToVideo = result.convertedToVideo;
        forcedImageScenes = result.forcedImageScenes;
        unassignedReferenceImages = result.unassignedReferenceImages;
    }

    const plannedImageCount = ctx.plan.scenes.filter(
        (s) => manifest.sceneChoices[String(s.scene_id)] === "image"
    ).length;
    const plannedVideoCount = ctx.plan.scenes.length - plannedImageCount;
    setProgress(jobId, manifest, {
        phase: "visual_decision",
        percent: 35,
        summary: `${plannedImageCount} images and ${plannedVideoCount} stock videos selected`,
        stats: {
            imageScenes: plannedImageCount,
            videoScenes: plannedVideoCount,
            referenceScenes: referenceScenesUsed + referencePoolAssigned,
            imageScenesConvertedToVideo,
            forcedImageScenes: draftOptions.useReferencesOnly ? Number(forcedImageScenes || 0) : 0,
            unassignedReferenceImages: draftOptions.useReferencesOnly ? Number(unassignedReferenceImages || 0) : 0
        },
        recap: draftOptions.useReferencesOnly
            ? `Reference-only mode: ${plannedImageCount} image scenes, ${plannedVideoCount} videos, ${imageScenesConvertedToVideo} converted to video${unassignedReferenceImages ? `, ${unassignedReferenceImages} references not placed` : ""}`
            : `Visual mix: ${plannedImageCount} images, ${plannedVideoCount} videos (${referenceScenesUsed} from references)`
    });

    let videoProcessed = 0;
    let stockPrepared = 0;
    const totalVideoTargets = plannedVideoCount;
    for (const s of ctx.plan.scenes) {
        const sceneId = s.scene_id;
        const type = manifest.sceneChoices[String(sceneId)];
        if (type === "video") {
            const suggestions = await getStockSuggestions(ctx, s, 8);
            suggestionMap[String(sceneId)] = suggestions;
            if (suggestions.length) {
                const provider = new PexelsVideoProvider(ctx);
                const outPath = ctx.paths.sceneStockVideo(sceneId);
                await provider.downloadVideoFile(suggestions[0].file.link, outPath);
                sceneAssetPaths[String(sceneId)] = outPath;
                ctx.sceneVisuals[sceneId] = { type: "video", path: outPath };
                selectedSuggestionMap[String(sceneId)] = String(suggestions[0].id);
                sceneSourceMap[String(sceneId)] = "stock";
                stockPrepared += 1;
            } else if (ctx.config.visual.fallbackToImagesWhenNoStock) {
                manifest.sceneChoices[String(sceneId)] = "image";
            }

            videoProcessed += 1;
            const ratio = totalVideoTargets > 0 ? videoProcessed / totalVideoTargets : 1;
            setProgress(jobId, manifest, {
                phase: "stock_preparation",
                percent: 35 + ratio * 20,
                summary: `Preparing stock videos (${videoProcessed}/${totalVideoTargets})`,
                stats: {
                    stockPrepared,
                    videoScenes: totalVideoTargets
                }
            });
        }
    }
    setProgress(jobId, manifest, {
        phase: "stock_preparation",
        percent: 55,
        summary: `Stock preparation finished (${stockPrepared}/${totalVideoTargets} ready)`,
        recap: `Stock ready: ${stockPrepared}/${totalVideoTargets}`
    });

    ctx.sceneVisualChoices = Object.fromEntries(
        Object.entries(manifest.sceneChoices).map(([k, v]) => [Number(k), v])
    );
    ctx.sceneReferenceMatches = Object.fromEntries(
        Object.entries(sceneReferenceMap).map(([k, v]) => [Number(k), v])
    );
    const totalImageTargets = ctx.plan.scenes.filter(
        (s) => manifest.sceneChoices[String(s.scene_id)] === "image"
    ).length;
    let imagesGenerated = 0;
    ctx.onSceneImageReady = () => {
        imagesGenerated += 1;
        const ratio = totalImageTargets > 0 ? imagesGenerated / totalImageTargets : 1;
        setProgress(jobId, manifest, {
            phase: "image_generation",
            percent: 55 + ratio * 30,
            summary: `Generating images (${imagesGenerated}/${totalImageTargets})`,
            stats: { imagesGenerated, imageScenes: totalImageTargets }
        });
    };
    await generateImagesStep(ctx);
    ctx.onSceneImageReady = null;

    for (const s of ctx.plan.scenes) {
        const sceneId = s.scene_id;
        if (manifest.sceneChoices[String(sceneId)] === "image") {
            const pth = ctx.paths.sceneImage(sceneId);
            if (fs.existsSync(pth)) {
                sceneAssetPaths[String(sceneId)] = pth;
                if (!sceneSourceMap[String(sceneId)]) sceneSourceMap[String(sceneId)] = "generated";
            }
        }
    }

    const sceneAnimationStyleMap = {};
    for (const s of ctx.plan.scenes) {
        const type = manifest.sceneChoices[String(s.scene_id)];
        sceneAnimationStyleMap[String(s.scene_id)] = type === "image"
            ? resolveAnimationStyleId(selectedAnimation?.id, draftOptions.imageAnimationStyle)
            : null;
    }

    manifest.scenes = ctx.plan.scenes.map((s) =>
        sceneView(
            jobId,
            s,
            manifest.sceneChoices,
            sceneAssetPaths,
            suggestionMap[String(s.scene_id)] || [],
            selectedSuggestionMap[String(s.scene_id)] || null,
            sceneReferenceMap[String(s.scene_id)] || [],
            sceneSourceMap[String(s.scene_id)] || null,
            sceneAnimationStyleMap[String(s.scene_id)] || null
        )
    );

    manifest.status = "DRAFT_READY";
    const finalImageCount = manifest.scenes.filter((s) => s.type === "image").length;
    const finalVideoCount = manifest.scenes.length - finalImageCount;
    const finalReferenceSceneCount = manifest.scenes.filter(
        (s) => Array.isArray(s.referenceMatches) && s.referenceMatches.length > 0
    ).length;
    setProgress(jobId, manifest, {
        phase: "draft_ready",
        percent: 100,
        summary: `Draft ready: ${manifest.scenes.length} scenes`,
        stats: {
            totalScenes: manifest.scenes.length,
            imageScenes: finalImageCount,
            videoScenes: finalVideoCount,
            imagesGenerated,
            referenceScenes: finalReferenceSceneCount
        },
        recap: `Draft completed with ${finalImageCount} images and ${finalVideoCount} videos`
    });
    return manifest;
}

export async function setSceneType(jobId, sceneId, updates = {}) {
    const manifest = loadManifest(jobId);
    if (!manifest) throw new Error("Job not found");
    const scene = manifest.scenes.find((s) => Number(s.scene_id) === Number(sceneId));
    if (!scene) throw new Error("Scene not found");

    const hasTypeUpdate = updates.type !== undefined && updates.type !== null && updates.type !== "";
    const hasAnimationUpdate = updates.imageAnimationStyle !== undefined;
    if (!hasTypeUpdate && !hasAnimationUpdate) {
        throw new Error("No scene update provided");
    }

    const type = hasTypeUpdate ? String(updates.type) : scene.type;
    if (type !== "image" && type !== "video") throw new Error("Invalid scene type");
    const defaultAnimationStyle = resolveAnimationStyleId(
        scene.imageAnimationStyle,
        manifest.draftOptions?.imageAnimationStyle
    );
    const requestedAnimationStyle = hasAnimationUpdate
        ? resolveAnimationStyleId(updates.imageAnimationStyle, manifest.draftOptions?.imageAnimationStyle)
        : null;

    const ctx = ctxForJob(jobId);
    const previousType = scene.type;
    scene.type = type;
    manifest.sceneChoices[String(sceneId)] = type;
    if (type === "image" && previousType !== "image") {
        const generatedImage = ctx.paths.sceneImage(sceneId);
        if (fs.existsSync(generatedImage)) {
            scene.assetPath = generatedImage;
            scene.assetUrl = mediaUrl(jobId, generatedImage);
            scene.source = "generated";
        } else {
            const references = (manifest.inputs?.references || []).filter((refPath) => fs.existsSync(refPath));
            const preferredReference = references.find((refPath) =>
                String(refPath).endsWith(`/${scene.referenceMatches?.[0]?.filename || ""}`)
            );
            const referenceCandidate = preferredReference || references[0] || null;

            if (referenceCandidate) {
                scene.assetPath = referenceCandidate;
                scene.assetUrl = mediaUrl(jobId, referenceCandidate);
                scene.source = "reference";
            } else {
                scene.assetPath = null;
                scene.assetUrl = null;
                scene.source = null;
            }
        }
    } else if (type === "video" && previousType !== "video") {
        const stockVideo = ctx.paths.sceneStockVideo(sceneId);
        if (fs.existsSync(stockVideo)) {
            scene.assetPath = stockVideo;
            scene.assetUrl = mediaUrl(jobId, stockVideo);
            scene.source = "stock";
        } else {
            scene.assetPath = null;
            scene.assetUrl = null;
            scene.source = null;
        }
    }
    if (type !== "video") {
        scene.selectedSuggestionId = null;
        scene.imageAnimationStyle = requestedAnimationStyle || scene.imageAnimationStyle || defaultAnimationStyle;
    } else {
        scene.imageAnimationStyle = null;
    }

    if (type === "image" && requestedAnimationStyle) {
        scene.imageAnimationStyle = requestedAnimationStyle;
    }
    saveManifest(jobId, manifest);
    return manifest;
}

export async function uploadSceneImage(jobId, sceneId, file) {
    const manifest = loadManifest(jobId);
    if (!manifest) throw new Error("Job not found");
    const scene = manifest.scenes.find((s) => Number(s.scene_id) === Number(sceneId));
    if (!scene) throw new Error("Scene not found");

    const p = ensureJobDirs(jobId);
    const outPath = path.join(p.customDir, `scene_${String(sceneId).padStart(2, "0")}_custom.png`);
    fs.writeFileSync(outPath, file.buffer);
    scene.type = "image";
    scene.assetPath = outPath;
    scene.assetUrl = mediaUrl(jobId, outPath);
    scene.source = "custom_image";
    scene.imageAnimationStyle = resolveAnimationStyleId(
        scene.imageAnimationStyle,
        manifest.draftOptions?.imageAnimationStyle
    );
    scene.selectedSuggestionId = null;
    manifest.sceneChoices[String(sceneId)] = "image";
    saveManifest(jobId, manifest);
    return manifest;
}

export async function uploadSceneVideo(jobId, sceneId, file) {
    const manifest = loadManifest(jobId);
    if (!manifest) throw new Error("Job not found");
    const scene = manifest.scenes.find((s) => Number(s.scene_id) === Number(sceneId));
    if (!scene) throw new Error("Scene not found");

    const p = ensureJobDirs(jobId);
    const outPath = path.join(p.customDir, `scene_${String(sceneId).padStart(2, "0")}_custom.mp4`);
    fs.writeFileSync(outPath, file.buffer);
    scene.type = "video";
    scene.assetPath = outPath;
    scene.assetUrl = mediaUrl(jobId, outPath);
    scene.source = "custom_video";
    scene.imageAnimationStyle = null;
    scene.selectedSuggestionId = null;
    manifest.sceneChoices[String(sceneId)] = "video";
    saveManifest(jobId, manifest);
    return manifest;
}

export async function selectStockSuggestion(jobId, sceneId, suggestionId) {
    const manifest = loadManifest(jobId);
    if (!manifest) throw new Error("Job not found");
    const scene = manifest.scenes.find((s) => Number(s.scene_id) === Number(sceneId));
    if (!scene) throw new Error("Scene not found");
    const suggestion = (scene.stockSuggestions || []).find((x) => String(x.id) === String(suggestionId));
    if (!suggestion) throw new Error("Suggestion not found");

    const ctx = ctxForJob(jobId);
    const provider = new PexelsVideoProvider(ctx);
    const outPath = ctx.paths.sceneStockVideo(sceneId);
    await provider.downloadVideoFile(suggestion.previewUrl, outPath);
    scene.type = "video";
    scene.assetPath = outPath;
    scene.assetUrl = mediaUrl(jobId, outPath);
    scene.source = "stock";
    scene.imageAnimationStyle = null;
    scene.selectedSuggestionId = String(suggestionId);
    manifest.sceneChoices[String(sceneId)] = "video";
    saveManifest(jobId, manifest);
    return manifest;
}

export async function refreshStockSuggestions(jobId, sceneId) {
    const manifest = loadManifest(jobId);
    if (!manifest) throw new Error("Job not found");
    const scene = manifest.scenes.find((s) => Number(s.scene_id) === Number(sceneId));
    if (!scene) throw new Error("Scene not found");

    const ctx = ctxForJob(jobId);
    const pScene = manifest.plan.scenes.find((x) => Number(x.scene_id) === Number(sceneId));
    const suggestions = await getStockSuggestions(ctx, pScene, 8);
    scene.stockSuggestions = suggestions.map((x) => ({
        id: x.id,
        duration: x.duration,
        width: x.width,
        height: x.height,
        pexelsUrl: x.pexelsUrl,
        thumbnail: x.thumbnail,
        previewUrl: x.file.link
    }));
    if (!scene.stockSuggestions.find((x) => String(x.id) === String(scene.selectedSuggestionId))) {
        scene.selectedSuggestionId = null;
    }
    saveManifest(jobId, manifest);
    return manifest;
}

export async function generateFinalVideo(jobId) {
    const manifest = loadManifest(jobId);
    if (!manifest) throw new Error("Job not found");
    if (!manifest.plan) throw new Error("Draft is required before final generation");
    const startedAtMs = Number(manifest?.progress?.stats?.finalStartedAtEpochMs || Date.now());

    manifest.status = "FINAL_RUNNING";
    setProgress(jobId, manifest, {
        phase: "final_preparing",
        percent: finalRenderPercent({ phase: "final_preparing" }),
        summary: "Preparing final render assets",
        stats: { currentStep: "preparing" },
        recap: "Final render started"
    });

    const ctx = ctxForJob(jobId, manifest.draftOptions || {});
    ctx.plan = manifest.plan;
    ctx.sceneVisualChoices = Object.fromEntries(
        Object.entries(manifest.sceneChoices).map(([k, v]) => [Number(k), v])
    );
    ctx.sceneVisuals = {};
    for (const s of manifest.scenes) {
        if (s.assetPath && fs.existsSync(s.assetPath)) {
            ctx.sceneVisuals[s.scene_id] = {
                type: s.type,
                path: s.assetPath,
                animationStyle: s.type === "image" ? s.imageAnimationStyle || null : null
            };
        }
    }

    const totalClips = ctx.plan.scenes.length;
    const totalVideoSec = ctx.plan.scenes.reduce(
        (sum, s) => sum + Math.max(0, Number(s.duration_sec || 0)),
        0
    );
    let clipsRendered = 0;
    let renderedSec = 0;
    ctx.onSceneClipReady = (info = {}) => {
        clipsRendered += 1;
        renderedSec += Math.max(0, Number(info.durationSec || 0));
        const ratio = totalClips > 0 ? clipsRendered / totalClips : 1;
        setProgress(jobId, manifest, {
            phase: "final_clips",
            percent: finalRenderPercent({ phase: "final_clips", ratio }),
            summary: `Rendering clips (${clipsRendered}/${totalClips})`,
            stats: {
                clipsRendered,
                totalClips,
                renderedSec,
                totalVideoSec,
                currentStep: "rendering_clips"
            }
        });
    };
    await makeClipsStep(ctx);
    ctx.onSceneClipReady = null;
    setProgress(jobId, manifest, {
        phase: "final_concatenating",
        percent: finalRenderPercent({ phase: "final_concatenating" }),
        summary: "Concatenating clips",
        stats: { currentStep: "concatenating_clips" },
        recap: "Clip rendering completed"
    });
    await concatVisualsStep(ctx);
    setProgress(jobId, manifest, {
        phase: "final_adding_audio",
        percent: finalRenderPercent({ phase: "final_adding_audio" }),
        summary: "Adding voiceover track",
        stats: { currentStep: "adding_audio" }
    });
    await addAudioStep(ctx);
    setProgress(jobId, manifest, {
        phase: "final_verifying",
        percent: finalRenderPercent({ phase: "final_verifying" }),
        summary: "Verifying final output",
        stats: { currentStep: "verifying_output" }
    });

    if (!fs.existsSync(ctx.paths.finalMp4)) {
        throw new Error("Final video file was not produced");
    }

    manifest.artifacts = {
        visualsMp4: ctx.paths.visualsMp4,
        finalMp4: ctx.paths.finalMp4,
        visualsUrl: fs.existsSync(ctx.paths.visualsMp4) ? mediaUrl(jobId, ctx.paths.visualsMp4) : null,
        finalUrl: fs.existsSync(ctx.paths.finalMp4) ? mediaUrl(jobId, ctx.paths.finalMp4) : null
    };
    const finalRenderElapsedSec = Number(Math.max(0, (Date.now() - startedAtMs) / 1000).toFixed(1));
    manifest.artifacts.renderMetrics = {
        ...(manifest.artifacts.renderMetrics || {}),
        finalRenderElapsedSec
    };
    manifest.status = "FINAL_READY";
    setProgress(jobId, manifest, {
        phase: "final_ready",
        percent: finalRenderPercent({ phase: "final_ready" }),
        summary: "Final video generated",
        stats: {
            clipsRendered: totalClips,
            totalClips,
            renderedSec: totalVideoSec,
            totalVideoSec,
            currentStep: "completed",
            finalRenderElapsedSec
        },
        recap: `Render completed in ${formatMinSec(finalRenderElapsedSec)}`
    });
    return manifest;
}
