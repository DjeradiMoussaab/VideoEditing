import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { createContext } from "../context.mjs";
import { planScenesStep } from "../steps/01-plan-scenes.mjs";
import { decideSceneVisualsStep } from "../steps/02a-decide-scene-visuals.mjs";
import { generateImagesStep } from "../steps/02-generate-images.mjs";
import { makeClipsStep } from "../steps/03-make-clips.mjs";
import { concatVisualsStep } from "../steps/04-concat-visuals.mjs";
import { addAudioStep } from "../steps/05-add-audio.mjs";
import { transcribeSrtStep } from "../steps/06-transcribe-srt.mjs";
import { burnSubtitlesStep } from "../steps/07-burn-subtitles.mjs";
import {
    createManifest,
    ensureJobDirs,
    loadManifest,
    mediaUrl,
    saveManifest
} from "./job-store.service.mjs";
import { getStockSuggestions } from "./stock-suggestions.service.mjs";
import { PexelsVideoProvider } from "../providers/pexels-video-provider.mjs";

function ctxForJob(jobId) {
    const p = ensureJobDirs(jobId);
    return createContext({
        inputDir: p.inputDir,
        outDir: p.outDir,
        visualSource: "mixed_random",
        mockOpenAI: false,
        useTestImages: false
    });
}

function sceneView(jobId, s, sceneChoices, sceneAssetPaths, suggestions = []) {
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

export function saveProjectInputs(jobId, files, body) {
    const manifest = loadManifest(jobId);
    if (!manifest) throw new Error("Job not found");

    const p = ensureJobDirs(jobId);
    const voiceFile = files?.voiceover?.[0];
    if (!voiceFile) throw new Error("voiceover file is required");
    fs.writeFileSync(path.join(p.inputDir, "voiceover.mp3"), voiceFile.buffer);
    manifest.inputs.voiceover = path.join(p.inputDir, "voiceover.mp3");

    const storyFile = files?.story?.[0];
    if (storyFile) {
        fs.writeFileSync(path.join(p.inputDir, "story.txt"), storyFile.buffer);
        manifest.inputs.story = path.join(p.inputDir, "story.txt");
    } else if (body?.storyText) {
        fs.writeFileSync(path.join(p.inputDir, "story.txt"), String(body.storyText));
        manifest.inputs.story = path.join(p.inputDir, "story.txt");
    }

    const refFile = files?.reference?.[0];
    if (refFile) {
        fs.writeFileSync(path.join(p.inputDir, "reference.png"), refFile.buffer);
        manifest.inputs.reference = path.join(p.inputDir, "reference.png");
    }

    manifest.status = "INPUTS_READY";
    saveManifest(jobId, manifest);
    return manifest;
}

export async function generateDraft(jobId) {
    const manifest = loadManifest(jobId);
    if (!manifest) throw new Error("Job not found");

    manifest.status = "DRAFT_RUNNING";
    saveManifest(jobId, manifest);

    const ctx = ctxForJob(jobId);
    await planScenesStep(ctx);
    await decideSceneVisualsStep(ctx);

    manifest.plan = ctx.plan;
    manifest.sceneChoices = {};
    const sceneAssetPaths = {};
    const suggestionMap = {};

    for (const s of ctx.plan.scenes) {
        const choice = ctx.sceneVisualChoices[s.scene_id];
        manifest.sceneChoices[String(s.scene_id)] = choice;
    }

    saveManifest(jobId, manifest);

    for (const s of ctx.plan.scenes) {
        const sceneId = s.scene_id;
        const type = manifest.sceneChoices[String(sceneId)];
        if (type === "video") {
            const suggestions = await getStockSuggestions(ctx, s, 10);
            suggestionMap[String(sceneId)] = suggestions;
            if (suggestions.length) {
                const provider = new PexelsVideoProvider(ctx);
                const outPath = ctx.paths.sceneStockVideo(sceneId);
                await provider.downloadVideoFile(suggestions[0].file.link, outPath);
                sceneAssetPaths[String(sceneId)] = outPath;
                ctx.sceneVisuals[sceneId] = { type: "video", path: outPath };
            } else if (ctx.config.visual.fallbackToImagesWhenNoStock) {
                manifest.sceneChoices[String(sceneId)] = "image";
            }
        }
    }

    ctx.sceneVisualChoices = Object.fromEntries(
        Object.entries(manifest.sceneChoices).map(([k, v]) => [Number(k), v])
    );
    await generateImagesStep(ctx);

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
        sceneView(jobId, s, manifest.sceneChoices, sceneAssetPaths, suggestionMap[String(s.scene_id)] || [])
    );

    manifest.status = "DRAFT_READY";
    saveManifest(jobId, manifest);
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
    const suggestions = await getStockSuggestions(ctx, pScene, 10);
    scene.stockSuggestions = suggestions.map((x) => ({
        id: x.id,
        duration: x.duration,
        width: x.width,
        height: x.height,
        pexelsUrl: x.pexelsUrl,
        thumbnail: x.thumbnail,
        previewUrl: x.file.link
    }));
    saveManifest(jobId, manifest);
    return manifest;
}

export async function generateFinalVideo(jobId) {
    const manifest = loadManifest(jobId);
    if (!manifest) throw new Error("Job not found");
    if (!manifest.plan) throw new Error("Draft is required before final generation");

    manifest.status = "FINAL_RUNNING";
    saveManifest(jobId, manifest);

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

    await makeClipsStep(ctx);
    await concatVisualsStep(ctx);
    await addAudioStep(ctx);
    await transcribeSrtStep(ctx);
    await burnSubtitlesStep(ctx);

    manifest.artifacts = {
        visualsMp4: ctx.paths.visualsMp4,
        finalMp4: ctx.paths.finalMp4,
        subtitlesSrt: ctx.paths.subtitlesSrt,
        finalSubbedMp4: ctx.paths.finalSubbedMp4,
        visualsUrl: fs.existsSync(ctx.paths.visualsMp4) ? mediaUrl(jobId, ctx.paths.visualsMp4) : null,
        finalUrl: fs.existsSync(ctx.paths.finalMp4) ? mediaUrl(jobId, ctx.paths.finalMp4) : null,
        finalSubbedUrl: fs.existsSync(ctx.paths.finalSubbedMp4) ? mediaUrl(jobId, ctx.paths.finalSubbedMp4) : null
    };
    manifest.status = "FINAL_READY";
    saveManifest(jobId, manifest);
    return manifest;
}
