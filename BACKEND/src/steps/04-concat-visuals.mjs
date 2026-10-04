import fs from "fs";
import { boundaryTransition, transitionPadding } from '../../../SHARED/transitions.mjs';
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

// boundaryIndices identifies the incoming scene for each input, including chunk inputs.
export function buildXfadeGraph({ durations, ctx, boundaryIndices, fps = 30 }) {
    const filterParts = [];
    // Every input needs the same timebase, including previously encoded chunks.
    durations.forEach((_, i) => filterParts.push(`[${i}:v]setpts=PTS-STARTPTS,fps=${fps},settb=AVTB[in${i}]`));
    let compositeDuration = Number(durations[0] || 0);
    for (let i = 1; i < durations.length; i++) {
        const left = i === 1 ? '[in0]' : `[v${i - 1}]`;
        const right = `[in${i}]`;
        const transition = boundaryTransition(ctx.plan.scenes, boundaryIndices[i] - 1);
        const overlap = transition?.duration_sec || 0;
        const offset = Math.max(0, compositeDuration - overlap);
        filterParts.push(transition
            ? `${left}${right}xfade=transition=${transition.type}:duration=${overlap}:offset=${offset}[v${i}]`
            : `${left}${right}concat=n=2:v=1:a=0[v${i}]`);
        compositeDuration += Number(durations[i]) - overlap;
    }
    const finalLabel = durations.length === 1 ? '[in0]' : `[v${durations.length - 1}]`;
    return { filterComplex: `${filterParts.join(';')};${finalLabel}format=yuv420p[vout]`, compositeDuration };
}

function runXfadeConcat(ctx, {
    inputs,
    durations,
    output,
    videoCfg,
    boundaryIndices,
    globalStartIndex
}) {
    if (inputs.length === 1) {
        ctx.ffmpeg.exec(`ffmpeg -y -i "${inputs[0]}" ${resolveVideoEncoderArgs(videoCfg)} "${output}"`);
        return;
    }

    const { filterComplex, compositeDuration } = buildXfadeGraph({ durations, ctx, boundaryIndices, fps: videoCfg.fps });

    const inputArgs = inputs.map((clip) => `-i "${clip}"`).join(" ");
    const filterScriptPath = `${ctx.paths.outDir}/concat_filter_${globalStartIndex}_${inputs.length}.txt`;
    ctx.fs.writeText(filterScriptPath, filterComplex);

    const cmd = [
        `ffmpeg -y ${inputArgs}`,
        `-filter_complex_script "${filterScriptPath}"`,
        `-map "[vout]"`,
        `-r ${videoCfg.fps} -t ${compositeDuration}`,
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
    const chunkDurations = [];
    // Use planned times, rather than rounded MP4 durations, to avoid accumulating
    // one-frame errors at every border when a duration falls between frames.
    const durations = ctx.plan.scenes.map((scene, i) => {
        const { leading, trailing } = transitionPadding(ctx.plan.scenes, i);
        return Number(scene.duration_sec) + leading + trailing;
    });

    for (let start = 0; start < clips.length; start += chunkSize) {
        const end = Math.min(clips.length, start + chunkSize);
        const chunkInputs = clips.slice(start, end);
        const chunkOut = `${ctx.paths.outDir}/chunk_${String(chunkOutputs.length + 1).padStart(3, "0")}.mp4`;
        runXfadeConcat(ctx, {
            inputs: chunkInputs,
            durations: durations.slice(start, end),
            output: chunkOut,
            videoCfg,
            boundaryIndices: chunkInputs.map((_, i) => start + i),
            globalStartIndex: start
        });
        chunkOutputs.push(chunkOut);
        chunkDurations.push(buildXfadeGraph({ durations: durations.slice(start, end), ctx,
            boundaryIndices: chunkInputs.map((_, i) => start + i), fps: videoCfg.fps }).compositeDuration);
    }

    if (chunkOutputs.length === 1) {
        ctx.ffmpeg.exec(`ffmpeg -y -i "${chunkOutputs[0]}" -c copy "${ctx.paths.visualsMp4}"`);
        cleanupConcatIntermediates(ctx, chunkOutputs);
        return ctx;
    }

    // Second stage: transition chunks (small graph, stable).
    runXfadeConcat(ctx, {
        inputs: chunkOutputs,
        durations: chunkDurations,
        output: ctx.paths.visualsMp4,
        videoCfg,
        boundaryIndices: chunkOutputs.map((_, i) => i * chunkSize),
        globalStartIndex: 0
    });
    cleanupConcatIntermediates(ctx, chunkOutputs);

    return ctx;
}
