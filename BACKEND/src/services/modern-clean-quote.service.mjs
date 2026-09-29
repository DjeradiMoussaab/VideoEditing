import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {quoteComposition} from '../../../SHARED/quote-styles.mjs';
import {resolveVideoEncoderArgs} from '../utils/video-encoder.mjs';

const assets=fileURLToPath(new URL('../../assets/modern-clean/',import.meta.url));
const shell=value=>`'${String(value).replace(/'/g, `'\\''`)}'`;
const filterPath=value=>String(value).replace(/\\/g,'\\\\').replace(/:/g,'\\:').replace(/'/g,"'\\''");

export function modernCleanQuoteCommand(ctx,video,{clip,durationSec,quoteFields={},quoteText='',inputVideo=null,mediaOffsetSec=0}) {
  const {width:w,height:h,fps}=video,sx=w/1920,sy=h/1080;
  const design=quoteComposition('modern_clean',{text:quoteText,...quoteFields});
  fs.mkdirSync(ctx.paths.clipCacheDir,{recursive:true});
  const background=inputVideo&&fs.existsSync(inputVideo)?inputVideo:path.join(assets,'background.jpg');
  const isVideo=/\.(mp4|mov|mkv|webm|m4v|avi)$/i.test(background);
  const input=isVideo?`-stream_loop -1 -ss ${Math.max(0,Number(mediaOffsetSec)||0)} -i ${shell(background)}`:`-loop 1 -i ${shell(background)}`;
  const filters=[`[0:v]fps=${fps},scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},setsar=1,gblur=sigma=${24*sy}:steps=3,eq=brightness=-0.08:saturation=0.65,drawbox=x=0:y=0:w=iw:h=ih:color=black@0.25:t=fill,format=yuv420p[bg]`];
  let last='bg';
  for(const [index,key] of ['text','text2'].entries()) {
    const block=design.blocks.find(b=>b.key===key);
    if(!block){filters.push(`[${index+1}:v]nullsink`);continue;}
    const color=block.bannerColor.replace('#','0x');
    const maskWidth=Math.max(2,Math.round(w*block.bannerWidth/(index===0?1004:682)));
    // Preserve the supplied alpha animation, including its original overshoot.
    filters.push(`[${index+1}:v]fps=${fps},scale=${Math.round(w*1.2)}:${Math.round(h*1.2)},crop=${w}:${h},scale=${maskWidth}:${h},pad=${Math.max(w,maskWidth)}:${h}:(ow-iw)/2:0:black,crop=${w}:${h},tpad=stop_mode=clone:stop_duration=${durationSec},format=gray[mask${index}]`);
    filters.push(`color=c=${color}:s=${w}x${h}:r=${fps},format=rgb24[fill${index}]`);
    filters.push(`[fill${index}][mask${index}]alphamerge[banner${index}]`);
    filters.push(`[${last}][banner${index}]overlay=0:0:format=auto[bar${index}]`);
    const font=filterPath(path.join(assets,`Montserrat-${block.bold?'ExtraBold':'Medium'}.ttf`));
    const draws=block.lines.filter(line=>line.trim()).map((line,i)=>{
      const file=path.join(ctx.paths.clipCacheDir,`modern_${crypto.createHash('sha256').update(line).digest('hex')}.txt`);
      fs.writeFileSync(file,line);
      const enter=`min(1,max(0,(t-${block.delay})/0.18))`;
      return `drawtext=fontfile='${font}':textfile='${filterPath(file)}':expansion=none:fontsize=${block.fontSize*sy}:fontcolor=${block.color.replace('#','0x')}:x='${w/2}-text_w/2':y='${(block.y+(i+.5)*block.lineHeight)*sy}-text_h/2+${10*sy}*(1-${enter})':alpha='${enter}'`;
    });
    filters.push(`[bar${index}]${draws.join(',')}[text${index}]`);last=`text${index}`;
  }
  // One entrance only. A smooth six-second breathing cycle continues indefinitely.
  const hold=`max(0,on/${fps}-2)`;
  filters.push(`[${last}]scale=${w*2}:${h*2},zoompan=z='1+0.006*(1-cos(2*PI*${hold}/6))/2':x='(iw-iw/zoom)/2':y='(ih-ih/zoom)/2':d=1:fps=${fps}:s=${w}x${h},format=yuv420p[vout]`);
  return `ffmpeg -hide_banner -loglevel error -y -filter_complex_threads 1 ${input} -i ${shell(path.join(assets,'banner-main.mkv'))} -i ${shell(path.join(assets,'banner-second.mkv'))} -filter_complex ${shell(filters.join(';'))} -map '[vout]' -frames:v ${Math.max(1,Math.round(durationSec*fps))} -an ${resolveVideoEncoderArgs(video)} -movflags +faststart ${shell(clip)}`;
}
