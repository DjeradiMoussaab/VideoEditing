import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {appendEndScreen,endScreenEnabled,saveEndScreenOption} from './end-screen.service.mjs';
import {apiConfig} from '../config/api.config.mjs';
import {createManifest,saveManifest,loadManifest} from './job-store.service.mjs';

test('ending defaults on and persists independently of scene edits with stale-write protection',()=>{
 const previous=apiConfig.jobsDir,root=fs.mkdtempSync(path.join(os.tmpdir(),'ending-save-'));apiConfig.jobsDir=root;
 try{
  const m=createManifest('ending-test');m.status='DRAFT_READY';m.scenes=[{scene_id:1,duration_sec:3,mediaOffsetSec:2,mediaFraming:{zoom:2,x:0,y:.5}}];m.plan={scenes:structuredClone(m.scenes)};saveManifest(m.id,m);
  assert.equal(endScreenEnabled(m),true);assert.equal(endScreenEnabled({}),true);
  const before=loadManifest(m.id);
  const saved=saveEndScreenOption(m.id,{endScreen:false,expectedUpdatedAt:m.updatedAt});
  assert.equal(endScreenEnabled(loadManifest(m.id)),false);assert.deepEqual(saved.scenes,before.scenes);assert.deepEqual(saved.plan,m.plan);assert.equal(saved.artifacts.needsRegeneration,true);
  assert.throws(()=>saveEndScreenOption(m.id,{endScreen:true,expectedUpdatedAt:'stale'}),{statusCode:409});
  assert.throws(()=>saveEndScreenOption(m.id,{endScreen:'false',expectedUpdatedAt:saved.updatedAt}),{statusCode:400});
  const enabled=saveEndScreenOption(m.id,{endScreen:true,expectedUpdatedAt:saved.updatedAt});assert.equal(endScreenEnabled(enabled),true);
  enabled.status='FINAL_RUNNING';saveManifest(m.id,enabled);
  assert.throws(()=>saveEndScreenOption(m.id,{endScreen:false,expectedUpdatedAt:enabled.updatedAt}),{statusCode:409});
 }finally{apiConfig.jobsDir=previous;fs.rmSync(root,{recursive:true,force:true});}
});

test('real exports add exactly 300 black frames and silence, including silent sources and regeneration',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),"ending render's "));
 const probe=file=>JSON.parse(execFileSync('ffprobe',['-v','error','-show_streams','-of','json',file],{encoding:'utf8'})).streams;
 try{
  for(const hasAudio of [true,false]){
   const source=path.join(root,`source-${hasAudio}.mp4`),output=path.join(root,`output-${hasAudio}.mp4`);
   const args=['-v','error','-f','lavfi','-i','color=red:s=160x90:r=30:d=1'];
   if(hasAudio)args.push('-f','lavfi','-i','sine=frequency=1000:duration=1','-c:a','aac');
   execFileSync('ffmpeg',[...args,'-c:v','libx264','-pix_fmt','yuv420p',source]);
   const original=fs.readFileSync(source);
   for(let repeat=0;repeat<2;repeat++){
    assert.deepEqual(await appendEndScreen(source,output),{durationSec:11,endScreenSeconds:10});
    const streams=probe(output),video=streams.find(s=>s.codec_type==='video');
    assert.equal(Number(video.nb_frames),330);assert.equal(Number(video.duration),11);assert.ok(streams.some(s=>s.codec_type==='audio'));
   }
   assert.deepEqual(fs.readFileSync(source),original);
   const pixels=execFileSync('ffmpeg',['-v','error','-i',output,'-vf','scale=1:1','-pix_fmt','rgb24','-f','rawvideo','-']);
   for(let frame=0;frame<330;frame++){
    const rgb=pixels.subarray(frame*3,frame*3+3);
    if(frame<30)assert.ok(rgb[0]>200&&rgb[1]<20&&rgb[2]<20);
    else assert.ok([...rgb].every(v=>v<4),`frame ${frame} should be black`);
   }
   const audio=execFileSync('ffmpeg',['-v','error','-ss','1.1','-i',output,'-vn','-ac','1','-ar','8000','-f','s16le','-']);
   let peak=0;for(let i=0;i<audio.length;i+=2)peak=Math.max(peak,Math.abs(audio.readInt16LE(i)));assert.ok(peak<=1,`silent ending peak ${peak}`);
  }
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});


test('stream copy preserves original encoded pictures at different rates and B-frame layouts',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),"ending copy's "));
 const probe=file=>JSON.parse(execFileSync('ffprobe',['-v','error','-show_streams','-of','json',file],{encoding:'utf8'})).streams.find(s=>s.codec_type==='video');
 const elementary=file=>execFileSync('ffmpeg',['-v','error','-i',file,'-map','0:v:0','-c:v','copy','-bsf:v','h264_mp4toannexb','-f','h264','-']);
 try{
  for(const [rate,bframes,frames] of [['60',0,73],['30000/1001',2,37]]){
   const source=path.join(root,`source-${bframes}.mp4`),output=path.join(root,`output-${bframes}.mp4`);
   execFileSync('ffmpeg',['-v','error','-f','lavfi','-i',`testsrc2=s=160x90:r=${rate}`,'-frames:v',String(frames),'-vf','setsar=4/3','-c:v','libx264','-bf',String(bframes),'-colorspace','bt709',source]);
   const before=probe(source),result=await appendEndScreen(source,output),after=probe(output);
   const [n,d=1]=rate.split('/').map(Number),tailFrames=Math.round(10*n/d);
   assert.equal(Number(after.nb_frames),frames+tailFrames);
   assert.ok(Math.abs(Number(after.duration)-(Number(before.duration)+tailFrames*d/n))<0.00001);
   assert.equal(after.sample_aspect_ratio,before.sample_aspect_ratio);
   assert.equal(after.color_space,before.color_space);
   assert.ok(Math.abs(result.endScreenSeconds-10)<=d/n/2);
   const original=elementary(source),finished=elementary(output);
   assert.deepEqual(finished.subarray(0,original.length),original,'original compressed video must be copied byte for byte');
   execFileSync('ffmpeg',['-v','error','-xerror','-i',output,'-f','null','-']);
  }
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('long source audio is trimmed before the silent ending and failures preserve existing files',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'ending-boundaries-'));
 try{
  const source=path.join(root,'source.mp4'),output=path.join(root,'output.mp4');
  execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','color=red:s=160x90:r=30:d=1','-f','lavfi','-i','sine=duration=2:sample_rate=48000','-c:v','libx264','-c:a','aac',source]);
  await appendEndScreen(source,output);
  const pcm=execFileSync('ffmpeg',['-v','error','-ss','1.1','-i',output,'-vn','-ac','1','-ar','8000','-f','s16le','-']);
  for(let i=0;i<pcm.length;i+=2)assert.ok(Math.abs(pcm.readInt16LE(i))<=1,'audio must stop at the picture boundary');
  const original=fs.readFileSync(source),finished=fs.readFileSync(output);
  await assert.rejects(appendEndScreen(source,source),/must differ/);
  assert.deepEqual(fs.readFileSync(source),original);
  const unsupported=path.join(root,'unsupported.mp4');
  execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','color=blue:s=160x90:r=30:d=1','-c:v','mpeg4',unsupported]);
  await assert.rejects(appendEndScreen(unsupported,output),/requires an H.264/);
  assert.deepEqual(fs.readFileSync(output),finished);
  assert.ok(fs.readdirSync(root).every(name=>!name.startsWith('end-screen-')),'no temporary files left behind');
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
