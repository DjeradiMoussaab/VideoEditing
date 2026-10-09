import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync,execSync} from 'node:child_process';
import {clipPortionInfo,saveClipPortion} from './clip-portion.service.mjs';
import {apiConfig} from '../config/api.config.mjs';
import {createManifest,ensureJobDirs,saveManifest,loadManifest} from './job-store.service.mjs';
import {makeClipsStep} from '../steps/03-make-clips.mjs';
import {splitSceneManifest} from './scene-split.service.mjs';
function video(file){execFileSync('ffmpeg',['-v','error','-y','-f','lavfi','-i','color=red:s=160x90:r=20:d=1','-f','lavfi','-i','color=blue:s=160x90:r=20:d=1','-filter_complex','[0:v][1:v]concat=n=2:v=1:a=0','-c:v','libx264',file]);}
test('clip portions validate, persist without timing changes, invalidate output, and reuse thumbnails',async()=>{
 const previous=apiConfig.jobsDir,root=fs.mkdtempSync(path.join(os.tmpdir(),'clip-portion-'));apiConfig.jobsDir=root;
 try{
  const m=createManifest('portion-test'),dirs=ensureJobDirs(m.id),file=path.join(dirs.inputDir,'clip.mp4');video(file);
  m.status='DRAFT_READY';m.scenes=[{scene_id:1,type:'video',assetPath:file,start_sec:0,end_sec:1,duration_sec:1}];m.plan={scenes:structuredClone(m.scenes)};saveManifest(m.id,m);
  const [a,b]=await Promise.all([clipPortionInfo(m.id,1),clipPortionInfo(m.id,1)]);
  assert.equal(a.duration,2);assert.equal(a.fps,20);assert.equal(a.filmstripUrl,b.filmstripUrl);
  assert.equal(fs.readdirSync(path.join(dirs.outDir,'clip-portions')).length,1);
  fs.mkdirSync(path.join(dirs.outDir,'clips'),{recursive:true});const clip=path.join(dirs.outDir,'clips','scene_01.mp4');fs.writeFileSync(clip,'stale');
  const saved=await saveClipPortion(m.id,1,{start:1,behavior:'freeze',expectedUpdatedAt:loadManifest(m.id).updatedAt});
  assert.deepEqual([saved.scenes[0].start_sec,saved.scenes[0].end_sec,saved.scenes[0].duration_sec],[0,1,1]);
  assert.equal(saved.plan.scenes[0].mediaOffsetSec,1);assert.equal(saved.scenes[0].mediaEndBehavior,'freeze');assert.equal(fs.existsSync(clip),false);
  assert.equal(loadManifest(m.id).scenes[0].mediaOffsetSec,1);
  for(const start of [-1,1.1,NaN,'1'])await assert.rejects(saveClipPortion(m.id,1,{start,behavior:'loop',expectedUpdatedAt:saved.updatedAt}),{statusCode:400});
  await assert.rejects(saveClipPortion(m.id,1,{start:0,behavior:'loop',expectedUpdatedAt:'old'}),{statusCode:409});
  saved.status='FINAL_RUNNING';saveManifest(m.id,saved);
  await assert.rejects(saveClipPortion(m.id,1,{start:0,behavior:'loop',expectedUpdatedAt:loadManifest(m.id).updatedAt}),{statusCode:409});
 }finally{apiConfig.jobsDir=previous;fs.rmSync(root,{recursive:true,force:true});}
});
test('real export uses the selected source portion and distinguishes loop from freeze',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'portion-export-'));
 try{
 const source=path.join(root,'source.mp4');video(source);
 async function render(name,start,duration,behavior,padded=false){
 const clip=path.join(root,`${name}.mp4`);
 const ctx={config:{video:{width:160,height:90,fps:20,codec:'libx264',pixFmt:'yuv420p',encodePreset:'ultrafast',clipRenderConcurrency:1,clipCacheEnabled:false}},runOptions:{},plan:{scenes:padded?[{scene_id:1,duration_sec:duration,transition:{type:'fade',duration_sec:.8}},{scene_id:2,duration_sec:duration}]:[{scene_id:1,duration_sec:duration}]},sceneVisualChoices:{1:'video'},sceneVisuals:Object.fromEntries([1,2].map(id=>[id,{type:'video',path:source,mediaOffsetSec:start,mediaEndBehavior:behavior,mediaPortionSelected:true}])),fs:{exists:fs.existsSync},paths:{outDir:root,sceneClip:id=>id===1?clip:path.join(root,`${name}-second.mp4`)},ffmpeg:{exec:cmd=>execSync(cmd,{stdio:'pipe'}),execAsync:async cmd=>execSync(cmd,{stdio:'pipe'})}};
 await makeClipsStep(ctx);const length=Number(execFileSync('ffprobe',['-v','error','-show_entries','format=duration','-of','default=nw=1:nk=1',clip],{encoding:'utf8'}));assert.ok(Math.abs(length-(duration+(padded?.4:0)))<.06);return clip;
 }
 const pixel=(file,time)=>execFileSync('ffmpeg',['-v','error','-ss',String(time),'-i',file,'-frames:v','1','-vf','scale=1:1','-pix_fmt','rgb24','-f','rawvideo','-']);
 const selected=pixel(await render('selected',1,1,'loop'),.5);assert.ok(selected[2]>selected[0]+100,'selected blue second');
 const handle=pixel(await render('handle',1,1,'loop',true),1.2);assert.ok(handle[2]>handle[0]+100,`transition handle pixel ${[...handle]}`);
 const frozen=pixel(await render('freeze',0,3,'freeze'),2.5),looped=pixel(await render('loop',0,3,'loop'),2.5);
 assert.ok(frozen[2]>frozen[0]+100,'freeze holds blue last frame');assert.ok(looped[0]>looped[2]+100,'loop returns to red start');
 const split=splitSceneManifest({status:'DRAFT_READY',updatedAt:'v1',scenes:[{scene_id:1,type:'video',start_sec:0,end_sec:6,duration_sec:6,mediaOffsetSec:0,mediaEndBehavior:'freeze',mediaSourceDurationSec:2,mediaSourceFps:20}],plan:{scenes:[{scene_id:1,start_sec:0,end_sec:6,duration_sec:6}]}},1,3,'v1').project;
 assert.equal(split.scenes[1].mediaOffsetSec,1.95);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
