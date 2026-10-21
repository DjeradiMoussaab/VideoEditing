import {profileSvg} from '../../../SHARED/profile.mjs';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {randomUUID} from 'node:crypto';
import {Resvg} from '@resvg/resvg-js';
import {quoteComposition} from '../../../SHARED/quote-styles.mjs';
import {presentationSvg} from '../../../SHARED/presentation.mjs';
import {resolveVideoEncoderArgs} from '../utils/video-encoder.mjs';
const fontFiles=['Black','Bold'].map(weight=>fileURLToPath(new URL(`../../assets/corporate-trend/Raleway-${weight}.ttf`,import.meta.url)));

export async function renderPresentation({video,clip,durationSec,quoteStyleId,quoteText='',quoteAuthor='',quoteFields={},inputVideo=null,mediaOffsetSec=0}){
  const {width:w,height:h,fps}=video;
  if(![w,h,fps,durationSec].every(n=>Number.isFinite(n)&&n>0))throw new Error('Invalid quote render dimensions or duration.');
  const design=quoteComposition(quoteStyleId,{text:quoteText,author:quoteAuthor,...quoteFields});
  if(!design.presentation&&!design.profile)throw new Error('Unknown presentation style.');
  const frames=Math.max(1,Math.round(durationSec*fps));
  const source=inputVideo&&fs.existsSync(inputVideo)?inputVideo:fileURLToPath(new URL('../../assets/corporate-trend/placeholder.jpg',import.meta.url));
  const input=source?(/\.(mp4|mov|mkv|webm|m4v|avi)$/i.test(source)?['-stream_loop','-1','-ss',String(Math.max(0,Number(mediaOffsetSec)||0)),'-i',source]:['-loop','1','-i',source]):['-f','lavfi','-i',`color=c=${design.bg}:s=${w}x${h}:r=${fps}`];
  let bg=`[0:v]fps=${fps},scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},setsar=1,setpts=PTS-STARTPTS[bg]`;
  const panelGraph=[];
  if(design.panels.length){
    const count=design.panels.length;
    bg=`[0:v]fps=${fps},setsar=1,setpts=PTS-STARTPTS[bg]`;
    panelGraph.push(`[bg]split=${count+1}[baseSource]${design.panels.map((_,i)=>`[media${i}]`).join('')}`);
    panelGraph.push(`[baseSource]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h}[base]`);
    design.panels.forEach((panel,i)=>{
      const [x,y,pw,ph]=panel.box.map((v,j)=>Math.round(v*(j%2?h/1080:w/1920)));
      panelGraph.push(`[media${i}]scale=${pw}:${ph}:force_original_aspect_ratio=increase,crop=${pw}:${ph}[panel${i}]`);
      panelGraph.push(`[${i?`composite${i-1}`:'base'}][panel${i}]overlay=${x}:${y}:shortest=1[composite${i}]`);
    });
  }
  const base=design.panels.length?`composite${design.panels.length-1}`:'bg';
  const temporary=path.join(path.dirname(clip),`presentation-${randomUUID()}.mp4`);
  const child=spawn('ffmpeg',['-v','error','-y','-filter_complex_threads','1',...input,'-f','image2pipe','-framerate',String(fps),'-vcodec','png','-i','pipe:0','-filter_complex',`${bg};${panelGraph.length?panelGraph.join(';')+';':''}[${base}][1:v]overlay=0:0:format=auto:shortest=1,format=yuv420p[out]`,'-map','[out]','-frames:v',String(frames),'-r',String(fps),'-fps_mode','cfr','-an',...resolveVideoEncoderArgs(video).split(/\s+/),'-movflags','+faststart',temporary],{stdio:['pipe','ignore','pipe']});
  let diagnostic='',failure=null;
  child.stderr.on('data',data=>{diagnostic=(diagnostic+data).slice(-6000);});
  child.stdin.on('error',e=>{failure=e;});
  const finished=new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',code=>code===0?resolve():reject(new Error(`Presentation render failed: ${diagnostic||code}`)));});
  finished.catch(e=>{failure=e;});
  const stop=()=>child.kill('SIGTERM');
  process.once('SIGTERM',stop);process.once('SIGINT',stop);
  try{
    let previous='',png;
    const font={fontFiles:design.profile?[fileURLToPath(new URL('../../assets/profile/Multicolore Pro.otf',import.meta.url)),fileURLToPath(new URL('../../assets/modern-clean/Montserrat-Medium.ttf',import.meta.url))]:fontFiles,loadSystemFonts:false,defaultFontFamily:'Presentation Black'};
    for(let frame=0;frame<frames;frame++){
      if(failure)throw failure;
      const svg=(design.profile?profileSvg:presentationSvg)(design,frame/fps,frames/fps,w,h);
      // Stable reading holds reuse one rasterized frame, even for long quotes.
      if(svg!==previous){png=new Resvg(svg,{font}).render().asPng();previous=svg;}
      if(!child.stdin.write(png))await Promise.race([once(child.stdin,'drain'),finished.then(()=>{throw new Error('Presentation encoder closed early.');})]);
      if(frame%8===0)await new Promise(resolve=>setImmediate(resolve));
    }
    child.stdin.end();await finished;fs.renameSync(temporary,clip);
  }catch(e){child.stdin.destroy();child.kill();await finished.catch(()=>{});throw e;}
  finally{process.removeListener('SIGTERM',stop);process.removeListener('SIGINT',stop);fs.rmSync(temporary,{force:true});}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  renderPresentation(JSON.parse(fs.readFileSync(process.argv[2],'utf8'))).catch(e=>{console.error(e.message);process.exitCode=1;});
}
