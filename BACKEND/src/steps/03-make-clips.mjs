import fs from "fs";
import crypto from "crypto";
import path from "path";
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

function makeImageClipCommand(
    ctx,
    videoCfg,
    { img, clip, durationSec, styleId = null, leadingTransitionSec = 0, trailingTransitionSec = 0 }
) {
    const profile = resolveAnimationProfile(ctx, styleId);
    const fps = videoCfg.fps;
    const frames = Math.max(2, Math.floor(durationSec * fps));
    const width = videoCfg.width;
    const height = videoCfg.height;
    const frameScale = Math.min(0.95, Math.max(0.5, Number(profile.frameScale ?? 0.78)));
    const borderPx = Math.max(0, Math.floor(Number(profile.frameBorderPx ?? 3)));
    const borderColor = String(profile.frameBorderColor || "black");
    const look = String(profile.look || "");
    const makeEven = (n) => Math.max(2, Math.floor(n / 2) * 2);
    const innerW = makeEven(width * frameScale);
    const innerH = makeEven(height * frameScale);
    const zoomStart = Number(profile.motionZoomStart ?? 1.0);
    const zoomMax = Number(profile.motionZoomMax ?? 1.03);
    const zoomMode = String(profile.zoomMode || "continuous");
    const introDuration = Math.max(0.2, Number(profile.introDurationSec ?? 0.55));
    const introYOffset = Math.max(0, Number(profile.introYOffsetPx ?? 110));
    const driftX = Math.max(0, Number(profile.frameDriftXPx ?? 26));
    const driftY = Math.max(0, Number(profile.frameDriftYPx ?? 14));
    const driftPeriod = Math.max(2, Number(profile.frameDriftPeriodSec ?? 6));
    const encoderArgs = resolveVideoEncoderArgs(videoCfg);
    const safeDuration = Math.max(0.3, Number(durationSec));
    const zoomInDuration = Math.max(0.1, Math.min(safeDuration / 2, Number(profile.zoomInDurationSec ?? 0.5)));
    const zoomOutDuration = Math.max(0.1, Math.min(safeDuration / 2, Number(profile.zoomOutDurationSec ?? 0.5)));
    const lead = Math.max(0, Number(leadingTransitionSec || 0));
    const trail = Math.max(0, Number(trailingTransitionSec || 0));
    const animationStart = Math.min(safeDuration, lead);
    const animationEnd = Math.max(animationStart, safeDuration - trail);
    const animationSpan = Math.max(0.1, animationEnd - animationStart);
    const zoomInStart = Math.min(safeDuration, lead);
    const zoomInEnd = Math.min(safeDuration, zoomInStart + zoomInDuration);
    const zoomOutEnd = Math.max(0, safeDuration - trail);
    const zoomOutStart = Math.max(zoomInEnd, zoomOutEnd - zoomOutDuration);
    const zoomExpr = zoomMode === "capcut_zoom1"
        ? `if(lt(t,${zoomInStart}),${zoomStart},if(lt(t,${zoomInEnd}),${zoomStart}+(${zoomMax}-${zoomStart})*(0.5-0.5*cos(PI*(t-${zoomInStart})/${Math.max(0.1, zoomInEnd - zoomInStart)})),if(lt(t,${zoomOutStart}),${zoomMax},if(lt(t,${zoomOutEnd}),${zoomMax}-(${zoomMax}-${zoomStart})*(0.5-0.5*cos(PI*(t-${zoomOutStart})/${Math.max(0.1, zoomOutEnd - zoomOutStart)})),${zoomStart}))))`
        : zoomMode === "surprise_animation"
            ? `if(lt(t,${animationStart}),${zoomStart},if(lt(t,${animationStart + 0.55}),${zoomStart}+(1.03-${zoomStart})*(0.5-0.5*cos(PI*(t-${animationStart})/0.55)),if(lt(t,${animationStart + 1.15}),1.03-(1.03-1.0)*(0.5-0.5*cos(PI*(t-${animationStart + 0.55})/0.6)),if(gt(t,${animationEnd}),${zoomMax},1.0+(${zoomMax}-1.0)*(0.5-0.5*cos(PI*(t-${animationStart + 1.15})/${Math.max(0.12, animationEnd - (animationStart + 1.15))}))))))`
        : `if(lt(t,${animationStart}),${zoomStart},if(gt(t,${animationEnd}),${zoomMax},${zoomStart}+(${zoomMax}-${zoomStart})*(0.5-0.5*cos(PI*(t-${animationStart})/${animationSpan}))))`;
    const introStart = animationStart;
    const introEnd = Math.min(animationEnd, introStart + introDuration);
    const introBlurEnd = Math.min(animationEnd, introStart + 0.42);
    const introEaseExpr = `if(lt(t,${introStart}),0,if(lt(t,${introEnd}),(0.5-0.5*cos(PI*(t-${introStart})/${Math.max(0.1, introEnd - introStart)})),1))`;
    const framedW = innerW + borderPx * 2;
    const framedH = innerH + borderPx * 2;
    const overlayXExpr = `(W-w)/2+${introEaseExpr}*${driftX}*sin(2*PI*t/${driftPeriod})`;
    const overlayYExpr = `(H-h)/2+${introYOffset}*(1-${introEaseExpr})+${introEaseExpr}*${driftY}*cos(2*PI*t/${driftPeriod})`;
    const bgLookFilter = look === "surprise_animation"
        ? ",eq=contrast=1.12:saturation=0.36:gamma=0.92:brightness=-0.02,boxblur=52:16,noise=alls=3.4:allf=t+u,drawgrid=width=120:height=80:thickness=1:color=white@0.02,vignette=PI/5"
        : "";
    const fgLookFilter = look === "surprise_animation"
        ? `,eq=contrast=1.12:saturation=0.84:gamma=0.96,noise=alls=1.35:allf=t+u,boxblur=2:1:enable='between(t,${animationStart},${introBlurEnd})',unsharp=5:5:0.75:5:5:0`
        : "";

    if (zoomMode.startsWith("fullscreen_")) {
        const den = Math.max(1, frames - 1);
        // zoompan evaluates these expressions for every output frame. `on` is its
        // output-frame counter and is supported by FFmpeg on macOS and Linux.
        const ease = `(0.5-0.5*cos(PI*on/${den}))`;
        const fullscreenZoomStart = Number(profile.motionZoomStart ?? 1.0);
        const fullscreenZoomEnd = Number(profile.motionZoomMax ?? 1.25);
        const zoom = zoomMode === "fullscreen_breathe"
            ? `${fullscreenZoomStart}+(${fullscreenZoomEnd}-${fullscreenZoomStart})*sin(PI*on/${den})`
            : `${fullscreenZoomStart}+(${fullscreenZoomEnd}-${fullscreenZoomStart})*${ease}`;

        const overscale = Math.max(fullscreenZoomStart, fullscreenZoomEnd);
        const overscaleW = `ceil(${width}*${overscale}/2)*2`;
        const overscaleH = `ceil(${height}*${overscale}/2)*2`;

        const panX = zoomMode === "fullscreen_drift_right"
            ? `(iw-iw/zoom)*${ease}`
            : zoomMode === "fullscreen_drift_left"
                ? `(iw-iw/zoom)*(1-${ease})`
                : `(iw-iw/zoom)/2`;
        const panY = `(ih-ih/zoom)/2`;

        const filter = [
            `[0:v]scale=${overscaleW}:${overscaleH}:force_original_aspect_ratio=increase`,
            `crop=${overscaleW}:${overscaleH}`,
            `zoompan=z='${zoom}':x='${panX}':y='${panY}':d=1:fps=${fps}:s=${width}x${height}`,
            `format=yuv420p[vout]`
        ].join(",");

        return [
            `ffmpeg -y -loop 1 -framerate ${fps} -t ${durationSec} -i "${img}"`,
            `-filter_complex "${filter}"`,
            `-map "[vout]"`,
            encoderArgs,
            `"${clip}"`
        ].join(" ");
    }

    const filter = [
        `[0:v]split=2[bgsrc][fgsrc]`,
        `[bgsrc]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},boxblur=${videoCfg.blurStrength}${bgLookFilter}[bg]`,
        `[fgsrc]scale=${innerW}:${innerH}:force_original_aspect_ratio=decrease,pad=${innerW}:${innerH}:(ow-iw)/2:(oh-ih)/2:color=black,pad=${framedW}:${framedH}:${borderPx}:${borderPx}:color=${borderColor}${fgLookFilter},format=rgba,fade=t=in:st=${animationStart}:d=${introDuration}:alpha=1,scale=w='trunc(iw*(${zoomExpr})/2)*2':h='trunc(ih*(${zoomExpr})/2)*2':eval=frame[framed]`,
        `[bg][framed]overlay=x='${overlayXExpr}':y='${overlayYExpr}':eval=frame:enable='gte(t,${animationStart})':format=auto,fps=${fps},format=yuv420p[vout]`
    ].join(";");

    return [
        `ffmpeg -y -loop 1 -framerate ${fps} -t ${durationSec} -i "${img}"`,
        `-filter_complex "${filter}"`,
        `-map "[vout]"`,
        `-frames:v ${frames}`,
        `-r ${fps}`,
        encoderArgs,
        `"${clip}"`
    ].join(" ");
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
        v: 5,
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
