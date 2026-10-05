import { assertStyleAssets } from './style-assets.service.mjs';
import path from 'node:path';
import { imageMotionTiming } from './image-motion-timing.mjs';
import { fileURLToPath } from 'node:url';
import { resolveVideoEncoderArgs } from '../utils/video-encoder.mjs';

export const HISTORICAL_CYCLE_SEC = 151 / 30;
export const HISTORICAL_ASSETS = fileURLToPath(new URL('../../assets/historical/', import.meta.url));

const quote = value => `'${String(value).replace(/'/g, `'\\''`)}'`;
const even = value => Math.max(2, Math.round(value / 2) * 2);

export function historicalMotionCommand(video, { img, clip, durationSec }) {
    assertStyleAssets('historical');
    const width = even(video.width);
    const height = even(video.height);
    const fps = Number(video.fps);
    if (!Number.isFinite(durationSec) || durationSec <= 0 || !Number.isFinite(fps) || fps <= 0) {
        throw new Error('Invalid historical render duration or frame rate');
    }

    const timing=imageMotionTiming(durationSec,fps,HISTORICAL_CYCLE_SEC);
    const {frames}=timing;
    // Rotate at double resolution so thin diagonal edges do not crawl between pixels.
    const photoWidth = even(width * .81) * 2;
    const photoHeight = even(height * .81) * 2;
    const rotatedWidth = even(photoWidth * 1.16);
    const rotatedHeight = even(photoHeight * 1.28);
    const revealSec = 70 / 30;
    const phase = `min(1,${timing.sourceTime}/${revealSec})`;
    const eased = `((${phase})*(${phase})*(3-2*(${phase})))`;
    const centerX = `${width * 1.4197916984558105}+(${width * .5}-${width * 1.4197916984558105})*${eased}`;
    const rotation = `(-5+7*min(1,${timing.sourceTime}/15.7666667))*PI/180`;
    const assets = name => quote(path.join(HISTORICAL_ASSETS, name));
    const inputs = [
        `-i ${quote(img)}`,
        `-i ${assets('Paper.jpg')}`,
        `-i ${assets('grunge1.jpg')}`,
        `-i ${assets('OTF_Crumpled_Paper_10.jpg')}`,
        `-i ${assets('old frame_00000.png')}`,
        `-i ${assets('Particles_RENDER.mov')}`,
        `-i ${assets('damage.mp4')}`,
        `-i ${assets('LLEAK.mov')}`,
        `-i ${assets('Main_Matte.mp4')}`
    ];

    const filter = [
        `[0:v]split=2[backgroundSource][photoSource]`,
        `[backgroundSource]scale=${width}:${height}:force_original_aspect_ratio=increase:flags=lanczos,crop=${width}:${height},colorchannelmixer=rr=.393:rg=.769:rb=.189:gr=.349:gg=.686:gb=.168:br=.272:bg=.534:bb=.131,gblur=sigma=${Math.max(8, width * .016)},eq=brightness=-.24:contrast=.82[background]`,
        `[1:v]scale=${width}:${height}:force_original_aspect_ratio=increase:flags=lanczos,crop=${width}:${height},hue=s=.3,eq=brightness=-.04[paper]`,
        `[2:v]scale=${width}:${height}:force_original_aspect_ratio=increase:flags=lanczos,crop=${width}:${height},hue=s=0,format=rgba,colorchannelmixer=aa=.50[grunge]`,
        `[3:v]scale=${width}:${height}:force_original_aspect_ratio=increase:flags=lanczos,crop=${width}:${height},hue=s=0,format=rgba,colorchannelmixer=aa=.50[crumple]`,
        `[background][paper]blend=all_mode=softlight:all_opacity=.82[paperBase]`,
        `[paperBase][grunge]blend=all_mode=softlight:all_opacity=.50[textured]`,
        `[textured][crumple]blend=all_mode=softlight:all_opacity=.50,loop=loop=${frames-1}:size=1:start=0,settb=expr=1/${fps},setpts=N[backdrop]`,
        `[photoSource]scale=${photoWidth}:${photoHeight}:force_original_aspect_ratio=increase:flags=lanczos,crop=${photoWidth}:${photoHeight},colorchannelmixer=rr=.393:rg=.769:rb=.189:gr=.349:gg=.686:gb=.168:br=.272:bg=.534:bb=.131,eq=contrast=1.03:brightness=-.08[photo]`,
        `[4:v]scale=${photoWidth}:${photoHeight}:flags=lanczos,format=rgba[oldFrame]`,
        `[photo][oldFrame]overlay=0:0:format=auto,loop=loop=${frames-1}:size=1:start=0,settb=expr=1/${fps},setpts=N[framed]`,
        `[framed]format=rgba,rotate=angle='${rotation}':ow=${rotatedWidth}:oh=${rotatedHeight}:c=none:bilinear=1,scale=${rotatedWidth / 2}:${rotatedHeight / 2}:flags=area,format=rgba[tilted]`,
        `color=c=black@0:s=${width}x${height}:r=${fps}:d=${timing.duration},format=rgba[clear]`,
        `[clear][tilted]overlay=x='${centerX}-w/2':y='(H-h)/2':eval=frame:shortest=1[movingPhoto]`,
        `[8:v]${timing.footage},scale=${width}:${height}:flags=lanczos,format=gray,negate[inkMatte]`,
        `[movingPhoto][inkMatte]alphamerge[revealedPhoto]`,
        `[backdrop][revealedPhoto]overlay=0:0:format=auto[composition]`,
        `[5:v]${timing.footage},scale=${width}:${height}:flags=lanczos,format=gbrp[particles]`,
        `[6:v]${timing.footage},scale=${width}:${height}:flags=lanczos,format=gbrp[damage]`,
        `[7:v]${timing.footage},scale=${width}:${height}:flags=lanczos,format=gbrp[leak]`,
        `[composition]format=gbrp[base]`,
        `[base][particles]blend=all_mode=screen:shortest=1[dust]`,
        `[dust][damage]blend=all_mode=screen:all_opacity=.20:shortest=1[aged]`,
        `[aged][leak]blend=all_mode=screen:shortest=1[lit]`,
        `[lit]format=yuv444p,colorbalance=rs=.08:bs=-.10,eq=contrast=.92:brightness=-.03,fade=t=in:st=0:d=${1.76*timing.scale}:color=0x756657,format=yuv420p,trim=end_frame=${frames},setpts=N/${fps}/TB[vout]`
    ];

    return `ffmpeg -hide_banner -loglevel error -y -filter_complex_threads 1 ${inputs.join(' ')} -filter_complex ${quote(filter.join(';'))} -map '[vout]' -r ${fps} -frames:v ${frames} -an ${resolveVideoEncoderArgs(video)} -movflags +faststart ${quote(clip)}`;
}
