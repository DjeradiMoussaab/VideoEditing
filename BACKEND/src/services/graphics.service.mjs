import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';
import {Resvg} from '@resvg/resvg-js';
import {validateGraphics,graphicsSvg,projectDuration,GRAPHICS_VERSION} from '../../../SHARED/graphics.mjs';
import {loadManifest,saveManifest,getJobPaths} from './job-store.service.mjs';
const run=promisify(execFile);
export const graphicsFontFiles=['Montserrat-Regular.ttf','Montserrat-Bold.ttf'].map(name=>fileURLToPath(new URL(`../../assets/modern-clean/${name}`,import.meta.url))).concat(['../../assets/typography-titles/Montserrat-Black.ttf','../../assets/vintage/typewriter.ttf','../../assets/vintage/handwriting.ttf'].map(file=>fileURLToPath(new URL(file,import.meta.url))));
export const graphicsHash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function saveGraphics(jobId,{graphics,expectedUpdatedAt}={}) {
  const manifest=loadManifest(jobId);
  const fail=(message,statusCode)=>{throw Object.assign(new Error(message),{statusCode});};
  if(!manifest)fail('Project not found.',404);
  if(/_(RUNNING|PAUSED|STOPPING)$/.test(manifest.status))fail('Return to editing before changing graphics.',409);
  if(expectedUpdatedAt!==manifest.updatedAt)fail('The project changed. Reload it before saving graphics; your draft is kept.',409);
  manifest.graphics=validateGraphics(graphics,projectDuration(manifest.scenes),manifest.graphicsFps||30);
  manifest.graphicsVersion=GRAPHICS_VERSION;
  manifest.artifacts={...manifest.artifacts,needsRegeneration:true};
  saveManifest(jobId,manifest);
  return manifest;
}
// Rasterize the same SVG evaluated by the browser. Stream frames with backpressure;
// never hold a complete animation in memory. Unchanged compositions reuse the output.
export async function compositeGraphics(input,output,graphics,{width,height,fps,start=0,duration}={}) {
  if(!graphics.some(g=>!g.hidden&&g.end>start&&g.start<start+duration)) {
    if(input!==output)fs.copyFileSync(input,output);
    return output;
  }
  const temporary=path.join(path.dirname(output),`graphics-${randomUUID()}.mp4`);
  const child=spawn('ffmpeg',['-v','error','-y','-i',input,'-f','image2pipe','-framerate',String(fps),'-vcodec','png','-i','pipe:0','-filter_complex','[0:v][1:v]overlay=0:0:format=auto:shortest=1,format=yuv420p[v]','-map','[v]','-map','0:a?','-c:v','libx264','-preset','veryfast','-crf','18','-c:a','copy','-t',String(duration),'-movflags','+faststart',temporary],{stdio:['pipe','ignore','pipe']});
  let diagnostic='',failure=null;
  child.stderr.on('data',data=>{diagnostic=(diagnostic+data).slice(-4000);});
  child.stdin.on('error',error=>{failure=error;});
  const finished=new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',code=>code===0?resolve():reject(new Error(`Graphics render failed: ${diagnostic||code}`)));});
  // Attach a rejection handler immediately, including while waiting for pipe drainage.
  finished.catch(error=>{failure=error;});
  try {
    let lastSvg='',lastPng=null;
    for(let frame=0;frame<Math.round(duration*fps);frame++) {
      if(failure)throw failure;
      const svg=graphicsSvg(graphics,start+frame/fps,width,height);
      const png=svg===lastSvg?lastPng:new Resvg(svg,{font:{fontFiles:graphicsFontFiles,loadSystemFonts:false,defaultFontFamily:'Montserrat'}}).render().asPng();
      lastSvg=svg;lastPng=png;
      if(!child.stdin.write(png))await Promise.race([once(child.stdin,'drain'),finished.then(()=>{throw new Error('Graphics encoder closed early.');})]);
      if(frame%8===0)await new Promise(resolve=>setImmediate(resolve));
    }
    child.stdin.end();await finished;
    fs.renameSync(temporary,output);return output;
  }catch(error){child.stdin.destroy();child.kill();await finished.catch(()=>{});throw error;}
  finally{fs.rmSync(temporary,{force:true});}
}
export async function applyProjectGraphics(input,graphics) {
  if(!graphics?.some(g=>!g.hidden))return input;
  const {stdout}=await run('ffprobe',['-v','error','-show_streams','-of','json',input]);
  const video=JSON.parse(stdout).streams.find(s=>s.codec_type==='video');
  if(!video)throw new Error('The content video has no video stream.');
  const [n,d]=video.avg_frame_rate.split('/').map(Number);
  const stat=fs.statSync(input);
  const key=graphicsHash({v:GRAPHICS_VERSION,graphics,source:[stat.size,stat.mtimeMs],width:video.width,height:video.height,fps:n/d});
  const output=path.join(path.dirname(input),`graphics-${key}.mp4`);
  if(!fs.existsSync(output))await compositeGraphics(input,output,graphics,{width:video.width,height:video.height,fps:n/d,duration:Number(video.duration)});
  return output;
}
