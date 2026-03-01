import { resolveVideoEncoderArgs } from "../utils/video-encoder.mjs";

function resolveAnimationProfile(ctx, styleOverride = null) {
    const profiles = ctx.config.video.imageAnimationProfiles || {};
    const style = String(
        styleOverride ||
        ctx.runOptions.imageAnimationStyle ||
        ctx.config.video.imageAnimationStyle ||
        "cinematic_drift"
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

function makeImageClipCommand(
    ctx,
    { img, clip, durationSec, styleId = null, leadingTransitionSec = 0, trailingTransitionSec = 0 }
) {
    const profile = resolveAnimationProfile(ctx, styleId);
    const fps = ctx.config.video.fps;
    const frames = Math.max(2, Math.floor(durationSec * fps));
    const width = ctx.config.video.width;
    const height = ctx.config.video.height;
    const frameScale = Math.min(0.95, Math.max(0.5, Number(profile.frameScale ?? 0.78)));
    const borderPx = Math.max(0, Math.floor(Number(profile.frameBorderPx ?? 3)));
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
    const encoderArgs = resolveVideoEncoderArgs(ctx.config.video);
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
        : `if(lt(t,${animationStart}),${zoomStart},if(gt(t,${animationEnd}),${zoomMax},${zoomStart}+(${zoomMax}-${zoomStart})*(0.5-0.5*cos(PI*(t-${animationStart})/${animationSpan}))))`;
    const introStart = animationStart;
    const introEnd = Math.min(animationEnd, introStart + introDuration);
    const introEaseExpr = `if(lt(t,${introStart}),0,if(lt(t,${introEnd}),(0.5-0.5*cos(PI*(t-${introStart})/${Math.max(0.1, introEnd - introStart)})),1))`;
    const framedW = innerW + borderPx * 2;
    const framedH = innerH + borderPx * 2;
    const overlayXExpr = `(W-w)/2+${introEaseExpr}*${driftX}*sin(2*PI*t/${driftPeriod})`;
    const overlayYExpr = `(H-h)/2+${introYOffset}*(1-${introEaseExpr})+${introEaseExpr}*${driftY}*cos(2*PI*t/${driftPeriod})`;
    const filter = [
        `[0:v]split=2[bgsrc][fgsrc]`,
        `[bgsrc]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},boxblur=40:10[bg]`,
        `[fgsrc]scale=${innerW}:${innerH}:force_original_aspect_ratio=decrease,pad=${innerW}:${innerH}:(ow-iw)/2:(oh-ih)/2:color=black,pad=${framedW}:${framedH}:${borderPx}:${borderPx}:color=black,format=rgba,fade=t=in:st=${animationStart}:d=${introDuration}:alpha=1,scale=w='trunc(iw*(${zoomExpr})/2)*2':h='trunc(ih*(${zoomExpr})/2)*2':eval=frame[framed]`,
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

function makeStockVideoClipCommand(ctx, { inputVideo, clip, durationSec }) {
    const fps = ctx.config.video.fps;
    const width = ctx.config.video.width;
    const height = ctx.config.video.height;
    const encoderArgs = resolveVideoEncoderArgs(ctx.config.video);
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

function resolveSceneVisual(ctx, scene) {
    const mode = ctx.visualSourceMode;
    const intended = ctx.sceneVisualChoices[scene.scene_id];
    const mapped = ctx.sceneVisuals[scene.scene_id];
    if (mapped) return mapped;

    const stockPath = ctx.paths.sceneStockVideo(scene.scene_id);
    if (ctx.fs.exists(stockPath)) return { type: "video", path: stockPath };

    const imgPath = ctx.paths.sceneImage(scene.scene_id);
    if (ctx.fs.exists(imgPath)) return { type: "image", path: imgPath };

    if (intended === "video" || mode === "stock_video") {
        throw new Error(`No stock video found for scene ${scene.scene_id}`);
    }
    if (mode === "hybrid" && !ctx.config.visual.fallbackToImagesWhenNoStock) {
        throw new Error(`No stock video found for scene ${scene.scene_id} and fallback is disabled`);
    }

    return { type: "image", path: imgPath };
}

export async function makeClipsStep(ctx) {
    const transitionDuration = Math.max(0, Number(ctx.config.video.transitionDuration ?? 0));
    ctx.clipFiles = [];

    for (let i = 0; i < ctx.plan.scenes.length; i++) {
        const s = ctx.plan.scenes[i];
        const clip = ctx.paths.sceneClip(s.scene_id);
        const visual = resolveSceneVisual(ctx, s);
        ctx.sceneVisuals[s.scene_id] = visual;

        if (!ctx.fs.exists(clip)) {
            const baseDuration = Math.max(0.2, Number(s.duration_sec ?? 0));
            const transitionPadding = i < ctx.plan.scenes.length - 1 ? transitionDuration : 0;
            const durationSec = baseDuration + transitionPadding;
            const cmd =
                visual.type === "video"
                    ? makeStockVideoClipCommand(ctx, { inputVideo: visual.path, clip, durationSec })
                    : makeImageClipCommand(ctx, {
                        img: visual.path,
                        clip,
                        durationSec,
                        styleId: visual.animationStyle || null,
                        leadingTransitionSec: i > 0 ? transitionDuration : 0,
                        trailingTransitionSec: i < ctx.plan.scenes.length - 1 ? transitionDuration : 0
                    });

            ctx.ffmpeg.exec(cmd);
        }

        ctx.clipFiles.push(clip);
        if (typeof ctx.onSceneClipReady === "function") {
            ctx.onSceneClipReady({
                sceneId: s.scene_id,
                index: i + 1,
                total: ctx.plan.scenes.length,
                type: visual.type,
                durationSec: Math.max(0, Number(s.duration_sec ?? 0))
            });
        }
    }

    return ctx;
}
