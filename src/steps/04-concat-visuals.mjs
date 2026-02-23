import { VIDEO_TRANSITIONS } from "../config.mjs";

function resolveTransitionPool(transitionIds) {
    const ids = Array.isArray(transitionIds) && transitionIds.length ? transitionIds : [1];
    const names = ids.map((id) => VIDEO_TRANSITIONS[id]).filter(Boolean);

    if (!names.length) {
        throw new Error(`No valid transition IDs provided. Available IDs: ${Object.keys(VIDEO_TRANSITIONS).join(", ")}`);
    }

    return names;
}

function pickRandomTransition(pool) {
    const idx = Math.floor(Math.random() * pool.length);
    return pool[idx];
}

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
    const transitionPool = resolveTransitionPool(ctx.config.video.transitionIds);
    const transitionDuration = Math.max(0.1, Number(ctx.config.video.transitionDuration ?? 0.6));

    const inputArgs = ctx.clipFiles.map((clip) => `-i "${clip}"`).join(" ");
    const filterParts = [];

    for (let i = 1; i < ctx.clipFiles.length; i++) {
        const left = i === 1 ? "[0:v]" : `[v${i - 1}]`;
        const right = `[${i}:v]`;
        const offset = durations.slice(0, i).reduce((acc, d) => acc + d, 0) - transitionDuration * i;
        const transitionType = pickRandomTransition(transitionPool);
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
