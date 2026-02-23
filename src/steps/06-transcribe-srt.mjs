import fs from "fs";

export async function transcribeSrtStep(ctx) {
    if (ctx.fs.exists(ctx.paths.subtitlesSrt)) return ctx;

    const file = fs.createReadStream(ctx.paths.voiceMp3);
    const r = await ctx.openai.audio.transcriptions.create({
        file,
        model: ctx.config.models.transcribe,
        response_format: "srt"
    });

    fs.writeFileSync(ctx.paths.subtitlesSrt, r);
    return ctx;
}