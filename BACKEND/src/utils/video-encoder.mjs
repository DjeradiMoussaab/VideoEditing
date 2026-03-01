export function resolveVideoEncoderArgs(videoConfig = {}) {
    const codec = String(videoConfig.codec || "libx264");
    const pixFmt = String(videoConfig.pixFmt || "yuv420p");

    if (codec === "h264_videotoolbox") {
        const bitrate = String(videoConfig.hwBitrate || "10M");
        const maxrate = String(videoConfig.hwMaxrate || "12M");
        const bufsize = String(videoConfig.hwBufsize || "20M");
        return `-c:v h264_videotoolbox -b:v ${bitrate} -maxrate ${maxrate} -bufsize ${bufsize} -pix_fmt ${pixFmt}`;
    }

    const preset = String(videoConfig.encodePreset || "veryfast");
    return `-c:v libx264 -preset ${preset} -pix_fmt ${pixFmt}`;
}

