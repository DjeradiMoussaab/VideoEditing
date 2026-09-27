import { quoteComposition } from "../../../SHARED/quote-styles.mjs";
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { resolveVideoEncoderArgs } from '../utils/video-encoder.mjs';

export const QUOTE_MOTION_VERSION = 6;
const shell = value => `'${String(value).replace(/'/g, `'\\''`)}'`;
const filterPath = value => String(value).replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, "'\\''");
const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.webm', '.m4v', '.mkv', '.avi']);
const isVideoFile = value => VIDEO_EXTENSIONS.has(path.extname(String(value || '')).toLowerCase());

// One filename per font key; single-weight system fonts (condensed/alternate/impact/engraved)
// reuse the same file for bold and regular. `fallback` is a fontconfig name for non-macOS hosts.
const FONT_FILES = {
    serif: { regular: 'Georgia', bold: 'Georgia Bold', fallback: 'DejaVu Serif' },
    sans: { regular: 'Arial', bold: 'Arial Bold', fallback: 'DejaVu Sans' },
    condensed: { regular: 'DIN Condensed Bold', bold: 'DIN Condensed Bold', fallback: 'Arial Narrow Bold' },
    alternate: { regular: 'DIN Alternate Bold', bold: 'DIN Alternate Bold', fallback: 'DejaVu Sans Bold' },
    mono: { regular: 'Courier New', bold: 'Courier New Bold', fallback: 'DejaVu Sans Mono' },
    impact: { regular: 'Impact', bold: 'Impact', fallback: 'Arial Black' },
    newsprint: { regular: 'Times New Roman', bold: 'Times New Roman Bold', fallback: 'DejaVu Serif' },
    engraved: { regular: 'Arial Black', bold: 'Arial Black', fallback: 'DejaVu Sans Bold' }
};

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

export function makeQuoteClipCommand(ctx, video, { clip, durationSec, quoteText = '', quoteAuthor = '', quoteStyleId = 'classic', quoteFields = {}, inputVideo = null, mediaOffsetSec = 0 }) {
    const w=video.width,h=video.height,fps=video.fps,sx=w/1920,sy=h/1080;
    const design=quoteComposition(quoteStyleId,{text:quoteText,author:quoteAuthor,...quoteFields});
    fs.mkdirSync(ctx.paths.clipCacheDir,{recursive:true});
    const textFile=text=>{
        const file=path.join(ctx.paths.clipCacheDir,`quote_${crypto.createHash('sha1').update(text || ' ').digest('hex')}.txt`);
        fs.writeFileSync(file,text || ' ');
        return filterPath(file);
    };
    const hasBackground=Boolean(inputVideo) && fs.existsSync(inputVideo);
    const filters=[];
    if(hasBackground){
        // Downsample far below output size before blurring (cheap, still reads as a deep
        // defocus once upscaled), then tint with the style's scrim so text stays legible.
        const dsw=Math.max(16,Math.round(w/4)),dsh=Math.max(9,Math.round(h/4));
        filters.push(`scale=${dsw}:${dsh}:force_original_aspect_ratio=increase,crop=${dsw}:${dsh}`);
        filters.push('boxblur=24:6');
        filters.push(`scale=${w}:${h}:flags=bicubic`);
        filters.push(`drawbox=x=0:y=0:w=${w}:h=${h}:color=${design.scrim.replace('#','0x')}:t=fill`);
        filters.push('vignette=PI/5');
    }
    for(const shape of design.shapes) filters.push(`drawbox=x=${shape.x*sx}:y=${shape.y*sy}:w=${shape.w*sx}:h=${shape.h*sy}:color=${shape.color.replace('#','0x')}:t=${shape.stroke?Math.max(1,shape.stroke*sy):'fill'}`);
    for(const block of design.blocks){
        const meta=FONT_FILES[block.font]||FONT_FILES.sans;
        const fontSpec=font(block.bold?meta.bold:meta.regular,meta.fallback);
        const size=block.fontSize*sy;
        const delay=block.delay*Math.min(1,durationSec/3);
        const alpha=`min(1,max(0,(t-${delay})/0.3))`;
        for(const [i,line] of block.lines.entries()){
            if(!line.trim())continue;
            const x=block.align==='center'?`${(block.x+block.w/2)*sx}-text_w/2`:`${block.x*sx}`;
            filters.push(`drawtext=textfile='${textFile(line)}':expansion=none:${fontSpec}:fontsize=${size}:fontcolor=${block.color.replace('#','0x')}:x='${x}':y=${(block.y+i*block.lineHeight)*sy}:alpha='${alpha}'`);
        }
    }
    filters.push('format=yuv420p');
    const offset=Math.max(0,Number(mediaOffsetSec)||0);
    const inputArgs=!hasBackground
        ? `-f lavfi -i ${shell(`color=c=${design.bg.replace('#','0x')}:s=${w}x${h}:r=${fps}`)} -t ${durationSec}`
        : isVideoFile(inputVideo)
            ? `-stream_loop -1 -i ${shell(inputVideo)} -ss ${offset} -t ${durationSec}`
            : `-loop 1 -i ${shell(inputVideo)} -t ${durationSec}`;
    return `ffmpeg -hide_banner -loglevel error -y -filter_threads 1 ${inputArgs} -vf ${shell(filters.join(','))} -an ${resolveVideoEncoderArgs(video)} ${video.codec === 'h264_videotoolbox' ? '' : '-crf 18'} -movflags +faststart ${shell(clip)}`;
}
