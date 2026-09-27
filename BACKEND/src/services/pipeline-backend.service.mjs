import { sameFootage, assertNoConsecutiveFootage } from './footage-continuity.service.mjs';
import { createDraftCheckpoint } from './draft-checkpoint.service.mjs';
import { preservedManualScenes, reviewTimeline } from './editorial-review.service.mjs';
import { reviewStockCandidates } from './stock-review.service.mjs';
import { buildReferenceClipCatalog, validateReferenceClipFiles, probeReferenceClip } from './reference-clips.service.mjs';
import { validateQuoteDesign } from "../../../SHARED/quote-styles.mjs";
import { deleteSceneManifest } from "./scene-delete.service.mjs";
import { splitSceneManifest } from "./scene-split.service.mjs";
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

    // Legacy reference quotas are intentionally ignored.

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
        quoteStyleId: s.quoteStyleId || "classic",
        quoteFields: s.quoteFields || {},
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
            type: x.type || 'image',
            duration: x.duration,
            usableStartSec: x.usableStartSec,
            usableEndSec: x.usableEndSec,
            status: x.status,
            thumbnailUrl: x.thumbnailPath ? mediaUrl(jobId, x.thumbnailPath) : null,
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
    if (percent !== undefined) {
        const floor = manifest.status === 'DRAFT_RUNNING' && manifest.draftResumeRequested ? Number(manifest.progress.percent || 0) : 0;
        manifest.progress.percent = Math.max(floor, Math.max(0, Math.min(100, Math.round(percent))));
    }
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

export async function createFallbackStockClip(ctx, jobId, durationSec) {
    const outPath = path.join(ensureJobDirs(jobId).customDir, `stock_${randomUUID()}.mp4`);
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
    assertNoConsecutiveFootage(manifest.scenes || []);
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

export async function saveProjectInputs(jobId, files) {
    const staged = Object.values(files || {}).flat();
    try {
        const manifest = loadManifest(jobId);
        if (!manifest) throw new Error('Job not found');
        if (['DRAFT_RUNNING', 'FINAL_RUNNING'].includes(manifest.status)) throw new Error('Wait for generation to finish before replacing inputs.');
        const voiceFile = files?.voiceover?.[0];
        if (!voiceFile) throw new Error('voiceover file is required');
        const clipFiles = files?.referenceClip || [];
        validateReferenceClipFiles(clipFiles);
        // Validate every uploaded clip before changing the project's inputs.
        const clipInfo = [];
        for (const file of clipFiles) {
            try { clipInfo.push(await probeReferenceClip(file.path)); }
            catch (error) { throw Object.assign(new Error(`${file.originalname}: ${error.message}`), { statusCode: 400 }); }
        }
        const p = ensureJobDirs(jobId);
        const writeUpload = (file, target) => file.path ? fs.copyFileSync(file.path, target) : fs.writeFileSync(target, file.buffer);
        writeUpload(voiceFile, path.join(p.inputDir, 'voiceover.mp3'));
        manifest.inputs.voiceover = path.join(p.inputDir, 'voiceover.mp3');
        for (const [field, inputKey, folder] of [['reference', 'references', 'references'], ['referenceClip', 'referenceClips', 'reference-clips']]) {
            const directory = path.join(p.inputDir, folder);
            fs.mkdirSync(directory, { recursive: true });
            manifest.inputs[inputKey] = (files?.[field] || []).map((file, i) => {
                const filename = sanitizeFilename(file.originalname, i);
                const target = path.join(directory, field === "referenceClip" ? `${i + 1}_${filename}` : filename);
                writeUpload(file, target);
                if (field === 'referenceClip') {
                    manifest.referenceClipIndex ||= {};
                    manifest.referenceClipIndex[target] = { ...clipInfo[i], status: 'pending' };
                }
                return target;
            });
        }
        delete manifest.draftCheckpoint;
        manifest.status = 'INPUTS_READY';
        saveManifest(jobId, manifest);
        return manifest;
    } finally {
        for (const file of staged) if (file.path && fs.existsSync(file.path)) fs.unlinkSync(file.path);
    }
}

export async function startDraftJob(jobId, options = {}, { resume = false } = {}) {
    const manifest = loadManifest(jobId);
    if (!manifest) throw new Error('Project not found');
    if (['DRAFT_RUNNING', 'FINAL_RUNNING'].includes(manifest.status)) {
        throw Object.assign(new Error('Project is already processing'), { statusCode: 409 });
    }
    if (resume && manifest.status !== 'DRAFT_FAILED') {
        throw Object.assign(new Error('Only a failed scene plan can be continued.'), { statusCode: 409 });
    }
    if (!manifest.inputs?.voiceover || !fs.existsSync(manifest.inputs.voiceover)) {
        throw Object.assign(new Error('The saved voiceover is missing. Upload inputs before generating scenes.'), { statusCode: 400 });
    }
    manifest.draftOptions = normalizeDraftOptions(resume ? manifest.draftOptions || {} : options, baseConfig);
    if (!resume) delete manifest.draftCheckpoint;
    manifest.draftResumeRequested = resume;
    manifest.status = 'DRAFT_RUNNING';
    saveManifest(jobId, manifest);
    try {
        const code = await startJobProcess(jobId, path.join(apiConfig.rootDir, 'src/jobs/run-draft-job.mjs'), apiConfig.rootDir);
        const result = loadManifest(jobId);
        if (!result) throw new Error('Project was deleted');
        if (code !== 0) throw new Error(result.progress?.summary || 'Scene generation failed');
        return result;
    } catch (error) {
        const failed = loadManifest(jobId);
        if (failed && failed.status === 'DRAFT_RUNNING') {
            failed.status = 'DRAFT_FAILED';
            failed.progress = { ...failed.progress, phase: 'draft_failed', summary: error.message };
            saveManifest(jobId, failed);
        }
        throw error;
    }
}

export async function generateDraft(jobId, draftOptionsInput = {}, { resume = false } = {}) {
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
    if (!resume) delete manifest.draftCheckpoint;
    manifest.draftResumeRequested = resume;
    const checkpoint = createDraftCheckpoint(manifest, () => saveManifest(jobId, manifest));


    manifest.status = "DRAFT_RUNNING";
    manifest.draftOptions = draftOptions;
    setProgress(jobId, manifest, {
        phase: "planning",
        percent: 5,
        summary: resume ? "Continuing scene plan from saved progress" : "Analyzing voiceover and planning scenes",
        stats: {
            imageAnimationStyle: selectedAnimation?.id || null,
            imageAnimationLabel: selectedAnimation?.label || null,
            estimatedM1SecPer1SecClip: selectedAnimation?.estimatedM1SecPer1SecClip || null
        },
        recap: resume ? "Continuing saved draft" : "Draft started"
    });

    const ctx = ctxForJob(jobId, draftOptions);
    ctx.draftTask = checkpoint.run;
    try {
        const planned = await checkpoint.run('plan', async () => {
            await planScenesStep(ctx);
            return { plan: ctx.plan, sceneTypeHints: ctx.sceneTypeHints || Object.fromEntries(ctx.plan.scenes.map(scene => [scene.scene_id, scene.scene_type || 'normal'])) };
        });
        Object.assign(ctx, planned);
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

    const preservedScenes = preservedManualScenes(manifest.scenes, ctx.plan.scenes, fs.existsSync);
    manifest.plan = ctx.plan;
    const initialSceneChoices = {};
    const suggestionMap = {};
    const selectedSuggestionMap = {};
    const stockSearchQueryMap = {};
    for (const s of ctx.plan.scenes) {
        initialSceneChoices[String(s.scene_id)] = ctx.sceneVisualChoices[s.scene_id];
    }

    const { referenceCatalog, clipResult, allocation } = await checkpoint.run('reference-allocation', async () => {
        let referenceCatalog = buildReferenceCatalog(manifest.inputs.references || []);
        let referenceCatalogForMatch = referenceCatalog;
        if (draftOptions.useReferenceCaptionMatching && referenceCatalog.length) {
            const captionModel = String(ctx.config.models?.referenceCaption || ctx.config.models?.planner || "gpt-6-luna");
            const captioned = await buildReferenceCatalogWithCaptions({
                openai: ctx.openai,
                model: captionModel,
                referenceCatalog,
                onProgress: ({ index }) => { manifest.referenceCaptionIndex = index; saveManifest(jobId, manifest); },
                cacheIndex: manifest.referenceCaptionIndex || {}
            });
            referenceCatalogForMatch = captioned.catalog;
            manifest.referenceCaptionIndex = captioned.index;
        }
        const clipResult = await buildReferenceClipCatalog({
            paths: manifest.inputs.referenceClips || [], cacheIndex: manifest.referenceClipIndex || {},
            directory: path.join(ensureJobDirs(jobId).inputDir, 'clip-analysis'), openai: ctx.openai,
            model: String(ctx.config.models?.referenceCaption || ctx.config.models?.planner || 'gpt-6-luna'),
            onProgress: ({ completed, total, index }) => {
                manifest.referenceClipIndex = index;
                setProgress(jobId, manifest, { phase: 'reference_clip_analysis', percent: 30 + 2 * completed / total,
                    summary: `Analysing silent reference clips (${completed}/${total})` });
            }
        });
        manifest.referenceClipIndex = clipResult.index;
        manifest.referenceAnalysisUsage = { clips: clipResult.stats };
        referenceCatalog = [...referenceCatalog, ...clipResult.catalog];
        referenceCatalogForMatch = [...referenceCatalogForMatch, ...clipResult.catalog.filter(clip => clip.status === 'ready')];
        let referencePlan = null;
        if (draftOptions.useReferenceCaptionMatching && referenceCatalogForMatch.length && ctx.openai) {
            const scoringModel = String(
                ctx.config.models?.referenceScoring ||
                ctx.config.models?.planner ||
                "gpt-6-luna"
            );
            try {
                const scored = await scoreReferencesForScenesWithOpenAI({
                    openai: ctx.openai,
                    model: scoringModel,
                    scenes: ctx.plan.scenes,
                    referenceCatalog: referenceCatalogForMatch,
                    onProgress: ({ index }) => { manifest.referenceScoringIndex = index; saveManifest(jobId, manifest); },
                    cacheIndex: manifest.referenceScoringIndex || {},
                    transitionPaddingSec: Number(ctx.config.video?.transitionDuration || 0),
                    sceneIdsToScore: ctx.plan.scenes.filter(scene => !preservedScenes[String(scene.scene_id)]).map(scene => scene.scene_id)
                });
                referencePlan = scored.plan;
                manifest.referenceScoringIndex = scored.index;
                manifest.referenceAnalysisUsage.matching = scored.stats.usage;
                setProgress(jobId, manifest, {
                    phase: "visual_decision",
                    percent: 32,
                    summary: "Matching reference images and clips to scenes",
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
            config: ctx.config
        });

        return { referenceCatalog, clipResult, allocation };
    });

    for (const [id, previous] of Object.entries(preservedScenes)) {
        allocation.sceneChoices[id] = previous.type;
        allocation.sceneAssetPaths[id] = previous.assetPath;
        allocation.sceneSourceMap[id] = previous.source;
        allocation.sceneMediaOffsets[id] = previous.mediaOffsetSec || 0;
    }
    for (let i = 1; i < ctx.plan.scenes.length; i++) {
        const left = String(ctx.plan.scenes[i - 1].scene_id), right = String(ctx.plan.scenes[i].scene_id);
        if (!sameFootage({ path: allocation.sceneAssetPaths[left] }, { path: allocation.sceneAssetPaths[right] })) continue;
        const replace = preservedScenes[right] ? left : right;
        if (preservedScenes[replace]) throw new Error(`Scenes ${left} and ${right} have consecutive identical manual footage. Change one selection before continuing.`);
        delete allocation.sceneAssetPaths[replace];
        allocation.sceneChoices[replace] = 'video';
        allocation.sceneSourceMap[replace] = 'stock';
        allocation.sceneMediaOffsets[replace] = 0;
    }
    manifest.sceneChoices = allocation.sceneChoices;
    const sceneAssetPaths = allocation.sceneAssetPaths;
    const sceneSourceMap = allocation.sceneSourceMap;
    const sceneReferenceMap = allocation.sceneReferenceMap;

    for (const s of ctx.plan.scenes) {
        const sceneId = String(s.scene_id);
        const assignedPath = sceneAssetPaths[sceneId];
        if (assignedPath) {
            ctx.sceneVisuals[s.scene_id] = { type: manifest.sceneChoices[sceneId], path: assignedPath, mediaOffsetSec: allocation.sceneMediaOffsets[sceneId] || 0, source: sceneSourceMap[sceneId] || "reference" };
        }
    }

    const plannedImageCount = ctx.plan.scenes.filter(
        (s) => manifest.sceneChoices[String(s.scene_id)] === "image"
    ).length;
    const plannedVideoCount = ctx.plan.scenes.length - plannedImageCount;
    setProgress(jobId, manifest, {
        phase: "visual_decision",
        percent: 35,
        summary: `${plannedImageCount} images, ${allocation.stats.referenceClipScenes || 0} reference clips and ${plannedVideoCount - (allocation.stats.referenceClipScenes || 0)} stock/quote scenes selected`,
        stats: {
            imageScenes: plannedImageCount,
            referenceClipScenes: allocation.stats.referenceClipScenes || 0,
            unassignedReferenceClips: allocation.stats.unassignedReferenceClips || 0,
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
        recap: `References: ${plannedImageCount} image scenes, ${allocation.stats.referenceClipScenes || 0} clip scenes, ${plannedVideoCount} videos total, ${Number(allocation.stats.imageScenesConvertedToVideo || 0)} converted to video${Number(allocation.stats.unassignedReferenceImages || 0) ? `, ${Number(allocation.stats.unassignedReferenceImages || 0)} references not placed` : ""}`
    });

    // Search only gaps left by reference allocation, then review bounded shortlists in batches.
    const stockEntries = [];
    for (const scene of ctx.plan.scenes) {
        const id = String(scene.scene_id);
        if (preservedScenes[id] || !["video", "quote"].includes(manifest.sceneChoices[id]) || sceneSourceMap[id] === 'reference_clip') continue;
        try {
            const result = await checkpoint.run(`stock-search:${id}`, () => getStockSuggestions(ctx, scene, 24));
            suggestionMap[id] = result.suggestions;
            stockSearchQueryMap[id] = result.query;
            stockEntries.push({ scene, ...result });
        } catch {
            suggestionMap[id] = [];
            stockEntries.push({ scene, suggestions: [], query: scene.visual });
        }
        setProgress(jobId, manifest, { phase: 'stock_preparation', percent: 35,
            summary: `Finding anonymous supporting visuals (${stockEntries.length})` });
    }
    const stockReview = await checkpoint.run('stock-review', () => reviewStockCandidates({
        openai: ctx.openai, model: ctx.config.models?.referenceScoring || ctx.config.models.planner,
        entries: stockEntries, cacheIndex: manifest.stockReviewIndex || {},
        onProgress: ({ completed, total, index }) => {
            manifest.stockReviewIndex = index;
            setProgress(jobId, manifest, { phase: 'stock_preparation', percent: 35, summary: `Reviewing stock previews (${completed}/${total})` });
        }
    }));
    manifest.stockReviewIndex = stockReview.index;
    manifest.referenceAnalysisUsage.stockReview = stockReview.stats;

    const conflictsWithNeighbor = (sceneId, candidate) => {
        const position = ctx.plan.scenes.findIndex(scene => String(scene.scene_id) === String(sceneId));
        return [ctx.plan.scenes[position - 1], ctx.plan.scenes[position + 1]].filter(Boolean).some(neighbor => {
            const id = String(neighbor.scene_id);
            return sameFootage(candidate, { assetPath: sceneAssetPaths[id], source: sceneSourceMap[id],
                selectedSuggestionId: selectedSuggestionMap[id] || preservedScenes[id]?.selectedSuggestionId });
        });
    };
    let videoProcessed = 0;
    let stockPrepared = 0;
    const totalVideoTargets = ctx.plan.scenes.filter(s => ["video", "quote"].includes(manifest.sceneChoices[String(s.scene_id)]) && sceneSourceMap[String(s.scene_id)] !== "reference_clip" && !preservedScenes[String(s.scene_id)]).length;
    for (const s of ctx.plan.scenes) {
        const sceneId = s.scene_id;
        const type = manifest.sceneChoices[String(sceneId)];
        if (!preservedScenes[String(sceneId)] && (type === "video" || type === "quote") && sceneSourceMap[String(sceneId)] !== "reference_clip") {
            const prepared = await checkpoint.run(`stock-asset:${sceneId}`, async () => {
                try {
                    const suggestions = suggestionMap[String(sceneId)] || [];
                    const review = stockReview.selections[sceneId];
                    const approved = review?.approvedIds || [review?.selectedId];
                    const selected = approved.map(id => suggestions.find(item => String(item.id) === String(id)))
                        .find(item => item && !conflictsWithNeighbor(sceneId, { selectedSuggestionId: String(item.id) }));
                    if (selected) {
                        const provider = new PexelsVideoProvider(ctx);
                        const outPath = path.join(ensureJobDirs(jobId).customDir, `stock_${randomUUID()}.mp4`);
                        await provider.downloadVideoFile(selected.file.link, outPath);
                        sceneAssetPaths[String(sceneId)] = outPath;
                        ctx.sceneVisuals[sceneId] = {
                            type: type === "quote" ? "quote" : "video",
                            path: outPath,
                            quoteText: type === "quote" ? String(s.quote_text || s.narration || "") : null
                        };
                        selectedSuggestionMap[String(sceneId)] = String(selected.id);
                        sceneSourceMap[String(sceneId)] = type === "quote" ? "quote_stock" : "stock";
                    } else {
                        const fallbackPath = await createFallbackStockClip(ctx, jobId, s.duration_sec);
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
                        const fallbackPath = await createFallbackStockClip(ctx, jobId, s.duration_sec);
                        sceneAssetPaths[String(sceneId)] = fallbackPath;
                        ctx.sceneVisuals[sceneId] = {
                            type: "quote",
                            path: fallbackPath,
                            quoteText: String(s.quote_text || s.narration || "")
                        };
                        selectedSuggestionMap[String(sceneId)] = null;
                        sceneSourceMap[String(sceneId)] = "quote_stock_fallback";
                    } else {
                    const refFallback = (sceneReferenceMap[String(sceneId)] || []).find(ref => ref.type !== 'video' && Number(ref.score) > .5
                        && ref.path && fs.existsSync(ref.path) && !conflictsWithNeighbor(sceneId, ref))?.path;
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

                if (conflictsWithNeighbor(sceneId, { assetPath: sceneAssetPaths[String(sceneId)], source: sceneSourceMap[String(sceneId)], selectedSuggestionId: selectedSuggestionMap[String(sceneId)] })) {
                    throw new Error(`No distinct suitable footage is available for scene ${sceneId}. Add another reference or choose different footage; consecutive reuse is forbidden.`);
                }
                return {
                    choice: manifest.sceneChoices[String(sceneId)], path: sceneAssetPaths[String(sceneId)],
                    source: sceneSourceMap[String(sceneId)], selectedSuggestionId: selectedSuggestionMap[String(sceneId)] || null,
                    visual: ctx.sceneVisuals[sceneId]
                };
            }, saved => Boolean(saved.path && fs.existsSync(saved.path) && fs.statSync(saved.path).size > 0 && !conflictsWithNeighbor(sceneId, saved)));
            manifest.sceneChoices[String(sceneId)] = prepared.choice;
            sceneAssetPaths[String(sceneId)] = prepared.path;
            sceneSourceMap[String(sceneId)] = prepared.source;
            selectedSuggestionMap[String(sceneId)] = prepared.selectedSuggestionId;
            ctx.sceneVisuals[sceneId] = prepared.visual;
            if (["stock", "quote_stock"].includes(prepared.source)) stockPrepared += 1;

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

    for (const scene of manifest.scenes) {
        scene.mediaOffsetSec = allocation.sceneMediaOffsets[String(scene.scene_id)] || 0;
        const chosenReference = (sceneReferenceMap[String(scene.scene_id)] || []).find(ref => ref.path === scene.assetPath);
        scene.selectionReason = chosenReference ? (chosenReference.reason || "Relevant reference supports this narrative beat.") : stockReview.selections[scene.scene_id]?.reason || null;
        const preserved = preservedScenes[String(scene.scene_id)];
        if (preserved) {
            for (const field of ['imageAnimationStyle', 'quoteText', 'quoteAuthor', 'quoteStyleId', 'quoteFields', 'selectedSuggestionId', 'selectionReason']) {
                scene[field] = preserved[field];
            }
            scene.manualMediaSelection = true;
        }
    }
    assertNoConsecutiveFootage(manifest.scenes);
    manifest.editorialReview = reviewTimeline(manifest.scenes);
    for (const scene of manifest.scenes) scene.editorialNotes = manifest.editorialReview.find(item => item.scene_id === scene.scene_id)?.notes || [];
    manifest.referenceClips = clipResult.catalog.map(clip => ({
        id: clip.id, filename: clip.filename, duration: clip.duration, status: clip.status, error: clip.error || null,
        url: mediaUrl(jobId, clip.path), thumbnailUrl: clip.thumbnailPath ? mediaUrl(jobId, clip.thumbnailPath) : null
    }));
    manifest.draftResumeRequested = false;
    manifest.draftCheckpoint.completedAt = new Date().toISOString();
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
    const hasQuoteDesignUpdate = updates.quoteStyleId !== undefined || updates.quoteFields !== undefined;
    let validatedQuoteFields;
    if (hasQuoteDesignUpdate) {
        try { validatedQuoteFields = validateQuoteDesign(updates.quoteStyleId ?? scene.quoteStyleId ?? "classic", updates.quoteFields ?? scene.quoteFields ?? {}); }
        catch (error) { error.statusCode = 400; throw error; }
    }
    if (!hasTypeUpdate && !hasAnimationUpdate && !hasQuoteTextUpdate && !hasQuoteAuthorUpdate && !hasQuoteDesignUpdate) {
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

    if (hasQuoteDesignUpdate) {
        scene.quoteStyleId = updates.quoteStyleId ?? scene.quoteStyleId ?? "classic";
        scene.quoteFields = validatedQuoteFields;
        if (validatedQuoteFields.text !== undefined) scene.quoteText = validatedQuoteFields.text;
        if (validatedQuoteFields.author !== undefined) scene.quoteAuthor = validatedQuoteFields.author;
    }
    const previousType = scene.type;
    if (previousType !== type) { scene.selectionReason = null; scene.editorialNotes = []; scene.manualMediaSelection = true; }
    const ctx = previousType !== type && type === "video" ? ctxForJob(jobId) : null;
    scene.type = type;
    if (hasQuoteTextUpdate) {
        scene.quoteText = String(updates.quoteText || "").trim();
        if (scene.quoteFields) scene.quoteFields.text = scene.quoteText;
    }
    if (hasQuoteAuthorUpdate) {
        scene.quoteAuthor = String(updates.quoteAuthor || "").trim();
        if (scene.quoteFields) scene.quoteFields.author = scene.quoteAuthor;
    }
    if (scene.quoteText == null && type === "quote") {
        scene.quoteText = String(scene.narration || "").trim() || null;
    }
    manifest.sceneChoices[String(sceneId)] = type;
    if (previousType !== type && type !== "quote") scene.mediaOffsetSec = 0;
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
        const stockVideo = ctx.paths.sceneStockVideo(scene.originalSceneId || sceneId);
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
    if (hasQuoteDesignUpdate || hasQuoteTextUpdate || hasQuoteAuthorUpdate) {
        unlinkIfExists(path.join(ensureJobDirs(jobId).outDir, "clips", `scene_${String(sceneId).padStart(2, "0")}.mp4`));
        manifest.artifacts = { ...manifest.artifacts, needsRegeneration: true };
    }
    saveManifest(jobId, manifest);
    return manifest;
}

export function deleteScene(jobId, sceneId, expectedUpdatedAt) {
    const result = deleteSceneManifest(loadManifest(jobId), sceneId, expectedUpdatedAt);
    const p = ensureJobDirs(jobId);
    // Include the old final ID because deleting renumbers the remaining clips.
    for (let id = 1; id <= result.project.scenes.length + 1; id++) {
        unlinkIfExists(path.join(p.outDir, "clips", `scene_${String(id).padStart(2, "0")}.mp4`));
    }
    saveManifest(jobId, result.project);
    return result;
}

export function splitScene(jobId, sceneId, timeSec, expectedUpdatedAt) {
    const result = splitSceneManifest(loadManifest(jobId), sceneId, timeSec, expectedUpdatedAt);
    const p = ensureJobDirs(jobId);
    // Numbering and transition neighbours change; all numbered clips must be rebuilt.
    for (let id = 1; id <= result.project.scenes.length; id++) {
        unlinkIfExists(path.join(p.outDir, "clips", `scene_${String(id).padStart(2, "0")}.mp4`));
    }
    saveManifest(jobId, result.project);
    return result;
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
    const outPath = path.join(p.customDir, `scene_${String(sceneId).padStart(2, "0")}_${randomUUID()}.png`);
    fs.writeFileSync(outPath, file.buffer);
    scene.type = "image";
    scene.quoteText = null;
    scene.mediaOffsetSec = 0;
    scene.selectionReason = null;
    scene.assetPath = outPath;
    scene.assetUrl = mediaUrl(jobId, outPath);
    scene.source = "custom_image";
    scene.manualMediaSelection = true;
    scene.editorialNotes = [];
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
    const outPath = path.join(p.customDir, `scene_${String(sceneId).padStart(2, "0")}_${randomUUID()}.mp4`);
    fs.writeFileSync(outPath, file.buffer);
    scene.type = "video";
    scene.quoteText = null;
    scene.mediaOffsetSec = 0;
    scene.selectionReason = null;
    scene.assetPath = outPath;
    scene.assetUrl = mediaUrl(jobId, outPath);
    scene.source = "custom_video";
    scene.manualMediaSelection = true;
    scene.editorialNotes = [];
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
    const outPath = path.join(ensureJobDirs(jobId).customDir, `stock_${randomUUID()}.mp4`);
    await provider.downloadVideoFile(suggestion.previewUrl, outPath);
    scene.type = "video";
    scene.mediaOffsetSec = 0;
    scene.assetPath = outPath;
    scene.assetUrl = mediaUrl(jobId, outPath);
    scene.source = "stock";
    scene.imageAnimationStyle = null;
    scene.selectionReason = "Stock footage selected manually.";
    scene.manualMediaSelection = true;
    scene.editorialNotes = [];
    scene.selectedSuggestionId = String(suggestionId);
    manifest.sceneChoices[String(sceneId)] = "video";
    saveManifest(jobId, manifest);
    return manifest;
}

function findReferencePathForMatch(manifest, match) {
    const filename = String(match?.filename || "").trim();
    if (!filename) return null;
    const references = match.type === "video" ? (manifest.inputs?.referenceClips || []) : (manifest.inputs?.references || []);
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

    scene.selectionReason = match.reason || "Reference selected manually.";
    const refPath = findReferencePathForMatch(manifest, match);
    if (!refPath) {
        throw new Error("Reference file not found on disk for selected match");
    }

    const isClip = match.type === 'video';
    if (isClip) {
        const info = manifest.referenceClipIndex?.[refPath];
        if (!info || info.status === 'failed' || info.status === 'pending' || !(Number(info.duration) > 0)) {
            throw Object.assign(new Error('This reference clip could not be analysed. Choose another clip or retry its analysis.'), { statusCode: 400 });
        }
    }
    scene.type = isClip ? 'video' : 'image';
    scene.mediaOffsetSec = isClip ? Number(manifest.referenceClipIndex?.[refPath]?.usableStartSec || 0) : 0;
    scene.assetPath = refPath;
    scene.assetUrl = mediaUrl(jobId, refPath);
    scene.source = isClip ? 'reference_clip' : 'reference';
    scene.manualMediaSelection = true;
    scene.editorialNotes = [];
    scene.imageAnimationStyle = isClip ? null : resolveAnimationStyleId(scene.imageAnimationStyle, manifest.draftOptions?.imageAnimationStyle);
    scene.selectedSuggestionId = null;
    scene.stockSearchQuery = null;
    manifest.sceneChoices[String(sceneId)] = scene.type;

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
    const stockFetch = await getStockSuggestions(ctx, pScene, 24, {
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
    assertNoConsecutiveFootage(manifest.scenes || []);
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
                source: s.source,
                path: s.assetPath,
                mediaOffsetSec: Number(s.mediaOffsetSec || 0),
                animationStyle: s.type === "image" ? s.imageAnimationStyle || null : null,
                quoteText: s.type === "quote" ? (s.quoteText ?? s.narration ?? "") : null,
                quoteAuthor: s.quoteAuthor || "",
                quoteStyleId: s.quoteStyleId || "classic",
                quoteFields: s.quoteFields || {}
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
