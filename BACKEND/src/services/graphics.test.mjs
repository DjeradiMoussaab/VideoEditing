import {Resvg} from '@resvg/resvg-js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {GRAPHIC_TYPES,GRAPHIC_FONTS,GRAPHIC_EFFECTS,createGraphic,validateGraphics,graphicPose,graphicsSvg,moveGraphicTime} from '../../../SHARED/graphics.mjs';
import {graphicsFontFiles,saveGraphics,compositeGraphics,applyProjectGraphics} from './graphics.service.mjs';
import {renderProjectPreview} from './project-preview.service.mjs';
import {apiConfig} from '../config/api.config.mjs';
import {createManifest,saveManifest,loadManifest,getJobPaths} from './job-store.service.mjs';
import {splitScene,deleteScene} from './pipeline-backend.service.mjs';
const graphic=(extra={})=>validateGraphics([{...createGraphic('lower-third',1,15,'title'),...extra}],15)[0];

test('graphics validate timing, finite geometry, colors, identities and keyframes',()=>{
  const g=graphic({start:3,end:13});assert.equal(g.end-g.start,10);
  for(const patch of [{start:-1},{end:16},{end:1},{x:NaN},{width:0},{color:'url(file:///etc/passwd)'},{enter:'bad'},{text:'x'.repeat(501)},{keyframes:[{at:.5},{at:.5}]}])assert.throws(()=>graphic(patch),{statusCode:400});
  assert.throws(()=>validateGraphics([g,g],15),/duplicate/);
  assert.equal(validateGraphics([],15).length,0);
  const svg=graphicsSvg([graphic({text:'<script>alert("hi")</script> & hello'})],2);
  assert.ok(!svg.includes('<script>'));assert.ok(svg.includes('&lt;'));
});

test('one animation clock spans cuts, and short clips compress entrance and exit',()=>{
  const g=graphic({start:3,end:13,enter:'slide',exit:'fade'});
  assert.equal(graphicPose(g,5).opacity,1);assert.equal(graphicPose(g,10).opacity,1);
  assert.equal(graphicPose(g,5).y,g.y);assert.equal(graphicsSvg([g],13).includes('<text'),false);
  const short=graphic({start:1,end:1.2,enterDuration:1,exitDuration:1});
  assert.ok(graphicPose(short,1.1).opacity>.999);
  const keyed=graphic({enter:'none',exit:'none',keyframes:[{at:0,x:.1,y:.2,scale:1,rotation:0,opacity:1},{at:1,x:.9,y:.8,scale:2,rotation:90,opacity:.5}]});
  assert.equal(graphicPose(keyed,3).x,.5);
});

test('dragging, snapping, trimming and grouped moves preserve bounds',()=>{
  const a=graphic({id:'a',start:3,end:13,groupId:'group'}),b=graphic({id:'b',start:2,end:6,groupId:'group'});
  let next=moveGraphicTime([a,b],'a','move',-5,15);assert.equal(next[0].start,1);assert.equal(next[1].start,0);
  next=moveGraphicTime([a],'a','start',20,15);assert.ok(next[0].end-next[0].start>=1/30-1e-6);
  next=moveGraphicTime([a],'a','move',.92,15,30,[4],.1);assert.equal(next[0].start,4);assert.equal(next[0].end,14);
  assert.deepEqual(moveGraphicTime([a,{...b,locked:true}],'a','move',1,15),[a,{...b,locked:true}]);
});

test('graphics persist independently of split/deleted scenes and reject stale or locked saves',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'graphics-save-')),previous=apiConfig.jobsDir;apiConfig.jobsDir=root;
  try{
    const m=createManifest('graphics-test');m.status='DRAFT_READY';m.scenes=Array.from({length:3},(_,i)=>({scene_id:i+1,type:'quote',quoteStyleId:'classic',quoteText:'Example',start_sec:i*5,end_sec:(i+1)*5,duration_sec:5,transition:{type:'fade',duration_sec:.5}}));m.plan={scenes:structuredClone(m.scenes)};m.sceneChoices={1:'quote',2:'quote',3:'quote'};saveManifest(m.id,m);
    let result=saveGraphics(m.id,{graphics:[graphic({start:3,end:13})],expectedUpdatedAt:m.updatedAt});
    assert.equal(result.artifacts.needsRegeneration,true);assert.deepEqual(loadManifest(m.id).graphics,result.graphics);
    assert.throws(()=>saveGraphics(m.id,{graphics:[],expectedUpdatedAt:'stale'}),{statusCode:409});
    result=splitScene(m.id,2,7.5,result.updatedAt).project;assert.equal(result.graphics[0].end,13);
    result=deleteScene(m.id,2,result.updatedAt).project;assert.equal(result.graphics[0].start,3);assert.equal(result.graphics[0].end,13);
    result.status='FINAL_RUNNING';saveManifest(m.id,result);assert.throws(()=>saveGraphics(m.id,{graphics:[],expectedUpdatedAt:result.updatedAt}),{statusCode:409});
  }finally{apiConfig.jobsDir=previous;fs.rmSync(root,{recursive:true,force:true});}
});

test('real export composites only inside the graphic interval and preserves audio',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'graphics-render-'));
  try{
    const input=path.join(root,'base.mp4'),output=path.join(root,'output.mp4');
    execFileSync('ffmpeg',['-v','error','-y','-f','lavfi','-i','color=black:s=320x180:r=30:d=2','-f','lavfi','-i','sine=frequency=440:duration=2','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac','-shortest',input]);
    const g=graphic({type:'rectangle',start:.5,end:1.5,x:.5,y:.5,width:.5,height:.5,background:'#ff0000',backgroundOpacity:1,color:'#ff0000',enter:'none',exit:'none'});
    await compositeGraphics(input,output,[g],{width:320,height:180,fps:30,duration:2});
    const sample=time=>execFileSync('ffmpeg',['-v','error','-ss',String(time),'-i',output,'-frames:v','1','-vf','crop=2:2:160:90','-f','rawvideo','-pix_fmt','rgb24','pipe:1']);
    assert.ok(sample(.2)[0]<20);assert.ok(sample(1)[0]>220);assert.ok(sample(1.7)[0]<20);
    const info=JSON.parse(execFileSync('ffprobe',['-v','error','-show_streams','-of','json',output]));assert.ok(info.streams.some(s=>s.codec_type==='audio'));
    assert.equal(Number(info.streams.find(s=>s.codec_type==='video').nb_frames),60);
    const final=await applyProjectGraphics(input,[g]);assert.equal(await applyProjectGraphics(input,[g]),final);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('range review renders all three scenes and caches the background across graphic edits',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'graphics-preview-')),previous=apiConfig.jobsDir;apiConfig.jobsDir=root;
  try{
    const m=createManifest('range-test');m.status='DRAFT_READY';m.scenes=Array.from({length:3},(_,i)=>({scene_id:i+1,type:'quote',quoteStyleId:'classic',quoteText:`Scene ${i+1}`,quoteFields:{text:`Scene ${i+1}`},start_sec:i,end_sec:i+1,duration_sec:1,transition:{type:'fade',duration_sec:.5}}));m.plan={scenes:structuredClone(m.scenes)};m.sceneChoices={1:'quote',2:'quote',3:'quote'};m.graphics=validateGraphics([{...createGraphic('title',.2,3,'spanning'),end:2.8}],3);saveManifest(m.id,m);
    const first=await renderProjectPreview(m.id,{start:.2,end:2.8,includeGraphics:true});
    assert.equal(first.durationSec,2.6);assert.equal(first.start,.2);
    const dir=path.join(getJobPaths(m.id).outDir,'project-previews');const folders=fs.readdirSync(dir);assert.equal(folders.length,1);
    const base=path.join(dir,folders[0],'background.mp4'),modified=fs.statSync(base).mtimeMs;
    assert.deepEqual(await renderProjectPreview(m.id,{start:.2,end:2.8,includeGraphics:true}),first);
    m.graphics[0].color='#ffcc00';saveManifest(m.id,m);
    const second=await renderProjectPreview(m.id,{start:.2,end:2.8,includeGraphics:true});assert.notEqual(second.url,first.url);assert.equal(fs.statSync(base).mtimeMs,modified);
    const output=path.join(getJobPaths(m.id).jobDir,second.url.split(`/api/media/${m.id}/`)[1]);
    const info=JSON.parse(execFileSync('ffprobe',['-v','error','-show_streams','-of','json',output]));assert.equal(Number(info.streams[0].nb_frames),78);
  }finally{apiConfig.jobsDir=previous;fs.rmSync(root,{recursive:true,force:true});}
});

test('final pipeline includes graphics after transitions and before the optional black ending',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'graphics-final-')),previous=apiConfig.jobsDir;apiConfig.jobsDir=root;
  const {config}=await import('../config.mjs');const previousProfile=config.video.renderProfiles.final;const previousKey=process.env.OPENAI_API_KEY;
  config.video.renderProfiles.final={...previousProfile,width:320,height:180,fps:30};
  if(!previousKey)process.env.OPENAI_API_KEY='test-no-network';
  try{
    const {generateFinalVideo}=await import('./pipeline-backend.service.mjs');
    const m=createManifest('final-graphics-test');m.status='DRAFT_READY';m.exportOptions={endScreen:true};
    m.scenes=Array.from({length:3},(_,i)=>({scene_id:i+1,type:'quote',quoteStyleId:'classic',quoteText:`Scene ${i+1}`,start_sec:i,end_sec:i+1,duration_sec:1,transition:{type:'fade',duration_sec:.5}}));m.plan={scenes:structuredClone(m.scenes)};m.sceneChoices={1:'quote',2:'quote',3:'quote'};
    const g=graphic({type:'rectangle',start:.5,end:2.5,x:.5,y:.5,width:.5,height:.5,background:'#ff0000',backgroundOpacity:1,color:'#ff0000',enter:'none',exit:'none'});m.graphics=[g];saveManifest(m.id,m);
    const voice=path.join(getJobPaths(m.id).inputDir,'voiceover.mp3');
    execFileSync('ffmpeg',['-v','error','-y','-f','lavfi','-i','sine=frequency=440:duration=3','-c:a','libmp3lame',voice]);m.inputs.voiceover=voice;saveManifest(m.id,m);
    const saved=await generateFinalVideo(m.id);assert.equal(saved.status,'FINAL_READY');
    const output=saved.artifacts.finalMp4;
    const pixel=execFileSync('ffmpeg',['-v','error','-ss','1.1','-i',output,'-frames:v','1','-vf','crop=2:2:160:90','-f','rawvideo','-pix_fmt','rgb24','pipe:1']);assert.ok(pixel[0]>220&&pixel[1]<30);
    const tail=execFileSync('ffmpeg',['-v','error','-ss','5','-i',output,'-frames:v','1','-vf','crop=2:2:160:90','-f','rawvideo','-pix_fmt','rgb24','pipe:1']);assert.ok(tail[0]<10);
    const info=JSON.parse(execFileSync('ffprobe',['-v','error','-show_streams','-of','json',output]));assert.ok(info.streams.some(s=>s.codec_type==='audio'));assert.ok(Math.abs(Number(info.streams.find(s=>s.codec_type==='video').duration)-13)<.1);
  }finally{config.video.renderProfiles.final=previousProfile;if(previousKey===undefined)delete process.env.OPENAI_API_KEY;apiConfig.jobsDir=previous;fs.rmSync(root,{recursive:true,force:true});}
});


test('every preset, effect and bundled font produces visible, valid transparent artwork',()=>{
  for(const type of GRAPHIC_TYPES)for(const effect of GRAPHIC_EFFECTS)for(const font of Object.keys(GRAPHIC_FONTS)){
    const g=graphic({...createGraphic(type,1,15,'art'),font,enter:effect,exit:effect,outlineWidth:2});
    const rendered=new Resvg(graphicsSvg([g],2,320,180),{font:{fontFiles:graphicsFontFiles,loadSystemFonts:false}}).render();
    const pixels=rendered.pixels;
    assert.ok(pixels.some((value,index)=>index%4===3&&value>0),`${type}/${effect}/${font} must draw visible pixels`);
    assert.equal(rendered.width,320);assert.equal(rendered.height,180);
  }
});
