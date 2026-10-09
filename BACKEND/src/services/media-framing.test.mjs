import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {DEFAULT_FRAMING,validateFraming,framingGeometry} from '../../../SHARED/media-framing.mjs';
import {saveMediaFraming,applyMediaFraming} from './media-framing.service.mjs';
import {apiConfig} from '../config/api.config.mjs';
import {createManifest,ensureJobDirs,saveManifest,loadManifest} from './job-store.service.mjs';
import {uploadSceneVideo} from './pipeline-backend.service.mjs';
import {splitSceneManifest} from './scene-split.service.mjs';

test('framing rejects invalid settings and keeps the crop inside the frame',()=>{
 for(const value of [null,{},[],{zoom:0,x:.5,y:.5},{zoom:3.01,x:.5,y:.5},{zoom:2,x:Infinity,y:.5},{zoom:2,x:.5,y:-.1}])assert.throws(()=>validateFraming(value),{statusCode:400});
 assert.deepEqual(validateFraming({zoom:1,x:0,y:1}),DEFAULT_FRAMING);
 for(const zoom of [.5,.75,1,1.1,1.77,2,3])for(const x of [0,.5,1])for(const y of [0,.5,1]){
  const box=framingGeometry(1920,1080,{zoom,x,y});assert.ok(box.x>=0&&box.y>=0&&box.x+box.width<=1920&&box.y+box.height<=1080);
 }
});
test('zoom persists without changing timing or clip portion; split inherits and replacement resets it',async()=>{
 const previous=apiConfig.jobsDir,root=fs.mkdtempSync(path.join(os.tmpdir(),'framing-save-'));apiConfig.jobsDir=root;
 try{
  const m=createManifest('framing-test'),dirs=ensureJobDirs(m.id);m.status='DRAFT_READY';m.sceneChoices={1:'video'};
  m.scenes=[{scene_id:1,type:'video',assetPath:'original',start_sec:0,end_sec:6,duration_sec:6,mediaOffsetSec:3}];m.plan={scenes:structuredClone(m.scenes)};saveManifest(m.id,m);
  const framing={zoom:2,x:1,y:0};const saved=saveMediaFraming(m.id,1,{framing,expectedUpdatedAt:m.updatedAt});
  assert.deepEqual(loadManifest(m.id).scenes[0].mediaFraming,framing);assert.deepEqual(saved.plan.scenes[0].mediaFraming,framing);
  assert.deepEqual([saved.scenes[0].start_sec,saved.scenes[0].end_sec,saved.scenes[0].mediaOffsetSec],[0,6,3]);
  assert.throws(()=>saveMediaFraming(m.id,1,{framing,expectedUpdatedAt:'old'}),{statusCode:409});
  const split=splitSceneManifest(saved,1,3,saved.updatedAt).project;assert.deepEqual(split.scenes[1].mediaFraming,framing);
  await uploadSceneVideo(m.id,1,{buffer:Buffer.from('test fixture'),originalname:'clip.mp4'});
  assert.equal(loadManifest(m.id).scenes[0].mediaFraming,undefined);assert.equal(loadManifest(m.id).plan.scenes[0].mediaFraming,undefined);
  const current=loadManifest(m.id);current.status='FINAL_RUNNING';saveManifest(m.id,current);
  assert.throws(()=>saveMediaFraming(m.id,1,{framing,expectedUpdatedAt:loadManifest(m.id).updatedAt}),{statusCode:409});
 }finally{apiConfig.jobsDir=previous;fs.rmSync(root,{recursive:true,force:true});}
});
test('real FFmpeg zoom and pan select the correct pixels and preserve duration',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),"framing render's "));
 try{
  const source=path.join(root,'source.mp4');
  execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','color=red:s=160x90:r=20:d=1','-vf','drawbox=x=80:y=0:w=80:h=90:color=blue:t=fill','-c:v','libx264',source]);
  const original=fs.readFileSync(source);await applyMediaFraming(source,undefined,{width:160,height:90});assert.deepEqual(fs.readFileSync(source),original);
  const small=path.join(root,'small.mp4');fs.copyFileSync(source,small);
  await applyMediaFraming(small,{zoom:.5,x:.5,y:.5},{width:160,height:90,encodePreset:'ultrafast'});
  const corner=execFileSync('ffmpeg',['-v','error','-i',small,'-frames:v','1','-vf','crop=8:8:0:0,scale=1:1','-pix_fmt','rgb24','-f','rawvideo','-']);assert.ok(corner[0]<35&&corner[1]<35&&corner[2]<35,'zoom out fills the surround with the preview background');
  for(const [x,color] of [[0,0],[1,2]]){
   const file=path.join(root,`${x}.mp4`);fs.copyFileSync(source,file);
   await applyMediaFraming(file,{zoom:2,x,y:.5},{width:160,height:90,encodePreset:'ultrafast'});
   const pixel=execFileSync('ffmpeg',['-v','error','-i',file,'-frames:v','1','-vf','scale=1:1','-pix_fmt','rgb24','-f','rawvideo','-']);
   assert.ok(pixel[color]>200&&pixel[color===0?2:0]<30);
   const duration=Number(execFileSync('ffprobe',['-v','error','-show_entries','format=duration','-of','default=nw=1:nk=1',file],{encoding:'utf8'}));assert.ok(Math.abs(duration-1)<.05);
  }
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('final clip cache distinguishes framing and resetting restores the original composition',async()=>{
 const {makeClipsStep}=await import('../steps/03-make-clips.mjs');
 const {execSync}=await import('node:child_process');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'framing-cache-'));
 try{
  const source=path.join(root,'source.mp4'),clip=path.join(root,'clip.mp4'),cache=path.join(root,'cache');fs.mkdirSync(cache);
  execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','color=red:s=160x90:r=20:d=1','-vf','drawbox=x=80:y=0:w=80:h=90:color=blue:t=fill','-c:v','libx264',source]);
  const ctx={config:{video:{width:160,height:90,fps:20,codec:'libx264',pixFmt:'yuv420p',encodePreset:'ultrafast',clipRenderConcurrency:1,clipCacheEnabled:true}},runOptions:{},plan:{scenes:[{scene_id:1,duration_sec:1,mediaFraming:{zoom:2,x:0,y:.5}}]},sceneVisualChoices:{1:'video'},sceneVisuals:{1:{type:'video',path:source}},fs:{exists:fs.existsSync},paths:{outDir:root,clipCacheDir:cache,sceneClip:()=>clip},ffmpeg:{execAsync:async command=>execSync(command,{stdio:'pipe'})}};
  const pixel=()=>execFileSync('ffmpeg',['-v','error','-i',clip,'-frames:v','1','-vf','scale=1:1','-pix_fmt','rgb24','-f','rawvideo','-']);
  await makeClipsStep(ctx);assert.ok(pixel()[0]>200);
  fs.rmSync(clip);ctx.plan.scenes[0].mediaFraming={zoom:2,x:1,y:.5};await makeClipsStep(ctx);assert.ok(pixel()[2]>200);
  fs.rmSync(clip);ctx.plan.scenes[0].mediaFraming=DEFAULT_FRAMING;await makeClipsStep(ctx);const reset=pixel();assert.ok(reset[0]>75&&reset[2]>75);
  assert.equal(fs.readdirSync(cache).filter(f=>f.endsWith('.mp4')).length,3);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
