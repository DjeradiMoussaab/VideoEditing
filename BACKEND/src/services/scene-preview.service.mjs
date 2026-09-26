import fs from 'node:fs';
import path from 'node:path';
import {createHash, randomUUID} from 'node:crypto';
import {config} from '../config.mjs';
import {loadManifest, getJobPaths, mediaUrl} from './job-store.service.mjs';
import {imageMotionCommand, IMAGE_MOTION_VERSION} from './image-motion.service.mjs';
import {makeQuoteClipCommand, QUOTE_MOTION_VERSION} from './quote-motion.service.mjs';
import {execAsync} from './ffmpeg.service.mjs';
import {quoteValues, validateQuoteDesign} from '../../../SHARED/quote-styles.mjs';

const pending = new Map();
let queue = Promise.resolve();
function fail(message, statusCode=400) { throw Object.assign(new Error(message), {statusCode}); }

export async function renderScenePreview(jobId, sceneId, draft={}) {
  const manifest=loadManifest(jobId);
  if(!manifest)fail('Project not found',404);
  const scene=manifest.scenes.find(s=>Number(s.scene_id)===Number(sceneId));
  if(!scene)fail('Scene not found',404);
  if(!['image','quote'].includes(scene.type))fail('This preview is available for image and quote scenes.');
  const durationSec=Number(scene.duration_sec);
  if(!Number.isFinite(durationSec)||durationSec<=0)fail('Invalid scene duration.');
  const styleId=draft.quoteStyleId ?? scene.quoteStyleId ?? 'classic';
  let fields={};
  if(scene.type==='quote'){
    fields=draft.quoteFields ?? quoteValues(scene);
    try {fields=validateQuoteDesign(styleId,fields);} catch(error){fail(error.message);}
  }
  const animationId=scene.imageAnimationStyle || config.video.imageAnimationStyle;
  const profile=config.video.imageAnimationProfiles[animationId];
  let source=null;
  if(scene.type==='image'){
    if(!profile)fail('Unknown image animation.');
    if(!scene.assetPath || !fs.existsSync(scene.assetPath))fail('Choose an image before previewing.');
    const stat=fs.statSync(scene.assetPath);
    source=[scene.assetPath,stat.size,stat.mtimeMs];
  }
  // Same composition, duration and motion functions as final output; lighter resolution.
  const video={...config.video,width:960,height:540,fps:30,codec:'libx264',encodePreset:'veryfast'};
  const key=createHash('sha256').update(JSON.stringify({jobId,type:scene.type,source,durationSec,animationId,profile,styleId,fields,video,imageVersion:IMAGE_MOTION_VERSION,quoteVersion:QUOTE_MOTION_VERSION})).digest('hex');
  const dir=path.join(getJobPaths(jobId).outDir,'previews');
  const clip=path.join(dir,`${key}.mp4`);
  const result={url:mediaUrl(jobId,clip),durationSec};
  if(fs.existsSync(clip))return result;
  if(pending.has(key))return pending.get(key);
  if(pending.size>=8)fail('Preview queue is busy. Please try again shortly.',429);
  const task=queue.then(async()=>{
    fs.mkdirSync(dir,{recursive:true});
    const temporary=path.join(dir,`${key}-${randomUUID()}.mp4`);
    try{
      const command=scene.type==='image'
        ?imageMotionCommand(video,profile,{img:scene.assetPath,clip:temporary,durationSec})
        :makeQuoteClipCommand({paths:{clipCacheDir:dir}},video,{clip:temporary,durationSec,quoteStyleId:styleId,quoteFields:fields});
      await execAsync(command);
      fs.renameSync(temporary,clip);
      return result;
    }finally{fs.rmSync(temporary,{force:true});}
  });
  pending.set(key,task);
  queue=task.catch(()=>{});
  try{return await task;}finally{pending.delete(key);}
}
