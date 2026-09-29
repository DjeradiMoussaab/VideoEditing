import path from 'node:path';
import { imageMotionTiming } from './image-motion-timing.mjs';
import {fileURLToPath} from 'node:url';
import {resolveVideoEncoderArgs} from '../utils/video-encoder.mjs';

export const HISTORY_SLIDESHOW_CYCLE_SEC = 6.5;
const ASSETS = fileURLToPath(new URL('../../assets/history-slideshow/', import.meta.url));
const quote = value => `'${String(value).replace(/'/g, `'\\''`)}'`;
const even = value => Math.max(2, Math.round(value / 2) * 2);

export function historySlideshowMotionCommand(video, {img, clip, durationSec}) {
    const w = even(video.width), h = even(video.height), fps = Number(video.fps);
    if (![w, h, fps, durationSec].every(Number.isFinite) || fps <= 0 || durationSec <= 0) {
        throw new Error('Invalid history slideshow dimensions, duration or frame rate');
    }
    const timing=imageMotionTiming(durationSec,fps,HISTORY_SLIDESHOW_CYCLE_SEC);
    const {frames}=timing;
    const sw = w * 2, sh = h * 2;
    const files = ['background.png', 'photo-mask.png', 'clouds-front.png', 'clouds-back.png', 'noise.mp4', 'particles.mp4', 'light-leak.mp4'];
    const inputs = [`-i ${quote(img)}`, ...files.map(file => `-i ${quote(path.join(ASSETS, file))}`)];
    const t = timing.sourceFrameTime;
    // Rapid camera retreat at the opening, followed by the slow settled pullback.
    const zoom = `1.04+1.65*pow(max(0,1-${t}/2.2),3)+.06*(1-min(1,${t}/6.5))`;
    const filters = [
        `[0:v]scale=${sw}:${sh}:force_original_aspect_ratio=increase:flags=lanczos,crop=${sw}:${sh},setsar=1,hue=s=0,eq=contrast=.94:brightness=.025,format=rgb24[photo]`,
        `[2:v]scale=${sw}:${sh}:flags=lanczos,format=gray[mask]`,
        `[photo][mask]alphamerge[cutPhoto]`,
        `[1:v]scale=${sw}:${sh}:flags=lanczos,format=rgba[paper]`,
        `[paper][cutPhoto]overlay=0:0:format=auto,format=yuv444p[plate]`,
        `[plate]zoompan=z='${zoom}':x='(iw-iw/zoom)/2':y='(ih-ih/zoom)/2':d=${frames}:fps=${fps}:s=${w}x${h},setsar=1[drift]`,
        `[3:v]scale=${w}:${h}:flags=lanczos,format=rgba[cloudFront]`,
        `[4:v]scale=${w}:${h}:flags=lanczos,format=rgba[cloudBack]`,
        `[drift][cloudBack]overlay=x='${w}*.012*sin(${timing.sourceTime}*.6)':y='${h}*.015*sin(${timing.sourceTime}*.5)':eval=frame:format=auto[backCloud]`,
        `[backCloud][cloudFront]overlay=x='-${w}*.02*sin(${timing.sourceTime}*.65)':y='${h}*.02*sin(${timing.sourceTime}*.4)':eval=frame:format=auto,format=gbrp[clouded]`
    ];
    for (const [index, name] of [[5, 'noise'], [6, 'particles'], [7, 'leak']]) {
        filters.push(`[${index}:v]${timing.footage},scale=${w}:${h}:flags=lanczos,format=gbrp[${name}]`);
    }
    filters.push(
        '[clouded][noise]blend=all_mode=softlight:all_opacity=.08:shortest=1[grain]',
        '[grain][particles]blend=all_mode=screen:all_opacity=.15:shortest=1[dust]',
        '[dust][leak]blend=all_mode=screen:all_opacity=.08:shortest=1[lit]',
        `[lit]hue=s=0,format=yuv420p,fade=t=in:st=0:d=${.4*timing.scale}:color=0xeeeeee,fade=t=out:st=${6*timing.scale}:d=${.5*timing.scale}:color=0xeeeeee,trim=end_frame=${frames},settb=expr=1/${fps},setpts=N[vout]`
    );
    return `ffmpeg -hide_banner -loglevel error -y -filter_complex_threads 1 ${inputs.join(' ')} -filter_complex ${quote(filters.join(';'))} -map '[vout]' -r ${fps} -frames:v ${frames} -an ${resolveVideoEncoderArgs(video)} -movflags +faststart ${quote(clip)}`;
}
