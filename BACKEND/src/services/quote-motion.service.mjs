import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { resolveVideoEncoderArgs } from '../utils/video-encoder.mjs';

export const QUOTE_MOTION_VERSION = 4;
const shell = value => `'${String(value).replace(/'/g, `'\\''`)}'`;
const filterPath = value => String(value).replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, "'\\''");

const font = (filename, fallback) => {
    const local = `/System/Library/Fonts/Supplemental/${filename}.ttf`;
    return fs.existsSync(local) ? `fontfile='${filterPath(local)}'` : `font='${fallback}'`;
};

export function quoteLayout(text, author, width, height) {
    const words = String(text || '').trim().split(/\s+/).filter(Boolean);
    const lines = [];
    let line = '';
    for (const word of words.flatMap(word => word.match(/.{1,40}/gu) || [])) {
        if (line && `${line} ${word}`.length > 40) { lines.push(line); line = ''; }
        line = line ? `${line} ${word}` : word;
    }
    if (line) lines.push(line);
    const fontSize = Math.max(1, Math.min(height * .052, width * .72 / (Math.max(1, ...lines.map(line => line.length)) * .64), height * .43 / Math.max(1, lines.length * 1.3)));
    const textHeight = Math.max(1, lines.length) * fontSize * 1.3;
    return { text: lines.join('\n'), author: String(author || '').trim(), fontSize, textHeight, top: (height - textHeight) / 2, showDivider: !!(words.length && String(author || '').trim()) };
}

export function makeQuoteClipCommand(ctx, video, { inputVideo, clip, durationSec, quoteText = '', quoteAuthor = '' }) {
    const w = video.width, h = video.height, fps = video.fps;
    const blurScale = Math.min(1, 1280 / w);
    const bw = Math.ceil(w * blurScale * 1.24 / 2) * 2, bh = Math.ceil(h * blurScale * 1.24 / 2) * 2;
    const layout = quoteLayout(quoteText, quoteAuthor, w, h);
    fs.mkdirSync(ctx.paths.clipCacheDir, { recursive: true });
    const textFile = text => {
        const file = path.join(ctx.paths.clipCacheDir, `quote_${crypto.createHash('sha1').update(text || ' ').digest('hex')}.txt`);
        fs.writeFileSync(file, text || ' ');
        return filterPath(file);
    };
    const timing = Math.min(1, durationSec / 3);
    const ease = delay => `pow(1-min(1,max(0,(t-${delay * timing})/${.65 * timing})),3)`;
    const alpha = delay => `1-(${ease(delay)})`;
    const blue = '0x399ee8';
    const authorY = layout.top + layout.textHeight + h * .07;
    const filters = [
        // Match the CSS preview: overscanned photograph, Gaussian diffusion,
        // 35% image over #182b40. Keep the blur and color blend at 16-bit precision.
        `scale=${bw}:${bh}:force_original_aspect_ratio=increase:flags=lanczos,crop=${bw}:${bh},setsar=1,fps=${fps},hue=s=.25,format=gbrp16le,gblur=sigma=${w * blurScale * .031}:steps=6`,
        `lutrgb=r='val*.35+maxval*${24 / 255 * .65}':g='val*.35+maxval*${43 / 255 * .65}':b='val*.35+maxval*${64 / 255 * .65}',scale=${bw}:${bh}:flags=lanczos:sws_dither=ed,format=yuv444p`,
        `zoompan=z='1.24+.0744*(.5-.5*cos(PI*min(on/${fps * 14},1)))':x='(iw-iw/zoom)/2':y='(ih-ih/zoom)/2':d=1:fps=${fps}:s=${w}x${h},setsar=1,vignette=PI/7`,
        // Very fine, stationary dither protects soft gradients through H.264 encoding.
        'noise=alls=1:allf=u',
        `drawtext=text='“':${font('Georgia Bold', 'DejaVu Serif')}:fontsize=${h * .24}:fontcolor=${blue}:alpha='${alpha(0)}':x=${w * .17}:y='${layout.top - h * .17}+${h * .025}*(${ease(0)})'`,
        `drawtext=textfile='${textFile(layout.text)}':expansion=none:${font('Arial Bold', 'DejaVu Sans')}:fontsize=${layout.fontSize}:fontcolor=white:line_spacing=${layout.fontSize * .3}:text_align=center:x=(w-text_w)/2:y='${layout.top}+${h * .025}*(${ease(.12)})':alpha='${alpha(.12)}':shadowcolor=black@0.2:shadowy=2`
    ];
    if (layout.showDivider) {
        filters.push(`drawbox=x=${w * .23}:y=${authorY - h * .038}:w=${w * .54}:h=${Math.max(2, h * .003)}:color=${blue}@0.85:t=fill:enable='gte(t,${.5 * timing})'`);
    }
    if (layout.author) filters.push(`drawtext=textfile='${textFile(layout.author)}':expansion=none:${font('Arial Italic', 'DejaVu Sans')}:fontsize=${Math.min(h * .028, w * .64 / (Math.max(1, layout.author.length) * .65))}:fontcolor=0xdce7f1:x=(w-text_w)/2:y='${authorY}+${h * .018}*(${ease(.65)})':alpha='${alpha(.65)}'`);
    filters.push('format=yuv420p');
    const input = inputVideo && fs.existsSync(inputVideo)
        ? `${/\.(png|jpe?g|webp|gif|avif|bmp)$/i.test(inputVideo) ? `-loop 1 -framerate ${fps}` : '-stream_loop -1'} -i ${shell(inputVideo)}`
        : `-f lavfi -i ${shell(`color=c=0x182b40:s=${w}x${h}:r=${fps}`)}`;
    return `ffmpeg -hide_banner -loglevel error -y -filter_threads 1 ${input} -t ${durationSec} -vf ${shell(filters.join(','))} -an ${resolveVideoEncoderArgs(video)} ${video.codec === "h264_videotoolbox" ? "" : "-crf 18"} -movflags +faststart ${shell(clip)}`;
}
