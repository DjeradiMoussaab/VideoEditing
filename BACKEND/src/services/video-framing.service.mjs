// Preserve the complete source frame. Any space around it is filled with a
// blurred, cover-sized copy of the same frame. Native 16:9 fully covers it.
export const VIDEO_FRAMING_VERSION = 1;
export function videoFramingFilter(width, height, fps) {
    return `scale=iw*sar:ih,setsar=1,split=2[back][front];` +
        `[back]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},gblur=sigma=20[blurred];` +
        `[front]scale=${width}:${height}:force_original_aspect_ratio=decrease:force_divisible_by=2[sharp];` +
        `[blurred][sharp]overlay=(W-w)/2:(H-h)/2:shortest=1,setsar=1,fps=${fps},format=yuv420p`;
}
