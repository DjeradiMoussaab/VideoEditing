import { quoteComposition } from "../../../SHARED/quote-styles.mjs";
import { modernCleanQuoteCommand } from './modern-clean-quote.service.mjs';
import { typographyQuoteCommand } from './typography-quote.service.mjs';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { resolveVideoEncoderArgs } from '../utils/video-encoder.mjs';

export const QUOTE_MOTION_VERSION = 17;
const shell = value => `'${String(value).replace(/'/g, `'\\''`)}'`;
const filterPath = value => String(value).replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, "'\\''");
const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.webm', '.m4v', '.mkv', '.avi']);
const isVideoFile = value => VIDEO_EXTENSIONS.has(path.extname(String(value || '')).toLowerCase());

// Fonts used by Classic and Archive. `fallback` is a fontconfig name for non-macOS hosts.
const FONT_FILES = {
    serif: { regular: 'Georgia', bold: 'Georgia Bold', fallback: 'DejaVu Serif' },
    sans: { regular: 'Arial', bold: 'Arial Bold', fallback: 'DejaVu Sans' },
    mono: { regular: 'Courier New', bold: 'Courier New Bold', fallback: 'DejaVu Sans Mono' },
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
    if(['typography_focus','typography_split'].includes(quoteStyleId))return typographyQuoteCommand(ctx,video,{clip,durationSec,quoteText,quoteStyleId,quoteFields,inputVideo,mediaOffsetSec});
    if(quoteStyleId==='modern_clean') return modernCleanQuoteCommand(ctx,video,{clip,durationSec,quoteText,quoteFields,inputVideo,mediaOffsetSec});
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
        // Normalize to the output frame rate first so the zoom-in below (driven by output
        // frame count) and the final xfade concat both advance in lockstep, regardless of
        // the source image/video's native frame rate.
        filters.push(`fps=${fps}`);
        // A true gaussian (gblur) stays smooth at any strength, unlike boxblur which turns
        // blocky once pushed hard - that blockiness was the previous "low quality" look.
        // Downsampling to half-size before blurring keeps this cheap and softens edges
        // further; sigma is tuned for a moderate ~30-40% defocus (shapes and color still
        // read through) rather than reducing the background to a flat color blob.
        const dsw=Math.max(64,Math.round(w/2)),dsh=Math.max(36,Math.round(h/2));
        filters.push(`scale=${dsw}:${dsh}:flags=lanczos:force_original_aspect_ratio=increase,crop=${dsw}:${dsh}`);
        filters.push(`gblur=sigma=${Math.max(4,Math.round(16*sy))}:steps=3`);
        filters.push(`scale=${w}:${h}:flags=lanczos`);
        filters.push('eq=saturation=0.85');
        filters.push(`drawbox=x=0:y=0:w=${w}:h=${h}:color=${design.scrim.replace('#','0x')}:t=fill`);
        filters.push('vignette=PI/5');
        // Same slow center zoom-in used by the default full-bleed image animation
        // (fullscreen_zoom_in, 1.0->1.3 eased over the clip), so a quote's backdrop keeps
        // moving instead of sitting frozen behind the text. Applied last so the crop
        // zooms into the fully composed (blurred/tinted/vignetted) plate, not the raw frame.
        const frames=Math.max(2,Math.round(durationSec*fps));
        const p=`min(1,on/${frames-1})`;
        const smooth=`((${p})*(${p})*(3-2*(${p})))`;
        filters.push(`zoompan=z='1+.3*${smooth}':x='(iw-iw/zoom)/2':y='(ih-ih/zoom)/2':d=1:s=${w}x${h}:fps=${fps}`);
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
    // Stock video backgrounds keep their native frame rate otherwise, which desyncs the
    // xfade concat timebase against the project's constant-fps clips (e.g. 23.976 vs 60).
    filters.push(`fps=${fps}`);
    filters.push('format=yuv420p');
    const offset=Math.max(0,Number(mediaOffsetSec)||0);
    const inputArgs=!hasBackground
        ? `-f lavfi -i ${shell(`color=c=${design.bg.replace('#','0x')}:s=${w}x${h}:r=${fps}`)} -t ${durationSec}`
        : isVideoFile(inputVideo)
            ? `-stream_loop -1 -i ${shell(inputVideo)} -ss ${offset} -t ${durationSec}`
            : `-loop 1 -i ${shell(inputVideo)} -t ${durationSec}`;
    return `ffmpeg -hide_banner -loglevel error -y -filter_threads 1 ${inputArgs} -vf ${shell(filters.join(','))} -an ${resolveVideoEncoderArgs(video)} ${video.codec === 'h264_videotoolbox' ? '' : '-crf 18'} -movflags +faststart ${shell(clip)}`;
}
