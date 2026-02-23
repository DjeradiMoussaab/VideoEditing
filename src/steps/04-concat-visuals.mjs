export async function concatVisualsStep(ctx) {
    if (ctx.fs.exists(ctx.paths.visualsMp4)) return ctx;
    const preset = ctx.config.video.encodePreset ?? "veryfast";

    if (ctx.clipFiles.length === 1) {
        ctx.ffmpeg.exec(
            `ffmpeg -y -i "${ctx.clipFiles[0]}" -c:v libx264 -preset ${preset} -pix_fmt yuv420p "${ctx.paths.visualsMp4}"`
        );
        return ctx;
    }

    const durations = ctx.clipFiles.map((clip) => ctx.ffmpeg.getVideoDurationSeconds(clip));
    const transitionType = ctx.config.video.transitionType ?? "fade";
    const transitionDuration = Math.max(0.1, Number(ctx.config.video.transitionDuration ?? 0.6));

    const inputArgs = ctx.clipFiles.map((clip) => `-i "${clip}"`).join(" ");
    const filterParts = [];

    for (let i = 1; i < ctx.clipFiles.length; i++) {
        const left = i === 1 ? "[0:v]" : `[v${i - 1}]`;
        const right = `[${i}:v]`;
        const offset = durations.slice(0, i).reduce((acc, d) => acc + d, 0) - transitionDuration * i;
        filterParts.push(
            `${left}${right}xfade=transition=${transitionType}:duration=${transitionDuration}:offset=${Math.max(0, offset)}[v${i}]`
        );
    }

    const finalLabel = `[v${ctx.clipFiles.length - 1}]`;
    const filterComplex = `${filterParts.join(";")};${finalLabel}format=yuv420p[vout]`;
    const cmd = [
        `ffmpeg -y ${inputArgs}`,
        `-filter_complex "${filterComplex}"`,
        `-map "[vout]"`,
        `-r ${ctx.config.video.fps}`,
        `-c:v libx264 -preset ${preset} -pix_fmt yuv420p`,
        `"${ctx.paths.visualsMp4}"`
    ].join(" ");

    ctx.ffmpeg.exec(cmd);

    return ctx;
}
