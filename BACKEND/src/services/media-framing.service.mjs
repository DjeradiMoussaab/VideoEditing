import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {loadManifest,saveManifest,getJobPaths} from './job-store.service.mjs';
import {DEFAULT_FRAMING,validateFraming,framingGeometry} from '../../../SHARED/media-framing.mjs';
const run=promisify(execFile);
export function saveMediaFraming(jobId,sceneId,{framing,expectedUpdatedAt}={}) {
 const fail=(message,statusCode=400)=>{throw Object.assign(new Error(message),{statusCode});};
 const manifest=loadManifest(jobId);if(!manifest)fail('Project not found.',404);
 if(manifest.updatedAt!==expectedUpdatedAt)fail('The project changed. Reopen it before adjusting the preview.',409);
 if(/_(RUNNING|PAUSED|STOPPING)$/.test(manifest.status))fail('Return to editing before adjusting the preview.',409);
 const scene=manifest.scenes?.find(s=>Number(s.scene_id)===Number(sceneId));if(!scene)fail('Scene not found.',404);
 if(!['image','video'].includes(scene.type))fail('Choose an image or video scene.');
 scene.mediaFraming=validateFraming(framing);
 const planned=manifest.plan?.scenes?.find(s=>Number(s.scene_id)===Number(sceneId));
 if(planned)planned.mediaFraming=scene.mediaFraming;
 manifest.artifacts={...manifest.artifacts,needsRegeneration:true};
 fs.rmSync(path.join(getJobPaths(jobId).outDir,'clips',`scene_${String(sceneId).padStart(2,'0')}.mp4`),{force:true});
 saveManifest(jobId,manifest);return manifest;
}
export async function applyMediaFraming(clip,framing=DEFAULT_FRAMING,video) {
 const normalized=validateFraming(framing);if(normalized.zoom===1)return;
 const box=framingGeometry(video.width,video.height,normalized);
 const filter=normalized.zoom<1
  ? `scale=${box.width}:${box.height}:flags=lanczos,pad=${video.width}:${video.height}:${box.x}:${box.y}:color=0x101318,setsar=1`
  : `crop=${box.width}:${box.height}:${box.x}:${box.y},scale=${video.width}:${video.height}:flags=lanczos,setsar=1`;
 const temporary=path.join(path.dirname(clip),`framing-${randomUUID()}.mp4`);
 try {
  await run('ffmpeg',['-v','error','-y','-i',clip,'-vf',filter,'-map','0:v:0','-map','0:a?','-c:v','libx264','-preset',video.encodePreset||'veryfast','-crf','18','-pix_fmt','yuv420p','-c:a','copy',temporary],{maxBuffer:2*1024*1024});
  fs.renameSync(temporary,clip);
 }catch(error){throw new Error(`Could not render preview framing: ${error.stderr?.slice(-1000)||error.message}`);}
 finally{fs.rmSync(temporary,{force:true});}
}
