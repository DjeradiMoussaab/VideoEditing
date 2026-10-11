import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execSync,execFileSync} from 'node:child_process';
import {once} from 'node:events';
import {LIFESTYLE_STYLES,lifestyleLayout,lifestyleCurve,lifestyleTime} from '../../../SHARED/modern-lifestyle.mjs';
import {lifestyleMotion} from '../../../SHARED/modern-lifestyle-motion.mjs';
import {OPENER_STYLES,QUOTE_STYLES,validateQuoteDesign} from '../../../SHARED/quote-styles.mjs';
import {modernLifestyleCommand} from './modern-lifestyle.service.mjs';
import {makeClipsStep} from '../steps/03-make-clips.mjs';
import {apiConfig} from '../config/api.config.mjs';
import {createManifest,saveManifest,loadManifest} from './job-store.service.mjs';
import {createApp} from '../app.mjs';

test('four imported openers stay separate from quotes and use the source geometry and keyframes',()=>{
 assert.deepEqual(LIFESTYLE_STYLES.map(s=>s.sourceScene),[1,3,4,10]);
 for(const style of LIFESTYLE_STYLES){
  assert.ok(OPENER_STYLES.some(s=>s.id===style.id));assert.ok(!QUOTE_STYLES.some(s=>s.id===style.id));
  const layout=lifestyleLayout(style,style.sample);
  assert.ok(layout.blocks.length);
  for(const layer of layout.motion.layers){
   for(const key of layer.move)assert.deepEqual(lifestyleCurve(layer.move,key.t).map(n=>+n.toFixed(5)),key.v.map(n=>+n.toFixed(5)));
  }
  const colors=Object.fromEntries(style.colors.map(([key])=>[key,'#bc1389']));
  assert.deepEqual(validateQuoteDesign(style.id,colors),colors);
  const changed=lifestyleLayout(style,{...style.sample,...colors});
  assert.ok(changed.blocks.every(b=>b.color==='#bc1389'));
  assert.ok(changed.shapes.every(s=>s.color==='#bc1389'));
  assert.equal(changed.bg,'#bc1389');
 }
 const first=lifestyleLayout(LIFESTYLE_STYLES[0],LIFESTYLE_STYLES[0].sample);
 assert.ok(Math.abs(first.blocks.find(b=>b.key==='text').fontSize-124.153)<.1);
 const minimal=lifestyleLayout(LIFESTYLE_STYLES[1],LIFESTYLE_STYLES[1].sample);
 assert.ok(Math.abs(minimal.blocks[0].baseline-532.39)<1);
 assert.equal(lifestyleTime(7,12,241/30),4);
 assert.ok(Math.abs(lifestyleTime(12,12,241/30)-241/30)<1e-8);
});

test('all four styles persist through HTTP edits and render genuine previews',async()=>{
 const old=apiConfig.jobsDir,dir=fs.mkdtempSync(path.join(os.tmpdir(),'lifestyle-api-'));apiConfig.jobsDir=dir;let server;
 try{
  const m=createManifest('styles');m.status='DRAFT_READY';
  m.scenes=LIFESTYLE_STYLES.map((s,i)=>({scene_id:i+1,type:'opener',quoteStyleId:s.id,quoteFields:s.sample,quoteText:s.sample.text,duration_sec:.6,start_sec:i*.6,end_sec:(i+1)*.6}));
  m.plan={scenes:structuredClone(m.scenes)};m.sceneChoices=Object.fromEntries(m.scenes.map(s=>[s.scene_id,s.type]));saveManifest(m.id,m);
  server=createApp().listen(0,'127.0.0.1');await once(server,'listening');
  const base=`http://127.0.0.1:${server.address().port}/api/projects/styles/scenes`;
  for(const [i,s] of LIFESTYLE_STYLES.entries()){
   const quoteFields={...s.sample,text:'Custom 100%: “title”',backgroundColor:'#260834',glowColor:'#fa3b88',atmosphereColor:'#55cc99'};
   let response=await fetch(`${base}/${i+1}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({quoteStyleId:s.id,quoteFields})});
   assert.equal(response.status,200,await response.text());
   const loaded=loadManifest(m.id).scenes[i];assert.equal(loaded.quoteStyleId,s.id);assert.deepEqual(loaded.quoteFields,quoteFields);
   response=await fetch(`${base}/${i+1}/preview`,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
   assert.equal(response.status,200,await response.text());
   response=await fetch(`${base}/${i+1}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'quote',quoteStyleId:s.id})});
   assert.equal(response.status,400);
  }
 }finally{if(server)await new Promise(r=>server.close(r));apiConfig.jobsDir=old;fs.rmSync(dir,{recursive:true,force:true});}
});

test('opener final renderer handles image and video media, exact duration, silence, and cache reuse',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),"lifestyle export's "));
 try{
  const image=path.join(root,'background.png'),video=path.join(root,'background.mp4');
  execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','testsrc2=s=320x180:r=24:d=2','-frames:v','1',image]);
  execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','testsrc2=s=320x180:r=24:d=2','-c:v','libx264',video]);
  for(const [i,s] of LIFESTYLE_STYLES.entries()){
   let renders=0;
   const clip=path.join(root,`${s.id}.mp4`),ctx={config:{video:{width:320,height:180,fps:24,codec:'libx264',encodePreset:'ultrafast',clipCacheEnabled:true}},runOptions:{},plan:{scenes:[{scene_id:1,duration_sec:1.25}]},sceneVisualChoices:{1:'opener'},sceneVisuals:{1:{type:'opener',path:i%2?video:image,mediaOffsetSec:i%2?.25:0,quoteStyleId:s.id,quoteFields:{...s.sample,text:"A 'quoted' title: 100%"}}},fs:{exists:fs.existsSync},paths:{outDir:root,clipCacheDir:path.join(root,'cache'),sceneClip:()=>clip},ffmpeg:{execAsync:async cmd=>{renders++;execSync(cmd,{stdio:'pipe',timeout:60000});}}};
   await makeClipsStep(ctx);
   const probe=JSON.parse(execFileSync('ffprobe',['-v','error','-show_streams','-of','json',clip]));
   assert.equal(probe.streams.length,1);assert.equal(probe.streams[0].nb_frames,'30');
   fs.rmSync(clip);await makeClipsStep(ctx);assert.equal(renders,1,'identical renders reuse the existing clip cache');
  }
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
