import fs from "fs";
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

function mergeVoiceOnly(ctx) {
    ctx.ffmpeg.exec(
        `ffmpeg -y -i "${quotePath(ctx.paths.visualsMp4)}" -i "${quotePath(ctx.paths.voiceMp3)}" -c:v copy -c:a aac -shortest "${quotePath(ctx.paths.finalMp4)}"`
    );
}

export async function addAudioStep(ctx) {
    if (ctx.fs.exists(ctx.paths.finalMp4)) return ctx;

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
        mergeVoiceOnly(ctx);
        return ctx;
    }

    const chain = [];
    chain.push(`[1:a]aresample=44100,asetpts=PTS-STARTPTS[voice]`);
    chain.push(`[2:a]atrim=0:${sfxTrimSec},asetpts=PTS-STARTPTS,volume=${sfxVolume}[sfxbase]`);
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
        `ffmpeg -y -i "${quotePath(ctx.paths.visualsMp4)}" -i "${quotePath(ctx.paths.voiceMp3)}" -i "${quotePath(sfxPath)}"`,
        `-filter_complex "${chain.join(";")}"`,
        `-map 0:v -map "[aout]"`,
        `-c:v copy -c:a aac -shortest`,
        `"${quotePath(ctx.paths.finalMp4)}"`
    ].join(" ");
    try {
        ctx.ffmpeg.exec(cmd);
    } catch {
        // Keep final render resilient: if SFX mixing fails, still produce the final video with voiceover.
        mergeVoiceOnly(ctx);
    }

    return ctx;
}
