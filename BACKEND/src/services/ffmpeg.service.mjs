import child_process from "child_process";
import fs from "fs";

export function exec(cmd) {
    child_process.execSync(cmd, { stdio: "inherit" });
}

export function getAudioDurationSeconds(audioFile) {
    const cmd = `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${audioFile}"`;
    const out = child_process.execSync(cmd).toString().trim();
    return Number(out);
}

export function getVideoDurationSeconds(videoFile) {
    const cmd = `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${videoFile}"`;
    const out = child_process.execSync(cmd).toString().trim();
    return Number(out);
}

export function writeConcatFile(videoFiles, concatPath) {
    const lines = videoFiles.map((vf) => `file '${vf.replace(/'/g, "'\\''")}'`).join("\n");
    fs.writeFileSync(concatPath, lines + "\n");
}

export function escapeSubtitlesPathForFfmpeg(p) {
    return p.replace(/\\/g, "/").replace(/:/g, "\\:");
}
