import fs from "fs";

export async function transcribeSrtStep(ctx) {
    if (ctx.fs.exists(ctx.paths.subtitlesSrt)) return ctx;

    if (ctx.runOptions.mockOpenAI) {
        if (!ctx.fs.exists(ctx.paths.mockSubtitlesSrt)) {
            throw new Error(
                `Mock mode enabled but missing mock subtitles file: ${ctx.paths.mockSubtitlesSrt}`
            );
        }
        const srt = ctx.fs.readText(ctx.paths.mockSubtitlesSrt);
        ctx.fs.writeText(ctx.paths.subtitlesSrt, srt);
        return ctx;
    }

    const file = fs.createReadStream(ctx.paths.voiceMp3);
    const r = await ctx.openai.audio.transcriptions.create({
        file,
        model: ctx.config.models.transcribe,
        response_format: "srt"
    });

    fs.writeFileSync(ctx.paths.subtitlesSrt, r);
    return ctx;
}
