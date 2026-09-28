import { vintageMotionCommand } from './vintage-motion.service.mjs';
import { historicalMotionCommand } from './historical-motion.service.mjs';
import { resolveVideoEncoderArgs } from '../utils/video-encoder.mjs';

export const IMAGE_MOTION_VERSION = 18;
const quote = value => `'${String(value).replace(/'/g, `'\\''`)}'`;
const even = value => Math.max(2, Math.round(value / 2) * 2);

// Compose once at double resolution. zoompan then samples this static plate at
// the output frame rate: blur, shadows and image decoding are not repeated 60x/s.
export function imageMotionCommand(video, profile, { img, clip, durationSec }) {
    if (profile.treatment === 'vintage') return vintageMotionCommand(video, { img, clip, durationSec });
    if (profile.treatment === 'historical') return historicalMotionCommand(video, { img, clip, durationSec });
    const w = even(video.width), h = even(video.height), fps = Number(video.fps);
    const frames = Math.max(2, Math.round(durationSec * fps));
    const sw = w * 2, sh = h * 2;
    const p = `min(1,on/${frames - 1})`;
    const smooth = `((${p})*(${p})*(3-2*(${p})))`;
    const entry = `pow(1-min(1,on/${Math.max(1, Math.round(Math.min(.65, durationSec * .22) * fps))}),3)`;
    const mode = profile.zoomMode || '';
    const fullscreen = mode.startsWith('fullscreen_');
    let zoom, x = '(iw-iw/zoom)/2', y = '(ih-ih/zoom)/2';
    const filters = [];
    if (fullscreen) {
        const start = Number(profile.motionZoomStart ?? 1);
        const end = Number(profile.motionZoomMax ?? 1.3);
        zoom = mode === 'fullscreen_breathe'
            ? `1+.12*pow(sin(PI*(${p})),2)`
            : `${start}+(${end}-${start})*${smooth}`;
        filters.push(`[0:v]scale=${sw}:${sh}:force_original_aspect_ratio=increase:flags=lanczos,crop=${sw}:${sh},setsar=1[plate]`);
    } else {
        const treatment = profile.treatment || 'midnight';
        const paper = treatment === 'paper';
        const layered = ['echo', 'stack', 'glass'].includes(treatment);
        const warm = treatment === 'warm';
        const deepBlur = treatment === 'echo' || treatment === 'stack';
        const scale = layered ? .66 : paper ? .72 : .77;
        const border = layered ? 0 : even(w * (paper ? .016 : .004));
        const offset = 0;
        const fgX = `(W-w)/2+${sw * offset}`;
        const fgY = `(H-h)/2`;
        const tint = paper ? '0xe4dbc9@0.91' : (warm || treatment === 'stack') ? '0x201b24@0.62' : '0x07121e@0.68';
        filters.push(`[0:v]split=${layered ? '3[bgs][fgs][layers]' : '2[bgs][fgs]'}`);
        filters.push(`[bgs]scale=480:270:force_original_aspect_ratio=increase,crop=480:270,boxblur=${deepBlur ? 30 : 18}:2,scale=${sw}:${sh}:flags=bicubic,drawbox=c=${tint}:t=fill,vignette=PI/5[bg]`);
        let backdrop = 'bg';
        if (layered) {
            const glass = treatment === 'glass';
            // Strong defocus for the supporting prints, scaled to output resolution.
            const layerBlur = sh * (deepBlur ? .075 : .035);
            const bleed = even(layerBlur * 3);
            const feather = `geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='255*min(1,min(min(X,W-1-X),min(Y,H-1-Y))/${sh * .06})'`;
            filters.push(`[layers]scale=${even(sw * (glass ? .74 : .66))}:${even(sh * (glass ? .74 : .66))}:force_original_aspect_ratio=decrease:flags=lanczos,setsar=1,format=rgba,${feather},pad=iw+${bleed * 2}:ih+${bleed * 2}:${bleed}:${bleed}:color=black@0,gblur=sigma=${layerBlur}[layer]`);
            if (glass) {
                filters.push('[bg][layer]overlay=(W-w)/2:(H-h)/2:format=auto[layered]');
            } else {
                filters.push('[layer]split=2[leftLayer][rightLayer]');
                filters.push(`[bg][leftLayer]overlay=(W-w)/2-${sw * .065}:(H-h)/2-${sh * .035}:format=auto[layerLeft]`);
                filters.push(`[layerLeft][rightLayer]overlay=(W-w)/2+${sw * .065}:(H-h)/2+${sh * .035}:format=auto[layered]`);
            }
            backdrop = 'layered';
        }
        // Fit the real aspect ratio; no black bars baked into the photograph.
        if (layered) {
            // A lightly feathered photograph over borderless, transparent blurred echoes.
            filters.push(`[fgs]scale=${even(sw * scale)}:${even(sh * scale)}:force_original_aspect_ratio=decrease:flags=lanczos,setsar=1,format=rgba,geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='255*min(1,min(min(X,W-1-X),min(Y,H-1-Y))/${sh * .012})'[photo]`);
            filters.push(`[${backdrop}][photo]overlay=x='${fgX}':y='${fgY}':format=auto,format=yuv444p[plate]`);
        } else {
            filters.push(`[fgs]scale=${even(sw * scale)}:${even(sh * scale)}:force_original_aspect_ratio=decrease:flags=lanczos,setsar=1,pad=iw+${border * 2}:ih+${border * 2}:${border}:${border}:color=${paper ? '0xf5efe4' : '0xefefed'},format=rgba,split=2[photo][shadowSrc]`);
            filters.push(`[shadowSrc]pad=iw+160:ih+160:80:80:color=black@0,colorchannelmixer=rr=0:gg=0:bb=0:aa=.50,gblur=sigma=22[shadow]`);
            filters.push(`[${backdrop}][shadow]overlay=x='${fgX}':y='${fgY}+${sh * .018}':format=auto[cast]`);
            filters.push(`[cast][photo]overlay=x='${fgX}':y='${fgY}':format=auto[framed]`);
            filters.push(`[framed]format=yuv444p[plate]`);
        }
        zoom = paper ? `1.085-.035*${smooth}+.025*${entry}` : `1.035+.045*${smooth}+.055*${entry}`;
        if (treatment === 'glass') {
            zoom = `1.035+.04*pow(sin(PI*(${p})),2)`;
        }
        if (treatment === 'stack') zoom = `1.12-.07*${smooth}+.025*${entry}`;
        if (treatment === 'float' || treatment === 'echo') {
            x = `(iw-iw/zoom)*(.35+.3*${smooth})`;
            y = `(ih-ih/zoom)*(.65-.3*${smooth})`;
        } else y = `(ih-ih/zoom)*(.5+.35*${entry})`;
    }
    filters.push(`[plate]zoompan=z='${zoom}':x='${x}':y='${y}':d=${frames}:fps=${fps}:s=${w}x${h},setsar=1,format=yuv420p[vout]`);
    return `ffmpeg -hide_banner -loglevel error -y -filter_complex_threads 1 -i ${quote(img)} -filter_complex ${quote(filters.join(';'))} -map '[vout]' -frames:v ${frames} -an ${resolveVideoEncoderArgs(video)} -movflags +faststart ${quote(clip)}`;
}
