import { preserveGeneratedVideo, canDeleteProject } from "./project-history.service.mjs";
import { startJobProcess } from './job-process.service.mjs';
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { config as baseConfig } from "../config.mjs";
import { apiConfig } from "../config/api.config.mjs";
import { createContext } from "../context.mjs";
import { planScenesStep } from "../steps/01-plan-scenes.mjs";
import { decideSceneVisualsStep } from "../steps/02a-decide-scene-visuals.mjs";
import { prepareReferenceImagesStep } from "../steps/02-prepare-reference-images.mjs";
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
import { buildReferenceCatalogWithCaptions } from "./reference-caption.service.mjs";
import { scoreReferencesForScenesWithOpenAI } from "./reference-ai-scoring.service.mjs";
import {
    buildSceneAllocation
} from "./scene-allocation.service.mjs";

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

const LEGACY_IMAGE_ANIMATION_STYLE_IDS = {
    fullscreen_zoom: "fullscreen_zoom_in",
    static_frame: "documentary_frame",
    surprise_animation: "gentle_settle",
    capcut_zoom1: "gentle_settle"
};

function migrateImageAnimationStyleId(value) {
    const id = String(value || "");
    return LEGACY_IMAGE_ANIMATION_STYLE_IDS[id] || id;
}

function normalizeDraftOptions(options = {}, baseConfig) {
    const out = {};

    const maxImages = toIntOrNull(options.maxImages);
    if (maxImages !== null) out.maxImages = clamp(maxImages, 0, 1000);

    const imageMinSceneDurationSec = toNumberOrNull(options.imageMinSceneDurationSec);
    const imageMaxSceneDurationSec = toNumberOrNull(options.imageMaxSceneDurationSec);
    const videoMinSceneDurationSec = toNumberOrNull(options.videoMinSceneDurationSec);
    const videoMaxSceneDurationSec = toNumberOrNull(options.videoMaxSceneDurationSec);

    // Backward compatibility with previous single-range options.
    const legacyMinSceneDurationSec = toNumberOrNull(options.minSceneDurationSec);
    const legacyMaxSceneDurationSec = toNumberOrNull(options.maxSceneDurationSec);

    const baseImageMin = Number(baseConfig.visual?.sceneDurationSec?.image?.min ?? 6);
    const baseImageMax = Number(baseConfig.visual?.sceneDurationSec?.image?.max ?? 15);
    const baseVideoMin = Number(baseConfig.visual?.sceneDurationSec?.video?.min ?? 6);
    const baseVideoMax = Number(baseConfig.visual?.sceneDurationSec?.video?.max ?? 15);

    const hasImageRange =
        imageMinSceneDurationSec !== null ||
        imageMaxSceneDurationSec !== null ||
        legacyMinSceneDurationSec !== null ||
        legacyMaxSceneDurationSec !== null;
    if (hasImageRange) {
        const minValue = imageMinSceneDurationSec !== null
            ? clamp(imageMinSceneDurationSec, 1, 120)
            : (legacyMinSceneDurationSec !== null ? clamp(legacyMinSceneDurationSec, 1, 120) : baseImageMin);
        const maxRaw = imageMaxSceneDurationSec !== null
            ? imageMaxSceneDurationSec
            : (legacyMaxSceneDurationSec !== null ? legacyMaxSceneDurationSec : baseImageMax);
        const maxValue = clamp(maxRaw, minValue, 240);
        out.imageMinSceneDurationSec = minValue;
        out.imageMaxSceneDurationSec = Math.max(minValue, maxValue);
    }

    const hasVideoRange =
        videoMinSceneDurationSec !== null ||
        videoMaxSceneDurationSec !== null ||
        legacyMinSceneDurationSec !== null ||
        legacyMaxSceneDurationSec !== null;
    if (hasVideoRange) {
        const minValue = videoMinSceneDurationSec !== null
            ? clamp(videoMinSceneDurationSec, 1, 120)
            : (legacyMinSceneDurationSec !== null ? clamp(legacyMinSceneDurationSec, 1, 120) : baseVideoMin);
        const maxRaw = videoMaxSceneDurationSec !== null
            ? videoMaxSceneDurationSec
            : (legacyMaxSceneDurationSec !== null ? legacyMaxSceneDurationSec : baseVideoMax);
        const maxValue = clamp(maxRaw, minValue, 240);
        out.videoMinSceneDurationSec = minValue;
        out.videoMaxSceneDurationSec = Math.max(minValue, maxValue);
    }

    out.useReferencesOnly = true;
    out.useReferenceCaptionMatching = true;
    out.useQuoteDetection = options.useQuoteDetection === undefined
        ? true
        : Boolean(options.useQuoteDetection);

    const maxReferenceReuse = toIntOrNull(options.maxReferenceReuse);
    if (maxReferenceReuse !== null) {
        out.maxReferenceReuse = clamp(maxReferenceReuse, 1, 50);
    }

    if (options.imageAnimationStyle !== undefined && options.imageAnimationStyle !== null) {
        const requested = migrateImageAnimationStyleId(options.imageAnimationStyle);
        const profiles = baseConfig.video?.imageAnimationProfiles || {};
        if (!profiles[requested]) {
            const allowed = Object.keys(profiles).join(", ");
            throw new Error(`Invalid imageAnimationStyle "${requested}". Allowed values: ${allowed}`);
        }
        out.imageAnimationStyle = requested;
    }

    if (options.renderProfile !== undefined && options.renderProfile !== null) {
        const requested = String(options.renderProfile);
        const profiles = baseConfig.video?.renderProfiles || {};
        if (!profiles[requested]) {
            const allowed = Object.keys(profiles).join(", ");
            throw new Error(`Invalid renderProfile "${requested}". Allowed values: ${allowed}`);
        }
        out.renderProfile = requested;
    }

    return out;
}

function applyDraftOptionsToContext(ctx, draftOptions = {}) {
    const cfg = cloneConfig(ctx.config);

    cfg.visual.sceneDurationSec = cfg.visual.sceneDurationSec || {};
    cfg.visual.sceneDurationSec.image = cfg.visual.sceneDurationSec.image || {};
    cfg.visual.sceneDurationSec.video = cfg.visual.sceneDurationSec.video || {};

    if (draftOptions.imageMinSceneDurationSec !== undefined) {
        cfg.visual.sceneDurationSec.image.min = Number(draftOptions.imageMinSceneDurationSec);
    }
    if (draftOptions.imageMaxSceneDurationSec !== undefined) {
        cfg.visual.sceneDurationSec.image.max = Number(draftOptions.imageMaxSceneDurationSec);
    }
    if (draftOptions.videoMinSceneDurationSec !== undefined) {
        cfg.visual.sceneDurationSec.video.min = Number(draftOptions.videoMinSceneDurationSec);
    }
    if (draftOptions.videoMaxSceneDurationSec !== undefined) {
        cfg.visual.sceneDurationSec.video.max = Number(draftOptions.videoMaxSceneDurationSec);
    }
    if (draftOptions.imageAnimationStyle !== undefined) {
        cfg.video.imageAnimationStyle = String(draftOptions.imageAnimationStyle);
    }
    if (draftOptions.renderProfile !== undefined) {
        cfg.video.renderProfile = String(draftOptions.renderProfile);
    }
    ctx.config = cfg;
}

function ctxForJob(jobId, draftOptions = {}) {
    const p = ensureJobDirs(jobId);
    const ctx = createContext({
        inputDir: p.inputDir,
        outDir: p.outDir,
        visualSource: "mixed_random",
        mockOpenAI: false,
        useTestImages: false,
        useReferencesOnly: true,
        useQuoteDetection: draftOptions.useQuoteDetection !== false,
        maxReferenceReuse: Number(draftOptions.maxReferenceReuse ?? 2),
        imageAnimationStyle: String(draftOptions.imageAnimationStyle ?? baseConfig.video.imageAnimationStyle),
        renderProfile: String(draftOptions.renderProfile ?? baseConfig.video.renderProfile ?? "final")
    });
    applyDraftOptionsToContext(ctx, draftOptions);
    return ctx;
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
    imageAnimationStyle = null,
    stockSearchQuery = null
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
        quoteText: s.quoteText ?? s.quote_text ?? null,
        quoteAuthor: s.quoteAuthor || "",
        type,
        source,
        imageAnimationStyle: type === "image" ? imageAnimationStyle : null,
        assetPath,
        assetUrl: assetPath && fs.existsSync(assetPath) ? mediaUrl(jobId, assetPath) : null,
        selectedSuggestionId,
        stockSearchQuery: stockSearchQuery || null,
        referenceMatches: referenceMatches.map((x) => ({
            id: x.id,
            filename: x.filename,
            score: x.score,
            reason: x.reason || null,
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

function draftFailureMessage(error) {
    const message = String(error?.message || error || "Scene generation failed").trim();
    const isConnectionFailure =
        /connection error|fetch failed|network error|econnreset|econnrefused|enotfound|etimedout/i.test(message) ||
        /apiconnectionerror/i.test(String(error?.name || ""));

    if (isConnectionFailure) {
        return "Could not reach OpenAI while generating scenes. Check your internet or proxy/VPN connection, then try again.";
    }
    return message;
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
    const requestedStyle = migrateImageAnimationStyleId(styleId);
    const fallbackStyle = migrateImageAnimationStyleId(fallbackStyleId);
    const candidate = String(
        requestedStyle ||
        fallbackStyle ||
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

async function createFallbackStockClip(ctx, sceneId, durationSec) {
    const outPath = ctx.paths.sceneStockVideo(sceneId);
    const width = Number(ctx.config.video?.width || 1920);
    const height = Number(ctx.config.video?.height || 1080);
    const fps = Number(ctx.config.video?.fps || 30);
    const safeDuration = Math.max(0.8, Number(durationSec || 1));
    const cmd = [
        "ffmpeg -y",
        `-f lavfi -i "color=c=black:s=${width}x${height}:r=${fps}"`,
        `-t ${safeDuration}`,
        "-an",
        '-c:v libx264 -preset veryfast -pix_fmt yuv420p',
        `"${outPath}"`
    ].join(" ");
    if (typeof ctx.ffmpeg.execAsync === "function") {
        await ctx.ffmpeg.execAsync(cmd);
    } else {
        ctx.ffmpeg.exec(cmd);
    }
    return outPath;
}

function pickReferenceImageFallbackForScene(sceneId, sceneReferenceMap, referenceCatalog) {
    const matches = Array.isArray(sceneReferenceMap?.[String(sceneId)]) ? sceneReferenceMap[String(sceneId)] : [];
    for (const m of matches) {
        if (m?.path && fs.existsSync(m.path)) return m.path;
    }
    for (const ref of referenceCatalog || []) {
        if (ref?.path && fs.existsSync(ref.path)) return ref.path;
    }
    return null;
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

function roundSec(n) {
    return Number(Number(n || 0).toFixed(3));
}

function unlinkIfExists(filePath) {
    if (filePath && fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
    }
}

export function createJob() {
    const jobId = randomUUID().slice(0, 12);
    ensureJobDirs(jobId);
    const manifest = createManifest(jobId);
    saveManifest(jobId, manifest);
    return manifest;
}

export function getJob(jobId) {
    const manifest = loadManifest(jobId);
    if (!manifest) return null;
    return manifest;
}

export function listGeneratedVideosHistory() {
    const jobsDir = apiConfig.jobsDir;
    if (!fs.existsSync(jobsDir)) return [];

    const entries = fs.readdirSync(jobsDir, { withFileTypes: true })
        .filter((e) => e.isDirectory() && !e.name.startsWith("."))
        .map((e) => e.name);

    const rows = [];
    for (const jobId of entries) {
        const manifest = loadManifest(jobId);
        if (!manifest) continue;
        const finalUrl = manifest?.artifacts?.finalUrl || null;

        const scenes = Array.isArray(manifest.scenes) ? manifest.scenes : [];
        if (!finalUrl && scenes.length === 0 && !manifest.inputs?.voiceover) continue;
        const totalDurationSec = scenes.reduce(
            (sum, s) => sum + Math.max(0, Number(s?.duration_sec || 0)),
            0
        );
        const status = String(manifest.status || "UNKNOWN");
        const isFinished = status === "FINAL_READY" && Boolean(finalUrl);

        rows.push({
            id: manifest.id || jobId,
            status,
            isFinished,
            canDelete: canDeleteProject(manifest),
            isRunning: ["DRAFT_RUNNING", "FINAL_RUNNING"].includes(status),
            generatedVideos: manifest.generatedVideos || [],
            createdAt: manifest.createdAt || null,
            updatedAt: manifest.updatedAt || null,
            finalUrl,
            downloadUrl: finalUrl ? `${finalUrl}${finalUrl.includes("?") ? "&" : "?"}download=1` : null,
            renderProfile: manifest?.progress?.stats?.renderProfile || manifest?.draftOptions?.renderProfile || null,
            sceneCount: scenes.length,
            durationSec: Number(totalDurationSec.toFixed(2)),
            referenceCount: Array.isArray(manifest?.inputs?.references) ? manifest.inputs.references.length : 0,
            imageCount: scenes.filter((s) => s?.type === "image").length,
            videoCount: scenes.filter((s) => s?.type === "video").length,
            finalRenderElapsedSec: Number(
                manifest?.artifacts?.renderMetrics?.finalRenderElapsedSec ??
                manifest?.progress?.stats?.finalRenderElapsedSec ??
                0
            ) || null
        });
    }

    rows.sort((a, b) => {
        const ta = new Date(a.updatedAt || a.createdAt || 0).getTime();
        const tb = new Date(b.updatedAt || b.createdAt || 0).getTime();
        return tb - ta;
    });

    return rows;
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

export function startFinalVideoJob(jobId, options = {}) {
    const force = Boolean(options?.force);
    console.log(`[final-queue] request jobId=${jobId} force=${force}`);
    const manifest = loadManifest(jobId);
    if (!manifest) throw new Error("Job not found");
    if (!manifest.plan) throw new Error("Draft is required before final generation");
    if (manifest.status === "FINAL_RUNNING") {
        if (force) {
            console.warn(
                `[final-queue] forcing restart jobId=${jobId} previousPhase=${manifest?.progress?.phase || "-"}`
            );
        } else {
        console.warn(
            `[final-queue] skip spawn jobId=${jobId} reason=already FINAL_RUNNING phase=${manifest?.progress?.phase || "-"} summary=${manifest?.progress?.summary || "-"}`
        );
        return manifest;
        }
    }
    preserveGeneratedVideo(jobId, manifest);
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
            renderProfile: String(manifest.draftOptions?.renderProfile || baseConfig.video.renderProfile || "final"),
            imageAnimationStyle: animationProfile?.id || null,
            imageAnimationLabel: animationProfile?.label || null,
            estimatedM1SecPer1SecClip: animationProfile?.estimatedM1SecPer1SecClip || null,
            estimatedM1TotalRenderSec: animationProfile?.estimatedM1SecPer1SecClip || null
        },
        recap: "Final render queued"
    });

    const runnerPath = path.join(apiConfig.rootDir, "src/jobs/run-final-job.mjs");
    const detachFinalJob = String(process.env.DETACH_FINAL_JOB ?? "false").toLowerCase() === "true";
    console.log(`[final-queue] spawning runner jobId=${jobId} detach=${detachFinalJob}`);
    startJobProcess(jobId, runnerPath, apiConfig.rootDir);

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

export async function startDraftJob(jobId, options = {}) {
    const manifest = loadManifest(jobId);
    if (!manifest) throw new Error('Project not found');
    manifest.draftOptions = normalizeDraftOptions(options, baseConfig);
    manifest.status = 'DRAFT_RUNNING';
    saveManifest(jobId, manifest);
    const code = await startJobProcess(jobId, path.join(apiConfig.rootDir, 'src/jobs/run-draft-job.mjs'), apiConfig.rootDir);
    const result = loadManifest(jobId);
    if (!result) throw new Error('Project was deleted');
    if (code !== 0) throw new Error(result.progress?.summary || 'Scene generation failed');
    return result;
}

export async function generateDraft(jobId, draftOptionsInput = {}) {
    const manifest = loadManifest(jobId);
    if (!manifest) throw new Error("Job not found");
    const draftOptions = normalizeDraftOptions(draftOptionsInput, baseConfig);
    if (!draftOptions.imageAnimationStyle) {
        draftOptions.imageAnimationStyle = String(baseConfig.video.imageAnimationStyle);
    }
    if (!draftOptions.renderProfile) {
        draftOptions.renderProfile = String(baseConfig.video.renderProfile ?? "final");
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
    try {
        await planScenesStep(ctx);
    } catch (error) {
        const message = draftFailureMessage(error);
        manifest.status = "DRAFT_FAILED";
        setProgress(jobId, manifest, {
            phase: "draft_failed",
            percent: 0,
            summary: message,
            recap: "Draft generation failed"
        });
        throw new Error(message);
    }
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
    const initialSceneChoices = {};
    const suggestionMap = {};
    const selectedSuggestionMap = {};
    const stockSearchQueryMap = {};
    for (const s of ctx.plan.scenes) {
        initialSceneChoices[String(s.scene_id)] = ctx.sceneVisualChoices[s.scene_id];
    }

    const referenceCatalog = buildReferenceCatalog(manifest.inputs.references || []);
    let referenceCatalogForMatch = referenceCatalog;
    if (draftOptions.useReferenceCaptionMatching && referenceCatalog.length) {
        const captionModel = String(ctx.config.models?.referenceCaption || ctx.config.models?.planner || "gpt-4.1-mini");
        const captioned = await buildReferenceCatalogWithCaptions({
            openai: ctx.openai,
            model: captionModel,
            referenceCatalog,
            cacheIndex: manifest.referenceCaptionIndex || {}
        });
        referenceCatalogForMatch = captioned.catalog;
        manifest.referenceCaptionIndex = captioned.index;
    }
    let referencePlan = null;
    if (draftOptions.useReferenceCaptionMatching && referenceCatalogForMatch.length && ctx.openai) {
        const scoringModel = String(
            ctx.config.models?.referenceScoring ||
            ctx.config.models?.planner ||
            "gpt-4.1-mini"
        );
        try {
            const scored = await scoreReferencesForScenesWithOpenAI({
                openai: ctx.openai,
                model: scoringModel,
                scenes: ctx.plan.scenes,
                referenceCatalog: referenceCatalogForMatch,
                cacheIndex: manifest.referenceScoringIndex || {},
                sceneIdsToScore: null
            });
            referencePlan = scored.plan;
            manifest.referenceScoringIndex = scored.index;
            setProgress(jobId, manifest, {
                phase: "visual_decision",
                percent: 32,
                summary: "Scoring reference/image relevance",
                stats: {
                    scoringScenesScoped: Number(scored?.stats?.totalScoped || 0),
                    scoringFromCache: Number(scored?.stats?.fromCache || 0),
                    scoringRescored: Number(scored?.stats?.rescored || 0),
                    scoringTokenBaseline: Number(scored?.stats?.tokenEstimates?.baselineTotalTokens || 0),
                    scoringTokenActual: Number(scored?.stats?.tokenEstimates?.actualTotalTokens || 0),
                    scoringTokenSaved: Number(scored?.stats?.tokenEstimates?.savedTotalTokens || 0),
                    scoringInputTokenSaved: Number(scored?.stats?.tokenEstimates?.savedInputTokens || 0),
                    scoringOutputTokenSaved: Number(scored?.stats?.tokenEstimates?.savedOutputTokens || 0)
                }
            });
        } catch {
            referencePlan = null;
        }
    }
    if (!referencePlan) {
        referencePlan = matchReferencesToScenes(ctx.plan.scenes, referenceCatalogForMatch, {
            useCaptionMatching: Boolean(draftOptions.useReferenceCaptionMatching)
        });
    }
    const allocation = buildSceneAllocation({
        scenes: ctx.plan.scenes,
        initialChoices: initialSceneChoices,
        referenceCatalog,
        referencePlan,
        config: ctx.config,
        draftOptions,
        minSceneGap: 3
    });

    manifest.sceneChoices = allocation.sceneChoices;
    const sceneAssetPaths = allocation.sceneAssetPaths;
    const sceneSourceMap = allocation.sceneSourceMap;
    const sceneReferenceMap = allocation.sceneReferenceMap;

    for (const s of ctx.plan.scenes) {
        const sceneId = String(s.scene_id);
        const assignedPath = sceneAssetPaths[sceneId];
        if (manifest.sceneChoices[sceneId] === "image" && assignedPath) {
            ctx.sceneVisuals[s.scene_id] = { type: "image", path: assignedPath, source: sceneSourceMap[sceneId] || "reference" };
        }
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
            requestedImageRatio: allocation.stats.requestedImageRatio,
            requestedVideoRatio: allocation.stats.requestedVideoRatio,
            targetImageCount: Number(allocation.stats.targetImageCount ?? 0),
            referenceCapacity: allocation.stats.referenceCapacity ?? null,
            referenceScenes: Number(allocation.stats.referenceScenesUsed || 0),
            imageScenesConvertedToVideo: Number(allocation.stats.imageScenesConvertedToVideo || 0),
            forcedImageScenes: Number(allocation.stats.forcedImageScenes || 0),
            unassignedReferenceImages: Number(allocation.stats.unassignedReferenceImages || 0),
            allocationStrategy: allocation.stats.strategy || "score_only",
            minReferenceMatchScore: allocation.stats.minReferenceMatchScore ?? null
        },
        recap: `Reference images: ${plannedImageCount} image scenes, ${plannedVideoCount} videos, ${Number(allocation.stats.imageScenesConvertedToVideo || 0)} converted to video${Number(allocation.stats.unassignedReferenceImages || 0) ? `, ${Number(allocation.stats.unassignedReferenceImages || 0)} references not placed` : ""}`
    });

    let videoProcessed = 0;
    let stockPrepared = 0;
    const totalVideoTargets = plannedVideoCount;
    for (const s of ctx.plan.scenes) {
        const sceneId = s.scene_id;
        const type = manifest.sceneChoices[String(sceneId)];
        if (type === "video" || type === "quote") {
            try {
                const stockFetch = await getStockSuggestions(ctx, s, 12);
                const suggestions = stockFetch.suggestions || [];
                suggestionMap[String(sceneId)] = suggestions;
                stockSearchQueryMap[String(sceneId)] = stockFetch.query || null;
                if (suggestions.length) {
                    const provider = new PexelsVideoProvider(ctx);
                    const outPath = ctx.paths.sceneStockVideo(sceneId);
                    await provider.downloadVideoFile(suggestions[0].file.link, outPath);
                    sceneAssetPaths[String(sceneId)] = outPath;
                    ctx.sceneVisuals[sceneId] = {
                        type: type === "quote" ? "quote" : "video",
                        path: outPath,
                        quoteText: type === "quote" ? String(s.quote_text || s.narration || "") : null
                    };
                    selectedSuggestionMap[String(sceneId)] = String(suggestions[0].id);
                    sceneSourceMap[String(sceneId)] = type === "quote" ? "quote_stock" : "stock";
                    stockPrepared += 1;
                } else {
                    const fallbackPath = await createFallbackStockClip(ctx, sceneId, s.duration_sec);
                    sceneAssetPaths[String(sceneId)] = fallbackPath;
                    ctx.sceneVisuals[sceneId] = {
                        type: type === "quote" ? "quote" : "video",
                        path: fallbackPath,
                        quoteText: type === "quote" ? String(s.quote_text || s.narration || "") : null
                    };
                    selectedSuggestionMap[String(sceneId)] = null;
                    sceneSourceMap[String(sceneId)] = type === "quote" ? "quote_stock_fallback" : "stock_fallback";
                }
            } catch (error) {
                const query = stockSearchQueryMap[String(sceneId)] || s?.visual || "-";
                if (type === "quote") {
                    const fallbackPath = await createFallbackStockClip(ctx, sceneId, s.duration_sec);
                    sceneAssetPaths[String(sceneId)] = fallbackPath;
                    ctx.sceneVisuals[sceneId] = {
                        type: "quote",
                        path: fallbackPath,
                        quoteText: String(s.quote_text || s.narration || "")
                    };
                    selectedSuggestionMap[String(sceneId)] = null;
                    sceneSourceMap[String(sceneId)] = "quote_stock_fallback";
                } else {
                const refFallback = pickReferenceImageFallbackForScene(sceneId, sceneReferenceMap, referenceCatalog);
                if (refFallback) {
                    manifest.sceneChoices[String(sceneId)] = "image";
                    sceneAssetPaths[String(sceneId)] = refFallback;
                    ctx.sceneVisuals[sceneId] = { type: "image", path: refFallback, source: "reference_fallback" };
                    selectedSuggestionMap[String(sceneId)] = null;
                    sceneSourceMap[String(sceneId)] = "reference_fallback";
                } else {
                    const original = error instanceof Error ? error.message : String(error);
                    throw new Error(
                        `Stock video preparation failed for scene ${sceneId} (query: "${query}"). Original error: ${original}`
                    );
                }
                }
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
    let imageAssetsPrepared = 0;
    ctx.onSceneImageReady = () => {
        imageAssetsPrepared += 1;
        const ratio = totalImageTargets > 0 ? imageAssetsPrepared / totalImageTargets : 1;
        setProgress(jobId, manifest, {
            phase: "reference_image_preparation",
            percent: 55 + ratio * 30,
            summary: `Preparing reference images (${imageAssetsPrepared}/${totalImageTargets})`,
            stats: { imageAssetsPrepared, imageScenes: totalImageTargets }
        });
    };
    await prepareReferenceImagesStep(ctx);
    ctx.onSceneImageReady = null;

    for (const s of ctx.plan.scenes) {
        const sceneId = s.scene_id;
        if (manifest.sceneChoices[String(sceneId)] === "image") {
            const pth = ctx.paths.sceneImage(sceneId);
            if (!sceneAssetPaths[String(sceneId)] && fs.existsSync(pth)) {
                sceneAssetPaths[String(sceneId)] = pth;
                if (!sceneSourceMap[String(sceneId)]) sceneSourceMap[String(sceneId)] = "reference";
            }
        }
    }

    const sceneAnimationStyleMap = {};
    for (const s of ctx.plan.scenes) {
        const sceneId = String(s.scene_id);
        sceneAnimationStyleMap[sceneId] = manifest.sceneChoices[sceneId] === "image"
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
            sceneAnimationStyleMap[String(s.scene_id)] || null,
            stockSearchQueryMap[String(s.scene_id)] || null
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
            imageAssetsPrepared,
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
    const hasQuoteTextUpdate = updates.quoteText !== undefined;
    const hasQuoteAuthorUpdate = updates.quoteAuthor !== undefined;
    if (!hasTypeUpdate && !hasAnimationUpdate && !hasQuoteTextUpdate && !hasQuoteAuthorUpdate) {
        throw new Error("No scene update provided");
    }

    const type = hasTypeUpdate ? String(updates.type) : scene.type;
    if (type !== "image" && type !== "video" && type !== "quote") throw new Error("Invalid scene type");
    const defaultAnimationStyle = resolveAnimationStyleId(
        scene.imageAnimationStyle,
        manifest.draftOptions?.imageAnimationStyle
    );
    const requestedAnimationStyle = hasAnimationUpdate
        ? resolveAnimationStyleId(updates.imageAnimationStyle, manifest.draftOptions?.imageAnimationStyle)
        : null;

    const previousType = scene.type;
    const ctx = previousType !== type ? ctxForJob(jobId) : null;
    scene.type = type;
    if (hasQuoteTextUpdate) {
        scene.quoteText = String(updates.quoteText || "").trim();
    }
    if (hasQuoteAuthorUpdate) scene.quoteAuthor = String(updates.quoteAuthor || "").trim();
    if (scene.quoteText == null && type === "quote") {
        scene.quoteText = String(scene.narration || "").trim() || null;
    }
    manifest.sceneChoices[String(sceneId)] = type;
    if (type === "image" && previousType !== "image") {
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
    } else if (type === "quote" && previousType !== "quote") {
        let quoteBgPath = null;
        if (scene.assetPath && fs.existsSync(scene.assetPath)) {
            quoteBgPath = scene.assetPath;
        } else {
            const stockVideo = ctx.paths.sceneStockVideo(sceneId);
            if (fs.existsSync(stockVideo)) {
                quoteBgPath = stockVideo;
            } else if (Array.isArray(scene.stockSuggestions) && scene.stockSuggestions.length) {
                try {
                    const provider = new PexelsVideoProvider(ctx);
                    await provider.downloadVideoFile(scene.stockSuggestions[0].previewUrl, stockVideo);
                    quoteBgPath = stockVideo;
                } catch {
                    quoteBgPath = await createFallbackStockClip(ctx, sceneId, scene.duration_sec);
                }
            }
        }
        if (!quoteBgPath) {
            quoteBgPath = await createFallbackStockClip(ctx, sceneId, scene.duration_sec);
        }
        scene.assetPath = quoteBgPath;
        scene.assetUrl = quoteBgPath ? mediaUrl(jobId, quoteBgPath) : null;
        scene.source = "quote";
        scene.stockSearchQuery = null;
    }
    if (previousType === "video" && type === "image") {
        scene.stockSearchQuery = null;
    }
    if (type !== "video") {
        scene.selectedSuggestionId = null;
        scene.imageAnimationStyle = type === "image"
            ? (requestedAnimationStyle || scene.imageAnimationStyle || defaultAnimationStyle)
            : null;
    } else {
        scene.imageAnimationStyle = null;
    }

    if (type === "image" && requestedAnimationStyle) {
        scene.imageAnimationStyle = requestedAnimationStyle;
    }
    saveManifest(jobId, manifest);
    return manifest;
}

export async function adjustSceneBoundary(jobId, sceneId, deltaSecInput) {
    const manifest = loadManifest(jobId);
    if (!manifest) throw new Error("Job not found");
    if (!manifest.plan || !Array.isArray(manifest.plan.scenes)) {
        throw new Error("Draft is required before editing scene duration");
    }

    const sceneIndex = manifest.scenes.findIndex((s) => Number(s.scene_id) === Number(sceneId));
    if (sceneIndex < 0) throw new Error("Scene not found");
    if (sceneIndex >= manifest.scenes.length - 1) {
        throw new Error("Cannot adjust the final scene boundary");
    }

    const current = manifest.scenes[sceneIndex];
    const next = manifest.scenes[sceneIndex + 1];
    const planCurrent = manifest.plan.scenes.find((s) => Number(s.scene_id) === Number(current.scene_id));
    const planNext = manifest.plan.scenes.find((s) => Number(s.scene_id) === Number(next.scene_id));
    if (!planCurrent || !planNext) throw new Error("Scene timing data is incomplete");

    const deltaRaw = Number(deltaSecInput);
    if (!Number.isFinite(deltaRaw)) throw new Error("deltaSec must be a finite number");

    const minDurationSec = 1;
    const currentDuration = Number(current.duration_sec || 0);
    const nextDuration = Number(next.duration_sec || 0);
    const minDelta = minDurationSec - currentDuration;
    const maxDelta = nextDuration - minDurationSec;
    if (maxDelta < minDelta) {
        throw new Error(`Scenes are too short to adjust. Each side of the boundary must keep at least ${minDurationSec}s.`);
    }
    const delta = roundSec(Math.max(minDelta, Math.min(maxDelta, deltaRaw)));
    if (Math.abs(delta) < 0.001) return manifest;

    const nextBoundary = roundSec(Number(current.end_sec || 0) + delta);
    const currentStart = roundSec(Number(current.start_sec || 0));
    const nextEnd = roundSec(Number(next.end_sec || 0));

    current.end_sec = nextBoundary;
    current.duration_sec = roundSec(nextBoundary - currentStart);
    next.start_sec = nextBoundary;
    next.duration_sec = roundSec(nextEnd - nextBoundary);

    planCurrent.end_sec = current.end_sec;
    planCurrent.duration_sec = current.duration_sec;
    planNext.start_sec = next.start_sec;
    planNext.duration_sec = next.duration_sec;

    const p = ensureJobDirs(jobId);
    unlinkIfExists(path.join(p.outDir, "clips", `scene_${String(current.scene_id).padStart(2, "0")}.mp4`));
    unlinkIfExists(path.join(p.outDir, "clips", `scene_${String(next.scene_id).padStart(2, "0")}.mp4`));

    manifest.updatedAt = new Date().toISOString();
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
    scene.quoteText = null;
    scene.assetPath = outPath;
    scene.assetUrl = mediaUrl(jobId, outPath);
    scene.source = "custom_image";
    scene.stockSearchQuery = null;
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
    scene.quoteText = null;
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

function findReferencePathForMatch(manifest, match) {
    const filename = String(match?.filename || "").trim();
    if (!filename) return null;
    const references = Array.isArray(manifest?.inputs?.references) ? manifest.inputs.references : [];
    const normalized = filename.replace(/\\/g, "/");
    const byName = references.find((p) => String(p || "").replace(/\\/g, "/").endsWith(`/${normalized}`));
    if (byName && fs.existsSync(byName)) return byName;

    const legacySingle = path.join(ensureJobDirs(manifest.id).inputDir, "reference.png");
    if (normalized === "reference.png" && fs.existsSync(legacySingle)) return legacySingle;
    return null;
}

export async function selectReferenceMatch(jobId, sceneId, matchId) {
    const manifest = loadManifest(jobId);
    if (!manifest) throw new Error("Job not found");
    const scene = manifest.scenes.find((s) => Number(s.scene_id) === Number(sceneId));
    if (!scene) throw new Error("Scene not found");

    const matches = Array.isArray(scene.referenceMatches) ? scene.referenceMatches : [];
    const match = matches.find((x) => String(x.id) === String(matchId));
    if (!match) throw new Error("Reference match not found");

    const refPath = findReferencePathForMatch(manifest, match);
    if (!refPath) {
        throw new Error("Reference file not found on disk for selected match");
    }

    scene.type = "image";
    scene.assetPath = refPath;
    scene.assetUrl = mediaUrl(jobId, refPath);
    scene.source = "reference";
    scene.imageAnimationStyle = resolveAnimationStyleId(
        scene.imageAnimationStyle,
        manifest.draftOptions?.imageAnimationStyle
    );
    scene.selectedSuggestionId = null;
    scene.stockSearchQuery = null;
    manifest.sceneChoices[String(sceneId)] = "image";

    saveManifest(jobId, manifest);
    return manifest;
}

export async function refreshStockSuggestions(jobId, sceneId, customQuery = null) {
    const manifest = loadManifest(jobId);
    if (!manifest) throw new Error("Job not found");
    const scene = manifest.scenes.find((s) => Number(s.scene_id) === Number(sceneId));
    if (!scene) throw new Error("Scene not found");

    const ctx = ctxForJob(jobId);
    const pScene = manifest.plan.scenes.find((x) => Number(x.scene_id) === Number(sceneId));
    const stockFetch = await getStockSuggestions(ctx, pScene, 12, {
        customQuery,
        forceRefresh: true
    });
    const suggestions = stockFetch.suggestions || [];
    scene.stockSearchQuery = stockFetch.query || null;
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
    console.log(`[final] request received jobId=${jobId}`);
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
        if (s.type === "quote" || (s.assetPath && fs.existsSync(s.assetPath))) {
            ctx.sceneVisuals[s.scene_id] = {
                type: s.type,
                path: s.assetPath,
                animationStyle: s.type === "image" ? s.imageAnimationStyle || null : null,
                quoteText: s.type === "quote" ? (s.quoteText ?? s.narration ?? "") : null,
                quoteAuthor: s.quoteAuthor || ""
            };
        }
    }

    const totalClips = ctx.plan.scenes.length;
    const totalVideoSec = ctx.plan.scenes.reduce(
        (sum, s) => sum + Math.max(0, Number(s.duration_sec || 0)),
        0
    );
    console.log(
        `[final] jobId=${jobId} preparing clips scenes=${totalClips} totalVideoSec=${Number(totalVideoSec.toFixed(2))}`
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
    console.log(`[final] jobId=${jobId} makeClipsStep:start`);
    await makeClipsStep(ctx);
    console.log(`[final] jobId=${jobId} makeClipsStep:done`);
    ctx.onSceneClipReady = null;
    setProgress(jobId, manifest, {
        phase: "final_concatenating",
        percent: finalRenderPercent({ phase: "final_concatenating" }),
        summary: "Concatenating clips",
        stats: { currentStep: "concatenating_clips" },
        recap: "Clip rendering completed"
    });
    console.log(`[final] jobId=${jobId} concatVisualsStep:start`);
    await concatVisualsStep(ctx);
    console.log(`[final] jobId=${jobId} concatVisualsStep:done`);
    setProgress(jobId, manifest, {
        phase: "final_adding_audio",
        percent: finalRenderPercent({ phase: "final_adding_audio" }),
        summary: "Adding voiceover track",
        stats: { currentStep: "adding_audio" }
    });
    console.log(`[final] jobId=${jobId} addAudioStep:start`);
    await addAudioStep(ctx);
    console.log(`[final] jobId=${jobId} addAudioStep:done`);
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
    manifest.artifacts.generatedAt = new Date().toISOString();
    preserveGeneratedVideo(jobId, manifest);
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
