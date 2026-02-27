import fs from "fs";

function toSrtTimestamp(seconds) {
    const totalMs = Math.max(0, Math.floor(Number(seconds || 0) * 1000));
    const h = Math.floor(totalMs / 3600000);
    const m = Math.floor((totalMs % 3600000) / 60000);
    const s = Math.floor((totalMs % 60000) / 1000);
    const ms = totalMs % 1000;
    const pad = (n, w = 2) => String(n).padStart(w, "0");
    return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms, 3)}`;
}

function segmentsToSrt(segments) {
    return segments
        .map((seg, i) => {
            const start = toSrtTimestamp(seg.start);
            const end = toSrtTimestamp(seg.end);
            const text = String(seg.text ?? "").trim();
            return `${i + 1}\n${start} --> ${end}\n${text}\n`;
        })
        .join("\n");
}

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

    const model = ctx.config.models.transcribe;
    const file = fs.createReadStream(ctx.paths.voiceMp3);

    if (model === "whisper-1") {
        const srt = await ctx.openai.audio.transcriptions.create({
            file,
            model,
            response_format: "srt"
        });
        fs.writeFileSync(ctx.paths.subtitlesSrt, srt);
        return ctx;
    }

    const json = await ctx.openai.audio.transcriptions.create({
        file,
        model,
        response_format: "json"
    });

    if (Array.isArray(json?.segments) && json.segments.length) {
        fs.writeFileSync(ctx.paths.subtitlesSrt, segmentsToSrt(json.segments));
        return ctx;
    }

    const text = String(json?.text ?? "").trim();
    const duration = ctx.ffmpeg.getAudioDurationSeconds(ctx.paths.voiceMp3);
    const fallback = `1\n${toSrtTimestamp(0)} --> ${toSrtTimestamp(duration)}\n${text}\n`;
    fs.writeFileSync(ctx.paths.subtitlesSrt, fallback);
    return ctx;
}
