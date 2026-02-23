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
            const supersample = Math.max(1, Number(ctx.config.video.zoomSupersample ?? 3));
            const panWidth = Math.round(width * supersample);
            const panHeight = Math.round(height * supersample);
            const srcWidth = panWidth;
            const srcHeight = panHeight;
            const zoomStart = Number(ctx.config.video.zoomStart ?? 1.0);
            const zoomMax = Number(ctx.config.video.zoomMax ?? 1.12);
            const preset = ctx.config.video.encodePreset ?? "veryfast";
            const zoomExpr = `${zoomStart}+(${zoomMax}-${zoomStart})*(0.5-0.5*cos(PI*on/${frames - 1}))`;

            const cmd = [
                `ffmpeg -y -loop 1 -framerate ${fps} -t ${d} -i "${img}"`,
                `-vf "scale=${srcWidth}:${srcHeight}:force_original_aspect_ratio=increase,crop=${srcWidth}:${srcHeight},zoompan=z='${zoomExpr}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:fps=${fps}:s=${panWidth}x${panHeight},scale=${width}:${height}:flags=lanczos,format=yuv420p"`,
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
