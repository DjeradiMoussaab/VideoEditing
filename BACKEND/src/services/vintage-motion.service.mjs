import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveVideoEncoderArgs } from '../utils/video-encoder.mjs';

export const VINTAGE_CYCLE_SEC = 386 / 60;
export const VINTAGE_ASSETS = fileURLToPath(new URL('../../assets/vintage/', import.meta.url));
const keys = JSON.parse(fs.readFileSync(path.join(VINTAGE_ASSETS, 'motion.json'), 'utf8'));
const quote = value => `'${String(value).replace(/'/g, `'\\''`)}'`;
const even = value => Math.max(2, Math.round(value / 2) * 2);

// Spatial Bezier handles are copied from the original Premiere anchor-point path.
function motionExpression(axis, time) {
    let expression = String(keys.at(-1)[axis]);
    for (let i = keys.length - 2; i >= 0; i--) {
        const a = keys[i], b = keys[i + 1];
        const u = `((${time}-${a.time})/${b.time-a.time})`;
        const handle = axis === 'x' ? 'X' : 'Y';
        const p0=a[axis],p1=p0+a[`out${handle}`],p3=b[axis],p2=p3+b[`in${handle}`];
        const curve=`(pow(1-${u},3)*${p0}+3*pow(1-${u},2)*${u}*${p1}+3*(1-${u})*pow(${u},2)*${p2}+pow(${u},3)*${p3})`;
        expression=`if(lt(${time},${b.time}),${curve},${expression})`;
    }
    return expression;
}

export function vintageMotionCommand(video, { img, clip, durationSec }) {
    const w=even(video.width),h=even(video.height),fps=Number(video.fps);
    if (!Number.isFinite(durationSec) || durationSec <= 0 || !Number.isFinite(fps) || fps <= 0) throw new Error('Invalid vintage render duration or frame rate');
    const frames=Math.max(1,Math.round(durationSec*fps));
    const files=['background.png','decorations.png','photo-mask.png','surface.png','Particles.mp4','Noise Scratch.mp4','Light Leak.mp4'];
    const inputs=[`-i ${quote(img)}`, ...files.map(name => `-i ${quote(path.join(VINTAGE_ASSETS,name))}`)];
    const phase=`mod(on/${fps},${VINTAGE_CYCLE_SEC})`;
    const x=`190+(${motionExpression('x',phase)}-.5)*2300`;
    const y=`107+(${motionExpression('y',phase)}-.5)*1294`;
    const f=[
        '[0:v]split=2[ghostSource][photoSource]',
        '[ghostSource]scale=2300:1294:force_original_aspect_ratio=increase,crop=2300:1294,format=rgba,colorchannelmixer=aa=.16[ghost]',
        '[1:v]format=rgba[paper]',
        '[paper][ghost]overlay=0:0:format=auto[ghosted]',
        '[ghosted][2:v]overlay=0:0:format=auto[decorated]',
        '[photoSource]scale=1344:756:force_original_aspect_ratio=increase:flags=lanczos,crop=1344:756,setsar=1,format=rgb24[photo]',
        '[3:v]format=gray[mask]',
        '[photo][mask]alphamerge[cutPhoto]',
        '[decorated][cutPhoto]overlay=478:269:format=auto[framed]',
        '[framed][4:v]overlay=0:0:format=auto,format=yuv444p[plate]',
        `[plate]zoompan=z='2300/1920':x='${x}':y='${y}':d=${frames}:fps=${fps}:s=${w}x${h},setsar=1,format=gbrp[drifting]`
    ];
    for (const [index,name] of [[5,'particles'],[6,'scratches'],[7,'leaks']]) {
        f.push(`[${index}:v]trim=end_frame=193,setpts=PTS-STARTPTS,loop=loop=-1:size=193:start=0,setpts=N/30/TB,fps=${fps},scale=${w}:${h}:flags=lanczos,format=gbrp[${name}]`);
    }
    f.push('[drifting][particles]blend=all_mode=screen:shortest=1[dust]');
    f.push('[dust][scratches]blend=all_mode=screen:shortest=1[film]');
    f.push('[film][leaks]blend=all_mode=screen:shortest=1[lit]');
    // Preserve the reference's opening fade on every repetition, rather than
    // inventing a dissolve which would change its timing and light-leak sequence.
    f.push(`[lit]format=yuv444p,eq=brightness='-.42*max(0,1-mod(t,${VINTAGE_CYCLE_SEC})/.45)':eval=frame,format=yuv420p[vout]`);
    return `ffmpeg -hide_banner -loglevel error -y -filter_complex_threads 1 ${inputs.join(' ')} -filter_complex ${quote(f.join(';'))} -map '[vout]' -an -frames:v ${frames} -t ${durationSec} ${resolveVideoEncoderArgs(video)} -movflags +faststart ${quote(clip)}`;
}
