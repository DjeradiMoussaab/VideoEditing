import { VIDEO_TRANSITIONS } from "../config.mjs";
import { resolveVideoEncoderArgs } from "../utils/video-encoder.mjs";

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

function resolveSceneVisualType(ctx, index) {
    const scene = ctx.plan?.scenes?.[index];
    if (!scene) return null;
    const visual = ctx.sceneVisuals?.[scene.scene_id];
    if (visual?.type === "image" || visual?.type === "video") return visual.type;
    return null;
}

function pickBoundaryTransition(ctx, index, defaultPool) {
    const leftType = resolveSceneVisualType(ctx, index - 1);
    const rightType = resolveSceneVisualType(ctx, index);

    // Image boundaries look cleaner with dissolve-like cuts.
    if (leftType === "image" || rightType === "image") {
        return "fade";
    }

    return pickRandomTransition(defaultPool);
}

function resolveBoundaryTransitionDuration(baseDuration, leftClipDuration, rightClipDuration) {
    const base = Math.max(0.1, Number(baseDuration || 0.6));
    const left = Math.max(0.2, Number(leftClipDuration || 0.2));
    const right = Math.max(0.2, Number(rightClipDuration || 0.2));
    const capped = Math.min(left, right) * 0.35;
    return Math.max(0.12, Math.min(base, capped));
}

export async function concatVisualsStep(ctx) {
    if (ctx.fs.exists(ctx.paths.visualsMp4)) return ctx;
    const encoderArgs = resolveVideoEncoderArgs(ctx.config.video);

    if (ctx.clipFiles.length === 1) {
        ctx.ffmpeg.exec(
            `ffmpeg -y -i "${ctx.clipFiles[0]}" ${encoderArgs} "${ctx.paths.visualsMp4}"`
        );
        return ctx;
    }

    const durations = ctx.clipFiles.map((clip) => ctx.ffmpeg.getVideoDurationSeconds(clip));
    const transitionPool = resolveTransitionPool(ctx.config.video.transitionIds);
    const transitionDuration = Math.max(0.1, Number(ctx.config.video.transitionDuration ?? 0.6));

    const inputArgs = ctx.clipFiles.map((clip) => `-i "${clip}"`).join(" ");
    const filterParts = [];

    let compositeDuration = Number(durations[0] || 0);
    for (let i = 1; i < ctx.clipFiles.length; i++) {
        const left = i === 1 ? "[0:v]" : `[v${i - 1}]`;
        const right = `[${i}:v]`;
        const boundaryDuration = resolveBoundaryTransitionDuration(
            transitionDuration,
            durations[i - 1],
            durations[i]
        );
        const offset = Math.max(0, compositeDuration - boundaryDuration);
        const transitionType = pickBoundaryTransition(ctx, i, transitionPool);
        filterParts.push(
            `${left}${right}xfade=transition=${transitionType}:duration=${boundaryDuration}:offset=${offset}[v${i}]`
        );
        compositeDuration = compositeDuration + Number(durations[i] || 0) - boundaryDuration;
    }

    const finalLabel = `[v${ctx.clipFiles.length - 1}]`;
    const filterComplex = `${filterParts.join(";")};${finalLabel}format=yuv420p[vout]`;
    const cmd = [
        `ffmpeg -y ${inputArgs}`,
        `-filter_complex "${filterComplex}"`,
        `-map "[vout]"`,
        `-r ${ctx.config.video.fps}`,
        encoderArgs,
        `"${ctx.paths.visualsMp4}"`
    ].join(" ");

    ctx.ffmpeg.exec(cmd);

    return ctx;
}
