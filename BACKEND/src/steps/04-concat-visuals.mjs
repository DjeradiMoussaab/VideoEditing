import fs from "fs";
import { VIDEO_TRANSITIONS } from "../config.mjs";
import { resolveVideoEncoderArgs } from "../utils/video-encoder.mjs";

function resolveVideoRuntimeConfig(ctx) {
    const base = ctx.config.video || {};
    const profileId = String(ctx.runOptions.renderProfile || base.renderProfile || "final");
    const profile = base.renderProfiles?.[profileId] || {};
    return {
        ...base,
        ...profile,
        renderProfile: profileId,
        fps: Number(profile.fps ?? base.fps)
    };
}

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
    if (visual?.type === "image" || visual?.type === "video" || visual?.type === "quote") return visual.type;
    return null;
}

function pickBoundaryTransition(ctx, globalIndex, defaultPool) {
    const leftType = resolveSceneVisualType(ctx, globalIndex - 1);
    const rightType = resolveSceneVisualType(ctx, globalIndex);
    if (leftType === "image" || rightType === "image" || leftType === "quote" || rightType === "quote") {
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

function buildXfadeGraph({
    clipCount,
    durations,
    transitionPool,
    transitionDuration,
    ctx,
    globalStartIndex
}) {
    const filterParts = [];
    let compositeDuration = Number(durations[0] || 0);

    for (let i = 1; i < clipCount; i++) {
        const left = i === 1 ? "[0:v]" : `[v${i - 1}]`;
        const right = `[${i}:v]`;
        const boundaryDuration = resolveBoundaryTransitionDuration(
            transitionDuration,
            durations[i - 1],
            durations[i]
        );
        const offset = Math.max(0, compositeDuration - boundaryDuration);
        const transitionType = pickBoundaryTransition(ctx, globalStartIndex + i, transitionPool);
        filterParts.push(
            `${left}${right}xfade=transition=${transitionType}:duration=${boundaryDuration}:offset=${offset}[v${i}]`
        );
        compositeDuration = compositeDuration + Number(durations[i] || 0) - boundaryDuration;
    }

    const finalLabel = `[v${clipCount - 1}]`;
    const filterComplex = `${filterParts.join(";")};${finalLabel}format=yuv420p[vout]`;
    return { filterComplex, compositeDuration };
}

function runXfadeConcat(ctx, {
    inputs,
    output,
    videoCfg,
    transitionPool,
    transitionDuration,
    globalStartIndex
}) {
    if (inputs.length === 1) {
        ctx.ffmpeg.exec(`ffmpeg -y -i "${inputs[0]}" ${resolveVideoEncoderArgs(videoCfg)} "${output}"`);
        return;
    }

    const durations = inputs.map((clip) => ctx.ffmpeg.getVideoDurationSeconds(clip));
    const { filterComplex } = buildXfadeGraph({
        clipCount: inputs.length,
        durations,
        transitionPool,
        transitionDuration,
        ctx,
        globalStartIndex
    });

    const inputArgs = inputs.map((clip) => `-i "${clip}"`).join(" ");
    const filterScriptPath = `${ctx.paths.outDir}/concat_filter_${globalStartIndex}_${inputs.length}.txt`;
    ctx.fs.writeText(filterScriptPath, filterComplex);

    const cmd = [
        `ffmpeg -y ${inputArgs}`,
        `-filter_complex_script "${filterScriptPath}"`,
        `-map "[vout]"`,
        `-r ${videoCfg.fps}`,
        resolveVideoEncoderArgs(videoCfg),
        `"${output}"`
    ].join(" ");

    ctx.ffmpeg.exec(cmd);
}

function cleanupConcatIntermediates(ctx, chunkOutputs = []) {
    for (const p of chunkOutputs) {
        try {
            if (ctx.fs.exists(p)) {
                // Keep only final output video.
                // Intermediate chunk files are removed after successful concat.
                fs.unlinkSync(p);
            }
        } catch {
            // best effort
        }
    }

    const stepsDir = `${ctx.paths.outDir}`;
    try {
        const files = fs.readdirSync(stepsDir);
        for (const name of files) {
            if (name.startsWith("concat_filter_") && name.endsWith(".txt")) {
                const full = `${stepsDir}/${name}`;
                try {
                    fs.unlinkSync(full);
                } catch {
                    // best effort
                }
            }
        }
    } catch {
        // best effort
    }
}

export async function concatVisualsStep(ctx) {
    if (ctx.fs.exists(ctx.paths.visualsMp4)) return ctx;

    const videoCfg = resolveVideoRuntimeConfig(ctx);
    const transitionPool = resolveTransitionPool(ctx.config.video.transitionIds);
    const transitionDuration = Math.max(
        0.1,
        Number(videoCfg.transitionDuration ?? ctx.config.video.transitionDuration ?? 0.6)
    );

    const clips = ctx.clipFiles || [];
    if (!clips.length) throw new Error("No clips to concatenate");

    if (clips.length === 1) {
        ctx.ffmpeg.exec(
            `ffmpeg -y -i "${clips[0]}" ${resolveVideoEncoderArgs(videoCfg)} "${ctx.paths.visualsMp4}"`
        );
        return ctx;
    }

    const chunkSize = Math.max(8, Math.min(40, Number(videoCfg.concatChunkSize ?? 24)));
    const chunkOutputs = [];

    for (let start = 0; start < clips.length; start += chunkSize) {
        const end = Math.min(clips.length, start + chunkSize);
        const chunkInputs = clips.slice(start, end);
        const chunkOut = `${ctx.paths.outDir}/chunk_${String(chunkOutputs.length + 1).padStart(3, "0")}.mp4`;
        runXfadeConcat(ctx, {
            inputs: chunkInputs,
            output: chunkOut,
            videoCfg,
            transitionPool,
            transitionDuration,
            globalStartIndex: start
        });
        chunkOutputs.push(chunkOut);
    }

    if (chunkOutputs.length === 1) {
        ctx.ffmpeg.exec(`ffmpeg -y -i "${chunkOutputs[0]}" -c copy "${ctx.paths.visualsMp4}"`);
        return ctx;
    }

    // Second stage: transition chunks (small graph, stable).
    runXfadeConcat(ctx, {
        inputs: chunkOutputs,
        output: ctx.paths.visualsMp4,
        videoCfg,
        transitionPool,
        transitionDuration,
        globalStartIndex: 0
    });
    cleanupConcatIntermediates(ctx, chunkOutputs);

    return ctx;
}
