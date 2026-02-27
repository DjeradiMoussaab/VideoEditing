export async function addAudioStep(ctx) {
    if (ctx.fs.exists(ctx.paths.finalMp4)) return ctx;

    ctx.ffmpeg.exec(
        `ffmpeg -y -i "${ctx.paths.visualsMp4}" -i "${ctx.paths.voiceMp3}" -c:v copy -c:a aac -shortest "${ctx.paths.finalMp4}"`
    );

    return ctx;
}