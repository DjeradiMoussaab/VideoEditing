import { spawnSync } from 'node:child_process';

let hardwareAvailable;
export function supportsVideoToolbox() {
    if (hardwareAvailable === undefined) {
        const result = spawnSync('ffmpeg', [
            '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i',
            'color=c=black:s=64x64:r=1', '-frames:v', '1', '-an',
            '-c:v', 'h264_videotoolbox', '-pix_fmt', 'yuv420p', '-f', 'null', '-'
        ], { encoding: 'utf8', timeout: 10000 });
        hardwareAvailable = !result.error && result.status === 0;
        if (!hardwareAvailable) console.warn('Hardware video encoding unavailable; using libx264 software encoding.');
    }
    return hardwareAvailable;
}

export function resolveVideoEncoderArgs(videoConfig = {}) {
    const codec = String(videoConfig.codec || "libx264");
    const pixFmt = String(videoConfig.pixFmt || "yuv420p");

    if (codec === "h264_videotoolbox" && supportsVideoToolbox()) {
        const bitrate = String(videoConfig.hwBitrate || "10M");
        const maxrate = String(videoConfig.hwMaxrate || "12M");
        const bufsize = String(videoConfig.hwBufsize || "20M");
        return `-c:v h264_videotoolbox -b:v ${bitrate} -maxrate ${maxrate} -bufsize ${bufsize} -pix_fmt ${pixFmt}`;
    }

    const preset = String(videoConfig.encodePreset || "veryfast");
    return `-c:v libx264 -preset ${preset} -pix_fmt ${pixFmt}`;
}
