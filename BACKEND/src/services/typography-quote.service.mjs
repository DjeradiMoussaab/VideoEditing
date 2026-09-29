import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {quoteComposition} from '../../../SHARED/quote-styles.mjs';
import {resolveVideoEncoderArgs} from '../utils/video-encoder.mjs';

const assets=fileURLToPath(new URL('../../assets/typography-titles/',import.meta.url));
const shell=value=>`'${String(value).replace(/'/g, `'\\''`)}'`;
const escapePath=value=>String(value).replace(/\\/g,'\\\\').replace(/:/g,'\\:').replace(/'/g,"'\\''");

export function typographyQuoteCommand(ctx,video,{clip,durationSec,quoteStyleId,quoteText='',quoteFields={},inputVideo=null,mediaOffsetSec=0}){
  const design=quoteComposition(quoteStyleId,{text:quoteText,...quoteFields});
  const split=quoteStyleId==='typography_split',w=video.width,h=video.height,fps=video.fps,sx=w/1920,sy=h/1080;
  fs.mkdirSync(ctx.paths.clipCacheDir,{recursive:true});
  const source=inputVideo&&fs.existsSync(inputVideo)?inputVideo:path.join(assets,`background-${split?2:1}.jpg`);
  const input=/\.(mov|mp4|mkv|webm|m4v|avi)$/i.test(source)?`-stream_loop -1 -ss ${Math.max(0,Number(mediaOffsetSec)||0)} -i ${shell(source)}`:`-loop 1 -i ${shell(source)}`;
  const pane=split?Math.round(w*.434/2)*2:w;
  const filters=[`fps=${fps}`,`scale=${pane}:${h}:force_original_aspect_ratio=increase`,`crop=${pane}:${h}`,'setsar=1'];
  if(split)filters.push('hue=s=0','eq=brightness=-0.04:contrast=1.05');
  else filters.push(`gblur=sigma=${12*sy}:steps=3`,'hue=s=0','eq=brightness=-0.06',`drawbox=x=0:y=0:w=iw:h=ih:color=black@0.25:t=fill`);
  filters.push(`scale=${pane*2}:${h*2}`,`zoompan=z='1+0.006*(1-cos(2*PI*on/${fps}/8))/2':x='(iw-iw/zoom)/2':y='(ih-ih/zoom)/2':d=1:fps=${fps}:s=${pane}x${h}`);
  if(split)filters.push(`pad=${w}:${h}:${w-pane}:0:color=0x080808`);
  const end=Math.max(0,...design.blocks.map(b=>b.delay+.4));
  const timing=Math.min(1,durationSec*.65/Math.max(.1,end));
  for(const shape of design.shapes)filters.push(`drawbox=x=${shape.x*sx}:y=${shape.y*sy}:w=${shape.w*sx}:h=${shape.h*sy}:color=${shape.color.replace('#','0x')}:t=fill:enable='gte(t,${shape.delay*timing})'`);
  const font=escapePath(path.join(assets,'Montserrat-Black.ttf'));
  for(const block of design.blocks){
    const file=path.join(ctx.paths.clipCacheDir,`typography_${crypto.createHash('sha256').update(block.lines[0]).digest('hex')}.txt`);
    fs.writeFileSync(file,block.lines[0]);
    const delay=block.delay*timing,highlight=(block.delay+.2)*timing;
    const entrance=`min(1,max(0,(t-${delay})/${Math.max(.03,.08*timing)}))`;
    const base=`drawtext=fontfile='${font}':textfile='${escapePath(file)}':expansion=none:fontsize=${block.fontSize*sy}:x=${block.x*sx}:y='${(block.y+block.fontSize*.82)*sy}-ascent+${8*sy}*(1-${entrance})':alpha='${entrance}'`;
    filters.push(`${base}:fontcolor=${block.initialColor.replace('#','0x')}${block.highlight?`:enable='lt(t,${highlight})'`:''}`);
    if(block.highlight)filters.push(`${base}:fontcolor=black:enable='gte(t,${highlight})'`);
  }
  filters.push('format=yuv420p');
  return `ffmpeg -hide_banner -loglevel error -y -filter_threads 1 ${input} -vf ${shell(filters.join(','))} -frames:v ${Math.max(1,Math.round(durationSec*fps))} -an ${resolveVideoEncoderArgs(video)} -movflags +faststart ${shell(clip)}`;
}
