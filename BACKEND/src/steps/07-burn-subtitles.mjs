export async function burnSubtitlesStep(ctx) {
    if (ctx.fs.exists(ctx.paths.finalSubbedMp4)) return ctx;

    const srtEscaped = ctx.ffmpeg.escapeSubtitlesPathForFfmpeg(ctx.paths.subtitlesSrt);
    ctx.ffmpeg.exec(`ffmpeg -y -i "${ctx.paths.finalMp4}" -vf "subtitles=${srtEscaped}" "${ctx.paths.finalSubbedMp4}"`);

    return ctx;
}