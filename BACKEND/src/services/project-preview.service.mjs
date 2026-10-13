import fs from 'node:fs';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {config} from '../config.mjs';
import * as fsSvc from './fs.service.mjs';
import * as ffmpeg from './ffmpeg.service.mjs';
import {getJobPaths,loadManifest,mediaUrl} from './job-store.service.mjs';
import {makeClipsStep} from '../steps/03-make-clips.mjs';
import {concatVisualsStep} from '../steps/04-concat-visuals.mjs';
import {graphicsHash,compositeGraphics} from './graphics.service.mjs';
import {validateGraphics,projectDuration,frameTime,GRAPHICS_VERSION} from '../../../SHARED/graphics.mjs';
import {IMAGE_MOTION_VERSION} from './image-motion.service.mjs';
import {QUOTE_MOTION_VERSION} from './quote-motion.service.mjs';
const run=promisify(execFile),pending=new Map();
let queue=Promise.resolve();
const stat=file=>{if(!file)return null;try{const s=fs.statSync(file);return [file,s.size,s.mtimeMs];}catch{return [file,'missing'];}};
export function previewScenes(manifest,start,end) {
  // Include transition neighbours, then trim on the project clock after compositing.
  return manifest.scenes.filter(s=>s.end_sec>start-2&&s.start_sec<end+2);
}
export async function renderProjectPreview(jobId,body={}) {
  const manifest=loadManifest(jobId);
  if(!manifest)throw Object.assign(new Error('Project not found.'),{statusCode:404});
  const total=projectDuration(manifest.scenes),fps=30;
  const start=frameTime(body.start??0,fps),end=Math.min(frameTime(body.end??total,fps),frameTime(total,fps));
  if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<=start||start>=total)throw Object.assign(new Error('Choose a valid preview range.'),{statusCode:400});
  const graphics=body.includeGraphics?validateGraphics(manifest.graphics||[],total,manifest.graphicsFps||30):[];
  const scenes=previewScenes(manifest,start,end),origin=Number(scenes[0].start_sec);
  const visualScenes=scenes.map(s=>({scene_id:s.scene_id,start_sec:s.start_sec,end_sec:s.end_sec,duration_sec:s.duration_sec,transition:s.transition,type:s.type,assetPath:s.assetPath,source:s.source,mediaOffsetSec:s.mediaOffsetSec,mediaEndBehavior:s.mediaEndBehavior,mediaPortionSelected:s.mediaPortionSelected,imageAnimationStyle:s.imageAnimationStyle,splitImages:s.splitImages,splitBackground:s.splitBackground,mediaFraming:s.mediaFraming,quoteText:s.quoteText??s.narration,quoteAuthor:s.quoteAuthor,quoteStyleId:s.quoteStyleId,quoteFields:s.quoteFields}));
  const key=graphicsHash({v:1,imageVersion:IMAGE_MOTION_VERSION,quoteVersion:QUOTE_MOTION_VERSION,scenes:visualScenes,sources:scenes.map(s=>[stat(s.assetPath),(s.splitImages||[]).map(i=>stat(i?.path))]),video:config.video});
  const dir=path.join(getJobPaths(jobId).outDir,'project-previews',key);
  const rangeKey=graphicsHash({start,end,graphics,v:GRAPHICS_VERSION});
  const output=path.join(dir,`${rangeKey}.mp4`);
  const result={url:mediaUrl(jobId,output),start,end,durationSec:frameTime(end-start,fps),includesGraphics:Boolean(body.includeGraphics)};
  if(fs.existsSync(output))return result;
  const taskKey=`${jobId}:${key}:${rangeKey}`;
  if(pending.has(taskKey))return pending.get(taskKey);
  if(pending.size>=4)throw Object.assign(new Error('Preview queue is busy. Try again shortly.'),{statusCode:429});
  const task=queue.then(async()=>{
    fs.mkdirSync(path.join(dir,'clips'),{recursive:true});
    const cache=path.join(getJobPaths(jobId).outDir,'cache','clips');fs.mkdirSync(cache,{recursive:true});
    const video={...config.video,width:960,height:540,fps,codec:'libx264',renderProfile:'graphics-preview',renderProfiles:{},encodePreset:'veryfast',clipCacheEnabled:true,clipRenderConcurrency:2};
    const ctx={config:{...config,video},runOptions:{renderProfile:'graphics-preview'},fs:fsSvc,ffmpeg,visualSourceMode:'hybrid',plan:{scenes:visualScenes.map(s=>({...s,start_sec:s.start_sec-origin,end_sec:s.end_sec-origin}))},sceneVisualChoices:{},sceneVisuals:Object.fromEntries(visualScenes.map(s=>[s.scene_id,{...s,path:s.assetPath,animationStyle:s.imageAnimationStyle}])),paths:{outDir:dir,clipsDir:path.join(dir,'clips'),clipCacheDir:cache,sceneClip:id=>path.join(dir,'clips',`${id}.mp4`),visualsMp4:path.join(dir,'background.mp4')}};
    if(!fs.existsSync(ctx.paths.visualsMp4)){
      const target=ctx.paths.visualsMp4;ctx.paths.visualsMp4=path.join(dir,'background.tmp.mp4');
      fs.rmSync(ctx.paths.visualsMp4,{force:true});
      try{await makeClipsStep(ctx);await concatVisualsStep(ctx);fs.renameSync(ctx.paths.visualsMp4,target);}
      finally{fs.rmSync(ctx.paths.visualsMp4,{force:true});ctx.paths.visualsMp4=target;}
    }
    const base=path.join(dir,`range-${graphicsHash({start,end})}.mp4`);
    if(!fs.existsSync(base)){
      const temporary=`${base}.tmp.mp4`;
      try{await run('ffmpeg',['-v','error','-y','-ss',String(start-origin),'-i',ctx.paths.visualsMp4,'-t',String(end-start),'-an','-c:v','libx264','-preset','veryfast','-crf','18','-movflags','+faststart',temporary]);fs.renameSync(temporary,base);}
      finally{fs.rmSync(temporary,{force:true});}
    }
    await compositeGraphics(base,output,graphics,{width:960,height:540,fps,start,duration:end-start});
    return result;
  });
  pending.set(taskKey,task);queue=task.catch(()=>{});
  try{return await task;}finally{pending.delete(taskKey);}
}
