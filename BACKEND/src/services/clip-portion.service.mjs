import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {loadManifest,saveManifest,getJobPaths,mediaUrl} from './job-store.service.mjs';
const run=promisify(execFile),pending=new Map();
const fail=(message,statusCode=400)=>{throw Object.assign(new Error(message),{statusCode});};
function source(jobId,sceneId){
 const manifest=loadManifest(jobId);if(!manifest)fail('Project not found.',404);
 const scene=manifest.scenes?.find(s=>Number(s.scene_id)===Number(sceneId));
 if(!scene)fail('Scene not found.',404);
 if(scene.type!=='video'||!scene.assetPath||!fs.existsSync(scene.assetPath))fail('Select an available video clip first.');
 return {manifest,scene};
}
async function probe(file){
 const {stdout}=await run('ffprobe',['-v','error','-select_streams','v:0','-show_entries','stream=duration,avg_frame_rate:format=duration','-of','json',file],{timeout:20000,maxBuffer:1024*1024});
 const data=JSON.parse(stdout),stream=data.streams?.[0];
 const duration=[stream?.duration,data.format?.duration].map(Number).find(n=>Number.isFinite(n)&&n>0);
 if(!stream||!Number.isFinite(duration)||duration<=0)fail('This clip has no readable video duration.');
 const [a,b]=String(stream.avg_frame_rate||'30/1').split('/').map(Number);
 return {duration,fps:Number.isFinite(a/b)&&a/b>0?a/b:30};
}
export async function clipPortionInfo(jobId,sceneId){
 const {scene}=source(jobId,sceneId),info=await probe(scene.assetPath);
 const stat=fs.statSync(scene.assetPath);
 const key=crypto.createHash('sha256').update(`${scene.assetPath}:${stat.size}:${stat.mtimeMs}:portion-v1`).digest('hex');
 const dir=path.join(getJobPaths(jobId).outDir,'clip-portions');fs.mkdirSync(dir,{recursive:true});
 const image=path.join(dir,`${key}.jpg`);
 if(!fs.existsSync(image)){
  if(!pending.has(image))pending.set(image,(async()=>{
   const temporary=path.join(dir,`${key}-${crypto.randomUUID()}.jpg`);
   try{
    const args=['-v','error','-y','-filter_complex_threads','1'],filters=[];
    for(let i=0;i<12;i++){
     const time=Math.max(0,Math.floor(i/11*Math.max(0,info.duration-1/info.fps)*info.fps)/info.fps);
     args.push('-ss',String(time),'-threads','1','-i',scene.assetPath);
     filters.push(`[${i}:v]scale=160:90:force_original_aspect_ratio=increase,crop=160:90,setsar=1[f${i}]`);
    }
    filters.push(`${Array.from({length:12},(_,i)=>`[f${i}]`).join('')}hstack=inputs=12[out]`);
    args.push('-filter_complex',filters.join(';'),'-map','[out]','-frames:v','1',temporary);
    await run('ffmpeg',args,{timeout:60000,maxBuffer:2*1024*1024});
    fs.renameSync(temporary,image);
   }finally{fs.rmSync(temporary,{force:true});}
  })().finally(()=>pending.delete(image)));
  try { await pending.get(image); } catch { /* Thumbnails are optional; source selection still works. */ }
 }
 return {...info,filmstripUrl:fs.existsSync(image)?mediaUrl(jobId,image):null,assetUrl:scene.assetUrl};
}
export async function saveClipPortion(jobId,sceneId,{start,behavior,expectedUpdatedAt}={}){
 const initial=source(jobId,sceneId);
 if(initial.manifest.updatedAt!==expectedUpdatedAt)fail('The project changed. Reopen the project before saving.',409);
 const info=await probe(initial.scene.assetPath);
 // Probe is asynchronous: reload before writing so another edit is never overwritten.
 const {manifest,scene}=source(jobId,sceneId);
 if(manifest.updatedAt!==expectedUpdatedAt)fail('The project changed. Reopen the project before saving.',409);
 if(/_(RUNNING|PAUSED|STOPPING)$/.test(manifest.status))fail('Return to editing before choosing a clip portion.',409);
 if(!['loop','freeze'].includes(behavior))fail('Choose Loop or Freeze last frame.');
 const max=Math.max(0,info.duration-Number(scene.duration_sec));
 if(typeof start!=='number'||!Number.isFinite(start)||start<0||start>max+.001)fail('Choose a start time within the available clip.');
 scene.mediaOffsetSec=Math.min(start,max);scene.mediaEndBehavior=behavior;
 scene.mediaPortionSelected=true;scene.mediaSourceDurationSec=info.duration;scene.mediaSourceFps=info.fps;
 const planned=manifest.plan?.scenes?.find(s=>Number(s.scene_id)===Number(sceneId));
 if(planned){planned.mediaOffsetSec=scene.mediaOffsetSec;planned.mediaEndBehavior=behavior;planned.mediaPortionSelected=true;planned.mediaSourceDurationSec=info.duration;planned.mediaSourceFps=info.fps;}
 manifest.artifacts={...manifest.artifacts,needsRegeneration:true};
 fs.rmSync(path.join(getJobPaths(jobId).outDir,'clips',`scene_${String(sceneId).padStart(2,'0')}.mp4`),{force:true});
 saveManifest(jobId,manifest);return manifest;
}
