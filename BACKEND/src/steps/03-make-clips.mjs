import { makeQuoteClipCommand, QUOTE_MOTION_VERSION } from '../services/quote-motion.service.mjs';
import fs from "fs";
import crypto from "crypto";
import path from "path";
import { imageMotionCommand, IMAGE_MOTION_VERSION } from '../services/image-motion.service.mjs';
import { resolveVideoEncoderArgs } from "../utils/video-encoder.mjs";

function resolveAnimationProfile(ctx, styleOverride = null) {
    const profiles = ctx.config.video.imageAnimationProfiles || {};
    const style = String(
        styleOverride ||
        ctx.runOptions.imageAnimationStyle ||
        ctx.config.video.imageAnimationStyle ||
        "fullscreen_zoom_in"
    );
    const selected = profiles[style];
    if (selected) return { id: style, ...selected };

    const fallbackId = Object.keys(profiles)[0];
    if (fallbackId) return { id: fallbackId, ...profiles[fallbackId] };

    return {
        id: "default",
        estimatedM1SecPer1SecClip: 0.3,
        frameScale: 0.78,
        frameBorderPx: 3,
        motionZoomStart: 1.0,
        motionZoomMax: 1.03,
        introDurationSec: 0.55,
        introYOffsetPx: 110,
        frameDriftXPx: 26,
        frameDriftYPx: 14,
        frameDriftPeriodSec: 6
    };
}

function resolveVideoRuntimeConfig(ctx) {
    const base = ctx.config.video || {};
    const profileId = String(ctx.runOptions.renderProfile || base.renderProfile || "final");
    const profile = base.renderProfiles?.[profileId] || {};
    return {
        ...base,
        ...profile,
        renderProfile: profileId,
        width: Number(profile.width ?? base.width),
        height: Number(profile.height ?? base.height),
        fps: Number(profile.fps ?? base.fps),
        blurStrength: String(profile.blurStrength ?? base.blurStrength ?? "40:10")
    };
}

function makeImageClipCommand(ctx, videoCfg, options) {
    return imageMotionCommand(videoCfg, resolveAnimationProfile(ctx, options.styleId), options);
}

function makeStockVideoClipCommand(ctx, videoCfg, { inputVideo, clip, durationSec, mediaOffsetSec = 0 }) {
    const fps = videoCfg.fps;
    const width = videoCfg.width;
    const height = videoCfg.height;
    const encoderArgs = resolveVideoEncoderArgs(videoCfg);
    const offset = Math.max(0, Number(mediaOffsetSec) || 0);
    const filter = `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},fps=${fps},format=yuv420p`;

    return [
        `ffmpeg -y -stream_loop -1 -i "${inputVideo}"`,
        `-ss ${offset} -t ${durationSec}`,
        `-vf "${filter}"`,
        `-an`,
        encoderArgs,
        `"${clip}"`
    ].join(" ");
}

function resolveSceneVisual(ctx, scene) {
    const mode = ctx.visualSourceMode;
    const intended = ctx.sceneVisualChoices[scene.scene_id];
    const mapped = ctx.sceneVisuals[scene.scene_id];
    if (mapped) return mapped;

    const quoteText = String(scene.quote_text || scene.quoteText || scene.narration || "").trim() || null;
    const stockPath = ctx.paths.sceneStockVideo(scene.scene_id);
    if (ctx.fs.exists(stockPath)) {
        return intended === "quote"
            ? { type: "quote", path: stockPath, quoteText }
            : { type: "video", path: stockPath };
    }

    const imgPath = ctx.paths.sceneImage(scene.scene_id);
    if (ctx.fs.exists(imgPath)) return { type: "image", path: imgPath };

    if (intended === "quote") {
        return { type: "quote", path: null, quoteText };
    }

    if (intended === "video" || mode === "stock_video") {
        throw new Error(`No stock video found for scene ${scene.scene_id}`);
    }
    if (mode === "hybrid" && !ctx.config.visual.fallbackToImagesWhenNoStock) {
        throw new Error(`No stock video found for scene ${scene.scene_id} and fallback is disabled`);
    }

    return { type: "image", path: imgPath };
}

function clipCacheKey({ visual, durationSec, styleId, leadingTransitionSec, trailingTransitionSec, videoCfg }) {
    const sourcePath = String(visual.path || "");
    const hasSource = sourcePath && fs.existsSync(sourcePath);
    const stat = hasSource ? fs.statSync(sourcePath) : null;
    const payload = {
        v: visual.type === "quote" ? QUOTE_MOTION_VERSION : IMAGE_MOTION_VERSION,
        quoteStyleId: visual.quoteStyleId || "classic",
        quoteFields: visual.quoteFields || {},
        quoteAuthor: visual.type === "quote" ? String(visual.quoteAuthor || "") : null,
        sourcePath,
        source: visual.source || null,
        ...(visual.source === "reference_clip" ? { referencePlaybackVersion: 2 } : {}),
        mediaOffsetSec: Number(visual.mediaOffsetSec || 0),
        sourceSize: stat ? stat.size : 0,
        sourceMtimeMs: stat ? Math.floor(stat.mtimeMs) : 0,
        type: visual.type,
        quoteText: visual.type === "quote" ? String(visual.quoteText || "") : null,
        durationSec: Number(durationSec.toFixed(4)),
        styleId: styleId || null,
        leadingTransitionSec: Number(leadingTransitionSec.toFixed(4)),
        trailingTransitionSec: Number(trailingTransitionSec.toFixed(4)),
        profile: videoCfg.renderProfile,
        width: videoCfg.width,
        height: videoCfg.height,
        fps: videoCfg.fps,
        blurStrength: videoCfg.blurStrength,
        codec: videoCfg.codec,
        pixFmt: videoCfg.pixFmt,
        hwBitrate: videoCfg.hwBitrate,
        hwMaxrate: videoCfg.hwMaxrate,
        hwBufsize: videoCfg.hwBufsize,
        encodePreset: videoCfg.encodePreset
    };
    const hash = crypto.createHash("sha1").update(JSON.stringify(payload)).digest("hex");
    return hash;
}

async function execFfmpegAsync(ctx, cmd) {
    if (typeof ctx.ffmpeg.execAsync === "function") {
        await ctx.ffmpeg.execAsync(cmd);
        return;
    }
    await Promise.resolve().then(() => ctx.ffmpeg.exec(cmd));
}

async function materializeClipWithCache({
    ctx,
    videoCfg,
    scene,
    index,
    clip,
    visual,
    durationSec,
    leadingTransitionSec,
    trailingTransitionSec,
    cacheBuilds
}) {
    if (ctx.fs.exists(clip)) {
        return { cacheHit: false };
    }

    const styleId = visual.type === "image" ? visual.animationStyle || null : null;
    const cacheEnabled = Boolean(videoCfg.clipCacheEnabled);

    if (!cacheEnabled) {
        const cmd = visual.type === "video"
            ? makeStockVideoClipCommand(ctx, videoCfg, { inputVideo: visual.path, clip, durationSec, mediaOffsetSec: visual.mediaOffsetSec })
            : visual.type === "quote"
                ? makeQuoteClipCommand(ctx, videoCfg, {
                    inputVideo: visual.path || null,
                    mediaOffsetSec: visual.mediaOffsetSec,
                    clip,
                    durationSec,
                    quoteText: visual.quoteText ?? scene.quote_text ?? scene.narration,
                    quoteAuthor: visual.quoteAuthor ?? scene.quoteAuthor ?? "",
                    quoteStyleId: visual.quoteStyleId || "classic",
                    quoteFields: visual.quoteFields || {}
                })
                : makeImageClipCommand(ctx, videoCfg, {
                    img: visual.path,
                    clip,
                    durationSec,
                    styleId,
                    leadingTransitionSec,
                    trailingTransitionSec
                });
        await execFfmpegAsync(ctx, cmd);
        return { cacheHit: false };
    }

    const key = clipCacheKey({
        visual,
        durationSec,
        styleId,
        leadingTransitionSec,
        trailingTransitionSec,
        videoCfg
    });
    const cacheClip = path.join(ctx.paths.clipCacheDir, `${key}.mp4`);

    if (fs.existsSync(cacheClip)) {
        fs.copyFileSync(cacheClip, clip);
        return { cacheHit: true };
    }

    if (!cacheBuilds.has(cacheClip)) {
        const buildPromise = (async () => {
            const tmp = path.join(
                ctx.paths.clipCacheDir,
                `${key}.tmp-${process.pid}-${Date.now()}-${index}.mp4`
            );
            const cmd = visual.type === "video"
                ? makeStockVideoClipCommand(ctx, videoCfg, { inputVideo: visual.path, clip: tmp, durationSec, mediaOffsetSec: visual.mediaOffsetSec })
                : visual.type === "quote"
                    ? makeQuoteClipCommand(ctx, videoCfg, {
                        inputVideo: visual.path || null,
                    mediaOffsetSec: visual.mediaOffsetSec,
                        clip: tmp,
                        durationSec,
                        quoteText: visual.quoteText ?? scene.quote_text ?? scene.narration,
                    quoteAuthor: visual.quoteAuthor ?? scene.quoteAuthor ?? "",
                    quoteStyleId: visual.quoteStyleId || "classic",
                    quoteFields: visual.quoteFields || {}
                    })
                    : makeImageClipCommand(ctx, videoCfg, {
                        img: visual.path,
                        clip: tmp,
                        durationSec,
                        styleId,
                        leadingTransitionSec,
                        trailingTransitionSec
                    });

            await execFfmpegAsync(ctx, cmd);
            try {
                fs.renameSync(tmp, cacheClip);
            } catch {
                if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
            }
        })().finally(() => {
            cacheBuilds.delete(cacheClip);
        });
        cacheBuilds.set(cacheClip, buildPromise);
    }

    await cacheBuilds.get(cacheClip);
    if (!fs.existsSync(cacheClip)) {
        throw new Error(`Clip cache build failed for scene ${scene.scene_id}`);
    }
    fs.copyFileSync(cacheClip, clip);
    return { cacheHit: true };
}

export async function makeClipsStep(ctx) {
    const videoCfg = resolveVideoRuntimeConfig(ctx);
    const transitionDuration = Math.max(0, Number(videoCfg.transitionDuration ?? ctx.config.video.transitionDuration ?? 0));
    const scenes = ctx.plan.scenes || [];
    const total = scenes.length;
    ctx.clipFiles = new Array(total);

    const configuredConcurrency = Math.max(1, Number(videoCfg.clipRenderConcurrency ?? 1));
    const concurrency = Math.max(1, Math.min(configuredConcurrency, total || 1));
    const cacheBuilds = new Map();
    let cursor = 0;
    let renderError = null;
    // Validate every source before launching parallel renders. Otherwise one
    // rejected worker can be hidden by progress writes from surviving workers.
    const visuals = scenes.map(scene => {
        const visual = resolveSceneVisual(ctx, scene);
        if ((visual.type !== "quote" || visual.path) && (!visual.path || !ctx.fs.exists(visual.path))) {
            throw new Error(`Scene ${scene.scene_id} is missing its ${visual.type} source. Choose an image or video before rendering.`);
        }
        return visual;
    });

    const workers = Array.from({ length: concurrency }, async () => {
        while (!renderError) {
            const i = cursor++;
            if (i >= total) return;

            const s = scenes[i];
            const clip = ctx.paths.sceneClip(s.scene_id);
            const visual = visuals[i];
            ctx.sceneVisuals[s.scene_id] = visual;

            const baseDuration = Math.max(0.2, Number(s.duration_sec ?? 0));
            const transitionPadding = i < total - 1 ? transitionDuration : 0;
            const durationSec = baseDuration + transitionPadding;
            const leadingTransitionSec = i > 0 ? transitionDuration : 0;
            const trailingTransitionSec = i < total - 1 ? transitionDuration : 0;

            try {
                const { cacheHit } = await materializeClipWithCache({
                    ctx,
                    videoCfg,
                    scene: s,
                    index: i,
                    clip,
                    visual,
                    durationSec,
                    leadingTransitionSec,
                    trailingTransitionSec,
                    cacheBuilds
                });

                ctx.clipFiles[i] = clip;
                if (!renderError && typeof ctx.onSceneClipReady === "function") {
                    ctx.onSceneClipReady({
                        sceneId: s.scene_id,
                        index: i + 1,
                        total,
                        type: visual.type,
                        cacheHit,
                        durationSec: Math.max(0, Number(s.duration_sec ?? 0))
                    });
                }
            } catch (error) {
                renderError ||= new Error(`Scene ${s.scene_id} could not render: ${error.message}`, { cause: error });
            }
        }
    });

    await Promise.all(workers);
    if (renderError) throw renderError;
    ctx.clipFiles = ctx.clipFiles.filter(Boolean);
    return ctx;
}
