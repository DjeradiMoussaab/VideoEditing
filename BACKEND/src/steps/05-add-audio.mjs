import fs from "fs";
import path from "path";
import child_process from "child_process";

function quotePath(p) {
    return String(p || "").replace(/"/g, '\\"');
}

function hasAudioStream(filePath) {
    try {
        const cmd = `ffprobe -v error -select_streams a -show_entries stream=codec_type -of csv=p=0 "${quotePath(filePath)}"`;
        const out = child_process.execSync(cmd).toString().trim();
        return out.includes("audio");
    } catch {
        return false;
    }
}

function mergeWithVoiceTrack(ctx, voiceTrackPath) {
    ctx.ffmpeg.exec(
        `ffmpeg -y -i "${quotePath(ctx.paths.visualsMp4)}" -i "${quotePath(voiceTrackPath)}" -c:v copy -c:a aac -shortest "${quotePath(ctx.paths.finalMp4)}"`
    );
}

function collectInsertedSceneGaps(planScenes = []) {
    return planScenes
        .filter((s) => Boolean(s?.isInsertedScene) && Number(s?.duration_sec || 0) > 0)
        .map((s) => ({
            startSec: Math.max(0, Number(s.start_sec || 0)),
            durationSec: Math.max(0.1, Number(s.duration_sec || 0))
        }))
        .sort((a, b) => a.startSec - b.startSec);
}

function buildVoiceWithInsertGaps(ctx) {
    const insertions = collectInsertedSceneGaps(ctx.plan?.scenes || []);
    if (!insertions.length) return ctx.paths.voiceMp3;

    const tempDir = path.join(path.dirname(ctx.paths.finalMp4), "_tmp_audio_gap");
    fs.mkdirSync(tempDir, { recursive: true });

    const parts = [];
    const makeVoicePart = (startSec, endSecOrNull, outPath) => {
        const trim = endSecOrNull === null
            ? `atrim=start=${startSec}`
            : `atrim=start=${startSec}:end=${endSecOrNull}`;
        const cmd = [
            `ffmpeg -y -i "${quotePath(ctx.paths.voiceMp3)}"`,
            `-vn -af "${trim},asetpts=PTS-STARTPTS,aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo"`,
            `-acodec pcm_s16le`,
            `"${quotePath(outPath)}"`
        ].join(" ");
        ctx.ffmpeg.exec(cmd);
    };
    const makeSilencePart = (durationSec, outPath) => {
        const cmd = [
            `ffmpeg -y -f lavfi -t ${durationSec} -i "anullsrc=r=44100:cl=stereo"`,
            `-acodec pcm_s16le`,
            `"${quotePath(outPath)}"`
        ].join(" ");
        ctx.ffmpeg.exec(cmd);
    };

    let cursorSec = 0;
    let insertedSoFarSec = 0;
    let idx = 0;
    for (const ins of insertions) {
        const cutAtOriginalSec = Math.max(cursorSec, ins.startSec - insertedSoFarSec);
        if (cutAtOriginalSec > cursorSec + 0.01) {
            const voicePart = path.join(tempDir, `part_${String(idx).padStart(3, "0")}_voice.wav`);
            makeVoicePart(cursorSec, cutAtOriginalSec, voicePart);
            parts.push(voicePart);
            idx += 1;
        }

        const silencePart = path.join(tempDir, `part_${String(idx).padStart(3, "0")}_silence.wav`);
        makeSilencePart(ins.durationSec, silencePart);
        parts.push(silencePart);
        idx += 1;

        cursorSec = cutAtOriginalSec;
        insertedSoFarSec += ins.durationSec;
    }

    const tailPart = path.join(tempDir, `part_${String(idx).padStart(3, "0")}_tail.wav`);
    makeVoicePart(cursorSec, null, tailPart);
    parts.push(tailPart);

    const concatList = path.join(tempDir, "concat.txt");
    const concatBody = parts.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join("\n");
    fs.writeFileSync(concatList, `${concatBody}\n`);

    const paddedVoice = path.join(tempDir, "voice_padded.wav");
    ctx.ffmpeg.exec(
        `ffmpeg -y -f concat -safe 0 -i "${quotePath(concatList)}" -c copy "${quotePath(paddedVoice)}"`
    );
    return paddedVoice;
}

function mixSurpriseSfx(ctx, voiceTrackPath, sfxPath, surpriseStarts, sfxTrimSec, sfxVolume) {
    const chain = [];
    chain.push(`[1:a]aresample=44100,aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo,asetpts=PTS-STARTPTS[voice]`);
    chain.push(`[2:a]atrim=0:${sfxTrimSec},asetpts=PTS-STARTPTS,volume=${sfxVolume},aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo[sfxbase]`);

    const delayed = [];
    for (let i = 0; i < surpriseStarts.length; i++) {
        const ms = Math.max(0, Math.floor(surpriseStarts[i] * 1000));
        const label = `sfx${i}`;
        chain.push(`[sfxbase]adelay=${ms}|${ms}[${label}]`);
        delayed.push(`[${label}]`);
    }
    if (delayed.length === 1) {
        chain.push(`${delayed[0]}anull[sfxmix]`);
    } else {
        chain.push(`${delayed.join("")}amix=inputs=${delayed.length}:normalize=0[sfxmix]`);
    }
    chain.push(`[voice][sfxmix]amix=inputs=2:normalize=0[aout]`);

    const cmd = [
        `ffmpeg -y -i "${quotePath(ctx.paths.visualsMp4)}" -i "${quotePath(voiceTrackPath)}" -i "${quotePath(sfxPath)}"`,
        `-filter_complex "${chain.join(";")}"`,
        `-map 0:v -map "[aout]"`,
        `-c:v copy -c:a aac -shortest`,
        `"${quotePath(ctx.paths.finalMp4)}"`
    ].join(" ");
    ctx.ffmpeg.exec(cmd);
}

export async function addAudioStep(ctx) {
    if (ctx.fs.exists(ctx.paths.finalMp4)) return ctx;

    const voiceTrackPath = buildVoiceWithInsertGaps(ctx);
    const sfxPath = String(ctx.config.video?.surpriseSfxPath || "");
    const sfxExists = sfxPath && fs.existsSync(sfxPath) && hasAudioStream(sfxPath);
    const sfxTrimSec = Math.max(0.15, Number(ctx.config.video?.surpriseSfxTrimSec ?? 0.95));
    const sfxVolume = Math.max(0, Number(ctx.config.video?.surpriseSfxVolume ?? 0.9));
    const surpriseStarts = (ctx.plan?.scenes || [])
        .filter((scene) => {
            const visual = ctx.sceneVisuals?.[scene.scene_id];
            return visual?.type === "image" && String(visual?.animationStyle || "") === "surprise_animation";
        })
        .map((scene) => Math.max(0, Number(scene.start_sec || 0)));

    if (!sfxExists || surpriseStarts.length === 0) {
        mergeWithVoiceTrack(ctx, voiceTrackPath);
        return ctx;
    }

    try {
        mixSurpriseSfx(ctx, voiceTrackPath, sfxPath, surpriseStarts, sfxTrimSec, sfxVolume);
    } catch {
        mergeWithVoiceTrack(ctx, voiceTrackPath);
    }

    return ctx;
}
