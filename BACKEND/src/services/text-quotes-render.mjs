import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {randomUUID} from 'node:crypto';
import {Resvg} from '@resvg/resvg-js';
import {quoteComposition} from '../../../SHARED/quote-styles.mjs';
import {textQuoteSvg} from '../../../SHARED/text-quotes.mjs';
import {resolveVideoEncoderArgs} from '../utils/video-encoder.mjs';
const fontFile=fileURLToPath(new URL('../../assets/text-quotes/BlackHanSans-Regular.ttf',import.meta.url));

export async function renderTextQuote({video,clip,durationSec,quoteStyleId,quoteText='',quoteAuthor='',quoteFields={},inputVideo=null,mediaOffsetSec=0}){
  const {width:w,height:h,fps}=video;
  if(![w,h,fps,durationSec].every(n=>Number.isFinite(n)&&n>0))throw new Error('Invalid quote render dimensions or duration.');
  const design=quoteComposition(quoteStyleId,{text:quoteText,author:quoteAuthor,...quoteFields});
  if(!design.chevronQuote)throw new Error('Unknown text quote style.');
  const frames=Math.max(1,Math.round(durationSec*fps));
  const source=inputVideo&&fs.existsSync(inputVideo)?inputVideo:null;
  const input=source?(/\.(mp4|mov|mkv|webm|m4v|avi)$/i.test(source)?['-stream_loop','-1','-ss',String(Math.max(0,Number(mediaOffsetSec)||0)),'-i',source]:['-loop','1','-i',source]):['-f','lavfi','-i',`color=c=${design.bg}:s=${w}x${h}:r=${fps}`];
  const bg=`[0:v]fps=${fps},scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},setsar=1,setpts=PTS-STARTPTS${source?',hue=s=0,drawbox=color=0x061020@0.72:t=fill':''}[bg]`;
  const temporary=path.join(path.dirname(clip),`text-quote-${randomUUID()}.mp4`);
  const child=spawn('ffmpeg',['-v','error','-y','-filter_complex_threads','1',...input,'-f','image2pipe','-framerate',String(fps),'-vcodec','png','-i','pipe:0','-filter_complex',`${bg};[bg][1:v]overlay=0:0:format=auto:shortest=1,format=yuv420p[out]`,'-map','[out]','-frames:v',String(frames),'-r',String(fps),'-fps_mode','cfr','-an',...resolveVideoEncoderArgs(video).split(/\s+/),'-movflags','+faststart',temporary],{stdio:['pipe','ignore','pipe']});
  let diagnostic='',failure=null;
  child.stderr.on('data',data=>{diagnostic=(diagnostic+data).slice(-6000);});
  child.stdin.on('error',e=>{failure=e;});
  const finished=new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',code=>code===0?resolve():reject(new Error(`Text quote render failed: ${diagnostic||code}`)));});
  finished.catch(e=>{failure=e;});
  const stop=()=>child.kill('SIGTERM');
  process.once('SIGTERM',stop);process.once('SIGINT',stop);
  try{
    let previous='',png;
    const font={fontFiles:[fontFile],loadSystemFonts:false,defaultFontFamily:'Black Han Sans'};
    for(let frame=0;frame<frames;frame++){
      if(failure)throw failure;
      const svg=textQuoteSvg(design,frame/fps,frames/fps,w,h);
      // Stable reading holds reuse one rasterized frame, even for long quotes.
      if(svg!==previous){png=new Resvg(svg,{font}).render().asPng();previous=svg;}
      if(!child.stdin.write(png))await Promise.race([once(child.stdin,'drain'),finished.then(()=>{throw new Error('Quote encoder closed early.');})]);
      if(frame%8===0)await new Promise(resolve=>setImmediate(resolve));
    }
    child.stdin.end();await finished;fs.renameSync(temporary,clip);
  }catch(e){child.stdin.destroy();child.kill();await finished.catch(()=>{});throw e;}
  finally{process.removeListener('SIGTERM',stop);process.removeListener('SIGINT',stop);fs.rmSync(temporary,{force:true});}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  renderTextQuote(JSON.parse(fs.readFileSync(process.argv[2],'utf8'))).catch(e=>{console.error(e.message);process.exitCode=1;});
}
