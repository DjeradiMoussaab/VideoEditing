import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { config as baseConfig } from "../config.mjs";
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
        useTestImages: false
    });
    applyDraftOptionsToContext(ctx, draftOptions);
    return ctx;
}

function sceneView(jobId, s, sceneChoices, sceneAssetPaths, suggestions = [], selectedSuggestionId = null) {
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
        assetPath,
        assetUrl: assetPath && fs.existsSync(assetPath) ? mediaUrl(jobId, assetPath) : null,
        selectedSuggestionId,
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

export function saveProjectInputs(jobId, files) {
    const manifest = loadManifest(jobId);
    if (!manifest) throw new Error("Job not found");

    const p = ensureJobDirs(jobId);
    const voiceFile = files?.voiceover?.[0];
    if (!voiceFile) throw new Error("voiceover file is required");
    fs.writeFileSync(path.join(p.inputDir, "voiceover.mp3"), voiceFile.buffer);
    manifest.inputs.voiceover = path.join(p.inputDir, "voiceover.mp3");

    const refFile = files?.reference?.[0];
    if (refFile) {
        fs.writeFileSync(path.join(p.inputDir, "reference.png"), refFile.buffer);
        manifest.inputs.reference = path.join(p.inputDir, "reference.png");
    }

    manifest.status = "INPUTS_READY";
    saveManifest(jobId, manifest);
    return manifest;
}

export async function generateDraft(jobId, draftOptionsInput = {}) {
    const manifest = loadManifest(jobId);
    if (!manifest) throw new Error("Job not found");
    const draftOptions = normalizeDraftOptions(draftOptionsInput, baseConfig);

    manifest.status = "DRAFT_RUNNING";
    manifest.draftOptions = draftOptions;
    setProgress(jobId, manifest, {
        phase: "planning",
        percent: 5,
        summary: "Analyzing voiceover and planning scenes",
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

    for (const s of ctx.plan.scenes) {
        const choice = ctx.sceneVisualChoices[s.scene_id];
        manifest.sceneChoices[String(s.scene_id)] = choice;
    }
    enforceMaxImages(manifest.sceneChoices, ctx.plan.scenes, draftOptions.maxImages);
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
            videoScenes: plannedVideoCount
        },
        recap: `Visual mix: ${plannedImageCount} images, ${plannedVideoCount} videos`
    });

    let videoProcessed = 0;
    let stockPrepared = 0;
    const totalVideoTargets = plannedVideoCount;
    for (const s of ctx.plan.scenes) {
        const sceneId = s.scene_id;
        const type = manifest.sceneChoices[String(sceneId)];
        if (type === "video") {
            const suggestions = await getStockSuggestions(ctx, s, 9);
            suggestionMap[String(sceneId)] = suggestions;
            if (suggestions.length) {
                const provider = new PexelsVideoProvider(ctx);
                const outPath = ctx.paths.sceneStockVideo(sceneId);
                await provider.downloadVideoFile(suggestions[0].file.link, outPath);
                sceneAssetPaths[String(sceneId)] = outPath;
                ctx.sceneVisuals[sceneId] = { type: "video", path: outPath };
                selectedSuggestionMap[String(sceneId)] = String(suggestions[0].id);
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
            }
        }
    }

    manifest.scenes = ctx.plan.scenes.map((s) =>
        sceneView(
            jobId,
            s,
            manifest.sceneChoices,
            sceneAssetPaths,
            suggestionMap[String(s.scene_id)] || [],
            selectedSuggestionMap[String(s.scene_id)] || null
        )
    );

    manifest.status = "DRAFT_READY";
    const finalImageCount = manifest.scenes.filter((s) => s.type === "image").length;
    const finalVideoCount = manifest.scenes.length - finalImageCount;
    setProgress(jobId, manifest, {
        phase: "draft_ready",
        percent: 100,
        summary: `Draft ready: ${manifest.scenes.length} scenes`,
        stats: {
            totalScenes: manifest.scenes.length,
            imageScenes: finalImageCount,
            videoScenes: finalVideoCount,
            imagesGenerated
        },
        recap: `Draft completed with ${finalImageCount} images and ${finalVideoCount} videos`
    });
    return manifest;
}

export async function setSceneType(jobId, sceneId, type) {
    const manifest = loadManifest(jobId);
    if (!manifest) throw new Error("Job not found");
    const scene = manifest.scenes.find((s) => Number(s.scene_id) === Number(sceneId));
    if (!scene) throw new Error("Scene not found");
    if (type !== "image" && type !== "video") throw new Error("Invalid scene type");

    const ctx = ctxForJob(jobId);
    scene.type = type;
    manifest.sceneChoices[String(sceneId)] = type;
    if (type === "image") {
        const generatedImage = ctx.paths.sceneImage(sceneId);
        if (fs.existsSync(generatedImage)) {
            scene.assetPath = generatedImage;
            scene.assetUrl = mediaUrl(jobId, generatedImage);
        } else {
            scene.assetPath = null;
            scene.assetUrl = null;
        }
    } else {
        const stockVideo = ctx.paths.sceneStockVideo(sceneId);
        if (fs.existsSync(stockVideo)) {
            scene.assetPath = stockVideo;
            scene.assetUrl = mediaUrl(jobId, stockVideo);
        } else {
            scene.assetPath = null;
            scene.assetUrl = null;
        }
    }
    if (type !== "video") {
        scene.selectedSuggestionId = null;
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
    scene.selectedSuggestionId = null;
    manifest.sceneChoices[String(sceneId)] = "image";
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
    const suggestions = await getStockSuggestions(ctx, pScene, 9);
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

    manifest.status = "FINAL_RUNNING";
    setProgress(jobId, manifest, {
        phase: "final_preparing",
        percent: 5,
        summary: "Preparing final render",
        recap: "Final render started"
    });

    const ctx = ctxForJob(jobId);
    ctx.plan = manifest.plan;
    ctx.sceneVisualChoices = Object.fromEntries(
        Object.entries(manifest.sceneChoices).map(([k, v]) => [Number(k), v])
    );
    ctx.sceneVisuals = {};
    for (const s of manifest.scenes) {
        if (s.assetPath && fs.existsSync(s.assetPath)) {
            ctx.sceneVisuals[s.scene_id] = { type: s.type, path: s.assetPath };
        }
    }

    const totalClips = ctx.plan.scenes.length;
    let clipsRendered = 0;
    ctx.onSceneClipReady = () => {
        clipsRendered += 1;
        const ratio = totalClips > 0 ? clipsRendered / totalClips : 1;
        setProgress(jobId, manifest, {
            phase: "clips",
            percent: 10 + ratio * 55,
            summary: `Building clips (${clipsRendered}/${totalClips})`,
            stats: { clipsRendered, totalClips }
        });
    };
    await makeClipsStep(ctx);
    ctx.onSceneClipReady = null;
    setProgress(jobId, manifest, {
        phase: "concat",
        percent: 70,
        summary: "Merging clips"
    });
    await concatVisualsStep(ctx);
    setProgress(jobId, manifest, {
        phase: "audio",
        percent: 88,
        summary: "Mixing voiceover with visuals"
    });
    await addAudioStep(ctx);
    setProgress(jobId, manifest, {
        phase: "packaging",
        percent: 96,
        summary: "Packaging final video"
    });

    manifest.artifacts = {
        visualsMp4: ctx.paths.visualsMp4,
        finalMp4: ctx.paths.finalMp4,
        visualsUrl: fs.existsSync(ctx.paths.visualsMp4) ? mediaUrl(jobId, ctx.paths.visualsMp4) : null,
        finalUrl: fs.existsSync(ctx.paths.finalMp4) ? mediaUrl(jobId, ctx.paths.finalMp4) : null
    };
    manifest.status = "FINAL_READY";
    setProgress(jobId, manifest, {
        phase: "final_ready",
        percent: 100,
        summary: "Final video ready",
        recap: "Render completed"
    });
    return manifest;
}
