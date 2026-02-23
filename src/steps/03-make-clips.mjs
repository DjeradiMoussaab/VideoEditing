export async function makeClipsStep(ctx) {
    const totalAudio = ctx.ffmpeg.getAudioDurationSeconds(ctx.paths.voiceMp3);
    const sceneCount = ctx.plan.scenes.length;
    const transitionDuration = Math.max(0, Number(ctx.config.video.transitionDuration ?? 0));
    const totalTransitionOverlap = Math.max(0, sceneCount - 1) * transitionDuration;
    const perScene = (totalAudio + totalTransitionOverlap) / sceneCount;

    ctx.clipFiles = [];

    for (const s of ctx.plan.scenes) {
        const img = ctx.paths.sceneImage(s.scene_id);
        const clip = ctx.paths.sceneClip(s.scene_id);

        if (!ctx.fs.exists(clip)) {
            const d = Math.max(1, perScene);
            const fps = ctx.config.video.fps;
            const frames = Math.max(2, Math.floor(d * fps));
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

            const cmd = [
                `ffmpeg -y -loop 1 -framerate ${fps} -t ${d} -i "${img}"`,
                `-filter_complex "${filter}"`,
                `-map "[vout]"`,
                `-frames:v ${frames}`,
                `-c:v libx264 -preset ${preset} -pix_fmt yuv420p`,
                `"${clip}"`
            ].join(" ");

            ctx.ffmpeg.exec(cmd);
        }

        ctx.clipFiles.push(clip);
    }

    return ctx;
}
