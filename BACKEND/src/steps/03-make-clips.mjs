function makeImageClipCommand(ctx, { img, clip, durationSec }) {
    const fps = ctx.config.video.fps;
    const frames = Math.max(2, Math.floor(durationSec * fps));
    const width = ctx.config.video.width;
    const height = ctx.config.video.height;
    const frameScale = Math.min(0.95, Math.max(0.5, Number(ctx.config.video.frameScale ?? 0.78)));
    const borderPx = Math.max(0, Math.floor(Number(ctx.config.video.frameBorderPx ?? 3)));
    const makeEven = (n) => Math.max(2, Math.floor(n / 2) * 2);
    const innerW = makeEven(width * frameScale);
    const innerH = makeEven(height * frameScale);
    const zoomStart = Number(ctx.config.video.motionZoomStart ?? 1.0);
    const zoomMax = Number(ctx.config.video.motionZoomMax ?? 1.03);
    const introDuration = Math.max(0.2, Number(ctx.config.video.introDurationSec ?? 0.55));
    const introYOffset = Math.max(0, Number(ctx.config.video.introYOffsetPx ?? 110));
    const driftX = Math.max(0, Number(ctx.config.video.frameDriftXPx ?? 26));
    const driftY = Math.max(0, Number(ctx.config.video.frameDriftYPx ?? 14));
    const driftPeriod = Math.max(2, Number(ctx.config.video.frameDriftPeriodSec ?? 6));
    const preset = ctx.config.video.encodePreset ?? "veryfast";
    const zoomExpr = `${zoomStart}+(${zoomMax}-${zoomStart})*(0.5-0.5*cos(PI*on/${frames - 1}))`;
    const framedW = innerW + borderPx * 2;
    const framedH = innerH + borderPx * 2;
    const overlayXExpr = `(W-w)/2+if(lt(t,${introDuration}),0,${driftX}*sin(2*PI*(t-${introDuration})/${driftPeriod}))`;
    const overlayYExpr = `(H-h)/2+if(lt(t,${introDuration}),${introYOffset}*(1-(0.5-0.5*cos(PI*t/${introDuration}))),${driftY}*cos(2*PI*(t-${introDuration})/${driftPeriod}))`;
    const filter = [
        `[0:v]split=2[bgsrc][fgsrc]`,
        `[bgsrc]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},boxblur=40:10[bg]`,
        `[fgsrc]scale=${innerW}:${innerH}:force_original_aspect_ratio=decrease,pad=${innerW}:${innerH}:(ow-iw)/2:(oh-ih)/2:color=black,pad=${framedW}:${framedH}:${borderPx}:${borderPx}:color=black,format=rgba,fade=t=in:st=0:d=${introDuration}:alpha=1[framed]`,
        `[bg][framed]overlay=x='${overlayXExpr}':y='${overlayYExpr}':format=auto[composed]`,
        `[composed]zoompan=z='${zoomExpr}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:fps=${fps}:s=${width}x${height},format=yuv420p[vout]`
    ].join(";");

    return [
        `ffmpeg -y -loop 1 -framerate ${fps} -t ${durationSec} -i "${img}"`,
        `-filter_complex "${filter}"`,
        `-map "[vout]"`,
        `-frames:v ${frames}`,
        `-c:v libx264 -preset ${preset} -pix_fmt yuv420p`,
        `"${clip}"`
    ].join(" ");
}

function makeStockVideoClipCommand(ctx, { inputVideo, clip, durationSec }) {
    const fps = ctx.config.video.fps;
    const width = ctx.config.video.width;
    const height = ctx.config.video.height;
    const preset = ctx.config.video.encodePreset ?? "veryfast";
    const filter = `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},fps=${fps},format=yuv420p`;

    return [
        `ffmpeg -y -stream_loop -1 -i "${inputVideo}"`,
        `-t ${durationSec}`,
        `-vf "${filter}"`,
        `-an`,
        `-c:v libx264 -preset ${preset} -pix_fmt yuv420p`,
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
                    : makeImageClipCommand(ctx, { img: visual.path, clip, durationSec });

            ctx.ffmpeg.exec(cmd);
        }

        ctx.clipFiles.push(clip);
    }

    return ctx;
}
