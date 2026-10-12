import fs from 'node:fs';
import path from 'node:path';
import {splitStyle} from '../../../SHARED/split-screens.mjs';
import {loadManifest,saveManifest,getJobPaths,mediaUrl} from './job-store.service.mjs';
import {addSuggestionMedia} from './suggestion-media.service.mjs';
const fail=(message,statusCode=400)=>{throw Object.assign(new Error(message),{statusCode});};
function target(jobId,sceneId){
 const project=loadManifest(jobId);if(!project)fail('Project not found.',404);
 const scene=project.scenes.find(s=>Number(s.scene_id)===Number(sceneId));if(!scene)fail('Scene not found.',404);
 const style=splitStyle(scene.imageAnimationStyle);
 if(scene.type!=='image'||!style)fail('Choose a split layout first.');
 return {project,scene,style};
}
function slotIndex(slot,style){if(!Number.isInteger(slot)||slot<0||slot>=style.panels)fail('Choose a valid image panel.');return slot;}
export function resolveSplitImages(scene){
 const style=splitStyle(scene.imageAnimationStyle||scene.animationStyle);if(!style)return [];
 return Array.from({length:style.panels},(_,i)=>{
  const image=scene.splitImages?.[i];const file=image?.path||scene.assetPath||scene.path;
  if(!file||!fs.existsSync(file))fail(`Image ${i+1} is missing. Choose or upload an image for this panel.`);
  return {...image,path:file};
 });
}
export function splitImageFingerprint(images){return images.map(image=>{const st=fs.statSync(image.path);return {...image,size:st.size,mtime:st.mtimeMs};});}
export function saveSplitImages(jobId,sceneId,update){
 const {project,scene,style}=target(jobId,sceneId);
 if(!update||typeof update!=='object'||Array.isArray(update))fail('Invalid split settings.');
 if(Object.keys(update).some(k=>!['slot','matchId','x','y','zoom','background'].includes(k)))fail('Unknown split setting.');
 if(update.background!==undefined&&!/^#[0-9a-f]{6}$/i.test(update.background))fail('Choose a valid background color.');
 for(const key of ['x','y'])if(update[key]!==undefined&&(typeof update[key]!=='number'||!Number.isFinite(update[key])||update[key]<0||update[key]>100))fail('Image position must be between 0 and 100.');
 if(update.zoom!==undefined&&(typeof update.zoom!=='number'||!Number.isFinite(update.zoom)||update.zoom<.5||update.zoom>3))fail('Zoom must be between 50% and 300%.');
 const changesImage=['matchId','x','y','zoom'].some(k=>update[k]!==undefined);
 let next;
 if(changesImage){
  const slot=slotIndex(update.slot,style);next={...scene.splitImages?.[slot]};
  if(update.matchId!==undefined){
   const match=scene.referenceMatches?.find(m=>String(m.id)===String(update.matchId));
   if(!match||match.type==='video')fail('Choose an image from this project.');
   const upload=project.uploadedMedia?.find(m=>m.id===match.id&&m.type!=='video');
   const filename=String(match.filename||'').replace(/\\/g,'/');
   const file=upload?.path||(project.inputs?.references||[]).find(p=>String(p).replace(/\\/g,'/').endsWith('/'+filename));
   if(!file||!fs.existsSync(file))fail('This image is missing. Upload it again.');
   next={id:match.id,path:file,url:mediaUrl(jobId,file),filename:match.filename,x:50,y:50,zoom:1};
  }
  for(const key of ['x','y','zoom'])if(update[key]!==undefined)next[key]=update[key];
  if(!next.path&&scene.assetPath)Object.assign(next,{path:scene.assetPath,url:scene.assetUrl,filename:path.basename(scene.assetPath)});
  if(!next.path)fail('Choose an image before adjusting its position.');
  scene.splitImages=[...(scene.splitImages||[])];scene.splitImages[slot]=next;
  if(!scene.assetPath){scene.assetPath=next.path;scene.assetUrl=next.url;scene.source='custom_image';}
 }
 if(!changesImage&&update.background===undefined)fail('No split changes provided.');
 if(update.background!==undefined)scene.splitBackground=update.background.toLowerCase();
 delete scene.mediaFraming;
 scene.manualMediaSelection=true;
 const planned=project.plan?.scenes?.find(s=>Number(s.scene_id)===Number(sceneId));
 if(planned){delete planned.mediaFraming;planned.splitImages=scene.splitImages;planned.splitBackground=scene.splitBackground;}
 fs.rmSync(path.join(getJobPaths(jobId).outDir,'clips',`scene_${String(sceneId).padStart(2,'0')}.mp4`),{force:true});
 project.artifacts={...project.artifacts,needsRegeneration:true};saveManifest(jobId,project);return project;
}
export async function uploadSplitImage(jobId,sceneId,slot,file){
 const {style,project}=target(jobId,sceneId);slotIndex(slot,style);
 if(!file||!/^image\//.test(file.mimetype||''))fail('Upload an image for this panel.');
 const ids=new Set((project.uploadedMedia||[]).map(m=>m.id));
 const updated=await addSuggestionMedia(jobId,file);
 const added=updated.uploadedMedia.find(m=>!ids.has(m.id)&&m.type==='image');
 if(!added)fail('The uploaded file is not an image.');
 return saveSplitImages(jobId,sceneId,{slot,matchId:added.id});
}
