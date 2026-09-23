import fs from "fs";
import crypto from "crypto";
import path from "path";
import { imageMotionCommand, IMAGE_MOTION_VERSION } from '../services/image-motion.service.mjs';
import { resolveVideoEncoderArgs } from "../utils/video-encoder.mjs";

function escapeDrawtextValue(value) {
    return String(value || "")
        .replace(/\\/g, "\\\\")
        .replace(/:/g, "\\:")
        .replace(/,/g, "\\,")
        .replace(/'/g, "\\'")
        .replace(/\[/g, "\\[")
        .replace(/\]/g, "\\]")
        .replace(/%/g, "\\%")
        .replace(/\r?\n/g, "\\n");
}

function ensureQuoteTextFile(ctx, quoteText) {
    const text = String(quoteText || "").trim() || " ";
    const key = crypto.createHash("sha1").update(text).digest("hex");
    const p = path.join(ctx.paths.clipCacheDir, `quote_text_${key}.txt`);
    if (!fs.existsSync(p)) {
        fs.writeFileSync(p, text, "utf8");
    }
    return p;
}

function wrapQuoteText(text, maxCharsPerLine = 34, maxLines = 5) {
    const splitLongWord = (word, maxChars) => {
        if (!word || word.length <= maxChars) return [word];
        const parts = [];
        let i = 0;
        while (i < word.length) {
            parts.push(word.slice(i, i + maxChars));
            i += maxChars;
        }
        return parts;
    };
    const rawWords = String(text || "").trim().split(/\s+/).filter(Boolean);
    const words = rawWords.flatMap((w) => splitLongWord(w, Math.max(8, maxCharsPerLine - 2)));
    if (!words.length) return "";
    const lines = [];
    let current = words[0];
    for (let i = 1; i < words.length; i++) {
        const next = words[i];
        if ((`${current} ${next}`).length <= maxCharsPerLine || lines.length >= maxLines - 1) {
            current = `${current} ${next}`;
        } else {
            lines.push(current);
            current = next;
        }
    }
    lines.push(current);
    const limited = lines.slice(0, maxLines);
    if (lines.length > maxLines) {
        limited[maxLines - 1] = `${limited[maxLines - 1]}...`;
    }
    return limited.join("\n");
}

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

function makeStockVideoClipCommand(ctx, videoCfg, { inputVideo, clip, durationSec }) {
    const fps = videoCfg.fps;
    const width = videoCfg.width;
    const height = videoCfg.height;
    const encoderArgs = resolveVideoEncoderArgs(videoCfg);
    const filter = `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},fps=${fps},format=yuv420p`;

    return [
        `ffmpeg -y -stream_loop -1 -i "${inputVideo}"`,
        `-t ${durationSec}`,
        `-vf "${filter}"`,
        `-an`,
        encoderArgs,
        `"${clip}"`
    ].join(" ");
}

function makeQuoteClipCommand(ctx, videoCfg, { inputVideo = null, clip, durationSec, quoteText = "" }) {
    const fps = videoCfg.fps;
    const width = videoCfg.width;
    const height = videoCfg.height;
    const encoderArgs = resolveVideoEncoderArgs(videoCfg);
    const safeQuote = String(quoteText || "").trim() || " ";
    const wrapped = wrapQuoteText(safeQuote, 30, 7);
    const wrappedLines = wrapped.split("\n").filter(Boolean);
    const lineCount = wrappedLines.length;
    const longestLine = wrappedLines.reduce((m, ln) => Math.max(m, ln.length), 0);
    const baseFontSize = lineCount >= 7 ? 62 : lineCount >= 6 ? 66 : lineCount >= 5 ? 70 : 76;
    const finalBaseFontSize = longestLine >= 32 ? Math.max(58, baseFontSize - 4) : baseFontSize;
    const lineSpacing = lineCount >= 6 ? 16 : 18;
    const quoteTextFile = ensureQuoteTextFile(ctx, wrapped);
    const escapedQuoteTextFile = escapeDrawtextValue(quoteTextFile);
    const leftQuote = escapeDrawtextValue("“");
    const rightQuote = escapeDrawtextValue("”");
    const enterStart = 0.12;
    const enterEnd = 1.45;
    const enterDur = enterEnd - enterStart;
    const textAlphaExpr = `if(lt(t\\,${enterStart})\\,0\\,if(lt(t\\,${enterEnd})\\,0.5-0.5*cos(PI*(t-${enterStart})/${enterDur})\\,1))`;
    const textYOffsetExpr = `if(lt(t\\,${enterStart})\\,26\\,if(lt(t\\,${enterEnd})\\,26*(1-(0.5-0.5*cos(PI*(t-${enterStart})/${enterDur})))\\,0))`;
    const textScaleExpr = `if(lt(t\\,${enterStart})\\,1.015\\,if(lt(t\\,${enterEnd})\\,1.015-(1.015-1.0)*(0.5-0.5*cos(PI*(t-${enterStart})/${enterDur}))\\,1.0))`;
    const quoteIconPad = 80;
    const fontPrimary = escapeDrawtextValue("Arial Black");
    const fontQuote = escapeDrawtextValue("Arial Bold Italic");
    const quoteFilter = [
        `scale=${width}:${height}:force_original_aspect_ratio=increase`,
        `crop=${width}:${height}`,
        `fps=${fps}`,
        "eq=contrast=0.88:saturation=0.3:brightness=-0.08:gamma=0.95",
        "boxblur=35:12",
        "noise=alls=2.2:allf=t+u",
        "vignette=PI/5",
        `drawtext=text='${leftQuote}':font='${fontQuote}':fontcolor=white@0.86:fontsize=400:x=${quoteIconPad}:y=${quoteIconPad}:borderw=3:bordercolor=black@0.72:shadowcolor=black@0.9:shadowx=3:shadowy=3:fix_bounds=1`,
        `drawtext=text='${rightQuote}':font='${fontQuote}':fontcolor=white@0.86:fontsize=400:x=w-text_w-${quoteIconPad}:y=h-text_h-${quoteIconPad}:borderw=3:bordercolor=black@0.72:shadowcolor=black@0.9:shadowx=3:shadowy=3:fix_bounds=1`,
        `drawtext=textfile='${escapedQuoteTextFile}':font='${fontPrimary}':fontcolor=white:fontsize='${finalBaseFontSize}*${textScaleExpr}':line_spacing=${lineSpacing}:text_align=center:alpha='${textAlphaExpr}':x=(w-text_w)/2:y=(h-text_h)/2+${textYOffsetExpr}:borderw=3:bordercolor=black@0.76:shadowcolor=black@0.9:shadowx=4:shadowy=4:fix_bounds=1`,
        "format=yuv420p"
    ].join(",");

    if (inputVideo && fs.existsSync(inputVideo)) {
        return [
            `ffmpeg -y -stream_loop -1 -i "${inputVideo}"`,
            `-t ${durationSec}`,
            `-vf "${quoteFilter}"`,
            "-an",
            encoderArgs,
            `"${clip}"`
        ].join(" ");
    }

    return [
        `ffmpeg -y -f lavfi -i "color=c=black:s=${width}x${height}:r=${fps}"`,
        `-t ${durationSec}`,
        `-vf "${quoteFilter}"`,
        "-an",
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
        v: IMAGE_MOTION_VERSION,
        sourcePath,
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
            ? makeStockVideoClipCommand(ctx, videoCfg, { inputVideo: visual.path, clip, durationSec })
            : visual.type === "quote"
                ? makeQuoteClipCommand(ctx, videoCfg, {
                    inputVideo: visual.path || null,
                    clip,
                    durationSec,
                    quoteText: visual.quoteText || scene.quote_text || scene.narration
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
                ? makeStockVideoClipCommand(ctx, videoCfg, { inputVideo: visual.path, clip: tmp, durationSec })
                : visual.type === "quote"
                    ? makeQuoteClipCommand(ctx, videoCfg, {
                        inputVideo: visual.path || null,
                        clip: tmp,
                        durationSec,
                        quoteText: visual.quoteText || scene.quote_text || scene.narration
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

    const workers = Array.from({ length: concurrency }, async () => {
        while (true) {
            const i = cursor++;
            if (i >= total) return;

            const s = scenes[i];
            const clip = ctx.paths.sceneClip(s.scene_id);
            const visual = resolveSceneVisual(ctx, s);
            ctx.sceneVisuals[s.scene_id] = visual;

            const baseDuration = Math.max(0.2, Number(s.duration_sec ?? 0));
            const transitionPadding = i < total - 1 ? transitionDuration : 0;
            const durationSec = baseDuration + transitionPadding;
            const leadingTransitionSec = i > 0 ? transitionDuration : 0;
            const trailingTransitionSec = i < total - 1 ? transitionDuration : 0;

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
            if (typeof ctx.onSceneClipReady === "function") {
                ctx.onSceneClipReady({
                    sceneId: s.scene_id,
                    index: i + 1,
                    total,
                    type: visual.type,
                    cacheHit,
                    durationSec: Math.max(0, Number(s.duration_sec ?? 0))
                });
            }
        }
    });

    await Promise.all(workers);
    ctx.clipFiles = ctx.clipFiles.filter(Boolean);
    return ctx;
}
