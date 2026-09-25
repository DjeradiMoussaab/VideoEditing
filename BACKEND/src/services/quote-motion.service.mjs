import { quoteComposition } from "../../../SHARED/quote-styles.mjs";
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { resolveVideoEncoderArgs } from '../utils/video-encoder.mjs';

export const QUOTE_MOTION_VERSION = 5;
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

export function makeQuoteClipCommand(ctx, video, { clip, durationSec, quoteText = '', quoteAuthor = '', quoteStyleId = 'classic', quoteFields = {} }) {
    const w=video.width,h=video.height,fps=video.fps,sx=w/1920,sy=h/1080;
    const design=quoteComposition(quoteStyleId,{text:quoteText,author:quoteAuthor,...quoteFields});
    fs.mkdirSync(ctx.paths.clipCacheDir,{recursive:true});
    const textFile=text=>{
        const file=path.join(ctx.paths.clipCacheDir,`quote_${crypto.createHash('sha1').update(text || ' ').digest('hex')}.txt`);
        fs.writeFileSync(file,text || ' ');
        return filterPath(file);
    };
    const filters=[];
    for(const shape of design.shapes) filters.push(`drawbox=x=${shape.x*sx}:y=${shape.y*sy}:w=${shape.w*sx}:h=${shape.h*sy}:color=${shape.color.replace('#','0x')}:t=${shape.stroke?Math.max(1,shape.stroke*sy):'fill'}`);
    for(const block of design.blocks){
        const family=block.serif?'Georgia':'Arial';
        const fontSpec=font(`${family}${block.bold?' Bold':''}`,block.serif?'DejaVu Serif':'DejaVu Sans');
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
    return `ffmpeg -hide_banner -loglevel error -y -filter_threads 1 -f lavfi -i ${shell(`color=c=${design.bg.replace('#','0x')}:s=${w}x${h}:r=${fps}`)} -t ${durationSec} -vf ${shell(filters.join(','))} -an ${resolveVideoEncoderArgs(video)} ${video.codec === 'h264_videotoolbox' ? '' : '-crf 18'} -movflags +faststart ${shell(clip)}`;
}
