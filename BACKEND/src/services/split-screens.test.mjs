import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execSync,execFileSync} from 'node:child_process';
import {once} from 'node:events';
import {SPLIT_STYLES,splitPosition,splitSlot,splitPanelAt,splitViewport,splitImageGeometry} from '../../../SHARED/split-screens.mjs';
import {config} from '../config.mjs';
import {imageMotionCommand} from './image-motion.service.mjs';
import {makeClipsStep} from '../steps/03-make-clips.mjs';
import {apiConfig} from '../config/api.config.mjs';
import {createApp} from '../app.mjs';
import {createManifest,saveManifest,loadManifest,ensureJobDirs,registerUploadedMedia,mediaUrl} from './job-store.service.mjs';
const video={width:320,height:180,fps:30,codec:'libx264',encodePreset:'ultrafast',clipCacheEnabled:true};
function fixture(dir){return ['red','blue','lime'].map((color,i)=>{const file=path.join(dir,`image '${i}.png`);execFileSync('ffmpeg',['-v','error','-y','-f','lavfi','-i',`color=c=${color}:s=360x240`,'-frames:v','1',file]);return {path:file};});}
const probe=file=>JSON.parse(execFileSync('ffprobe',['-v','error','-show_streams','-of','json',file])).streams;
const decode=(file,t)=>execFileSync('ffmpeg',['-v','error','-ss',String(t),'-i',file,'-frames:v','1','-f','rawvideo','-pix_fmt','rgb24','-']);
test('all ten split templates render independent images, exact duration and authored motion',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),"split render's "));
 try{
  const images=fixture(root);assert.equal(SPLIT_STYLES.length,10);
  for(const style of SPLIT_STYLES){
   assert.equal(new Set(style.motion.layers.map(splitSlot)).size,style.panels);
   for(const parent of style.motion.layers){const layer=parent.child||parent;for(const key of layer.keys||[])assert.deepEqual(splitPosition(layer,key.t),key.position);}
   const clip=path.join(root,style.id+'.mp4');
   execSync(imageMotionCommand(video,config.video.imageAnimationProfiles[style.id],{img:images[0].path,clip,durationSec:2,splitImages:images}),{stdio:'pipe'});
   const streams=probe(clip);assert.equal(streams.length,1);assert.equal(streams[0].nb_frames,'60');
   const pixels=decode(clip,1.7);let red=0,blue=0,green=0;
   for(let p=0;p<pixels.length;p+=3){if(pixels[p]>180&&pixels[p+1]<70&&pixels[p+2]<70)red++;if(pixels[p+2]>180&&pixels[p]<70)blue++;if(pixels[p+1]>180&&pixels[p]<70)green++;}
   assert.ok(red>pixels.length/30&&blue>pixels.length/30,`${style.id} exposes both independent images`);
   for(const [x,y] of [[0,36],[319,36],[0,144],[319,144],[64,0],[256,0],[64,179],[256,179]]){const p=(y*320+x)*3;assert.ok(Math.min(...pixels.subarray(p,p+3))<100,`${style.id} removes outside frame at ${x},${y}`);}
   if(style.panels===3)assert.ok(green>pixels.length/30,'third image renders');
  }
  const s=SPLIT_STYLES[0];
  for(const [duration,fps,frames] of [[.001,60,1],[.7,24,17],[4,60,240]]){
   const clip=path.join(root,'duration.mp4');execSync(imageMotionCommand({...video,fps},config.video.imageAnimationProfiles[s.id],{img:images[0].path,clip,durationSec:duration,splitImages:images}),{stdio:'pipe'});assert.equal(Number(probe(clip)[0].nb_frames),frames);
  }
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('split panel routes persist independent selection/uploads and invalidate preview/final caches',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'split-api-')),old=apiConfig.jobsDir;apiConfig.jobsDir=root;let server;
 try{
  const m=createManifest('splits'),p=ensureJobDirs(m.id),images=fixture(p.customDir);
  m.status='DRAFT_READY';m.scenes=[{scene_id:1,type:'image',imageAnimationStyle:'split_01',assetPath:images[0].path,assetUrl:mediaUrl(m.id,images[0].path),duration_sec:.5}];m.plan={scenes:[{scene_id:1,duration_sec:.5,scene_type:'image'}]};m.sceneChoices={1:'image'};
  for(const [i,img] of images.entries())registerUploadedMedia(m,img.path,'image',`Image ${i+1}.png`);saveManifest(m.id,m);
  server=createApp().listen(0,'127.0.0.1');await once(server,'listening');const base=`http://127.0.0.1:${server.address().port}/api/projects/splits/scenes/1`;
  const patch=body=>fetch(base+'/split-images',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  for(let i=0;i<3;i++){const response=await patch({slot:i,matchId:m.uploadedMedia[i].id});assert.equal(response.status,200,await response.text());}
  let loaded=loadManifest(m.id);assert.equal(loaded.scenes[0].splitImages.length,3);
  let response=await patch({slot:1,x:25,y:75,zoom:1.5,background:'#123456'});assert.equal(response.status,200,await response.text());
  for(const bad of [{slot:3,matchId:m.uploadedMedia[0].id},{slot:1,matchId:'not-a-project-image'},{slot:0,x:101},{slot:0,zoom:.1},{slot:0,zoom:4},{slot:0,zoom:'2'},{slot:0,path:'/etc/passwd'},{background:'red;bad'}]){response=await patch(bad);assert.equal(response.status,400);}
  const preview=async()=>{const r=await fetch(base+'/preview',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});assert.equal(r.status,200);return (await r.json()).url;};
  assert.equal(loadManifest(m.id).scenes[0].splitImages[1].zoom,1.5);
  const first=await preview();assert.equal(await preview(),first);
  await patch({slot:1,zoom:.5});assert.notEqual(await preview(),first,'zoom invalidates preview and renders below cover');
  await patch({slot:1,matchId:m.uploadedMedia[0].id});assert.notEqual(await preview(),first,'changing the second image invalidates the preview');
  const form=new FormData();form.append('media',new Blob([fs.readFileSync(images[2].path)],{type:'image/png'}),'third.png');response=await fetch(base+'/split-images/2',{method:'POST',body:form});assert.equal(response.status,200,await response.text());
  loaded=loadManifest(m.id);assert.equal(loaded.scenes[0].splitImages[2].filename,'third.png');
  const clip=path.join(root,'final.mp4');let renders=0;
  const ctx={config:{video:{...video,imageAnimationProfiles:config.video.imageAnimationProfiles}},runOptions:{},plan:loaded.plan,sceneVisualChoices:{1:'image'},sceneVisuals:{1:{...loaded.scenes[0],path:loaded.scenes[0].assetPath,animationStyle:'split_01'}},fs:{exists:fs.existsSync},paths:{outDir:root,clipCacheDir:path.join(root,'cache'),sceneClip:()=>clip},ffmpeg:{execAsync:async cmd=>{renders++;execSync(cmd,{stdio:'pipe'});}}};
  fs.mkdirSync(ctx.paths.clipCacheDir);await makeClipsStep(ctx);fs.rmSync(clip);await makeClipsStep(ctx);assert.equal(renders,1);
  ctx.sceneVisuals[1].splitImages[1]={path:images[1].path};fs.rmSync(clip);await makeClipsStep(ctx);assert.equal(renders,2,'second image changes final cache identity');
  ctx.sceneVisuals[1].splitImages[1].zoom=1.8;fs.rmSync(clip);await makeClipsStep(ctx);assert.equal(renders,3,'zoom changes final cache identity');
  fs.rmSync(ctx.sceneVisuals[1].splitImages[2].path);fs.rmSync(clip);await assert.rejects(()=>makeClipsStep(ctx),/Image 3 is missing/);
 }finally{if(server)await new Promise(r=>server.close(r));apiConfig.jobsDir=old;fs.rmSync(root,{recursive:true,force:true});}
});

test('preview hit testing and zoom geometry agree with panel coordinates',()=>{
 for(const style of SPLIT_STYLES){const seen=new Set(),v=splitViewport(style);for(let y=v.y+30;y<v.y+v.height;y+=60)for(let x=v.x+30;x<v.x+v.width;x+=60){const slot=splitPanelAt(style,x,y);if(slot!==null)seen.add(slot);}assert.equal(seen.size,style.panels,style.id);}
 assert.deepEqual(splitImageGeometry(400,200,800,600,null),{width:400,height:300,x:0,y:-50});
 assert.deepEqual(splitImageGeometry(400,200,800,600,{zoom:2,x:25,y:75}),{width:800,height:600,x:-100,y:-300});
 assert.deepEqual(splitImageGeometry(400,200,800,600,{zoom:.5,x:25,y:75}),{width:200,height:150,x:50,y:37.5});
});

test('both diagonal panels fit their visible width and pan independently at default zoom',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'diagonal-framing-'));
 try{
  const width=1920,height=1080,pixels=Buffer.alloc(width*height*3);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){const p=(y*width+x)*3;pixels[p]=Math.round(x/width*255);pixels[p+1]=100;pixels[p+2]=60;}
  const image=path.join(root,'gradient.ppm');fs.writeFileSync(image,Buffer.concat([Buffer.from(`P6\n${width} ${height}\n255\n`),pixels]));
  for(const style of SPLIT_STYLES.slice(0,2)){
   const render=(slot,x)=>{const clip=path.join(root,`${style.id}-${slot}-${x}.mp4`);const images=[{path:image,x:0},{path:image,x:0}];images[slot].x=x;execSync(imageMotionCommand(video,config.video.imageAnimationProfiles[style.id],{img:image,clip,durationSec:2,splitImages:images}),{stdio:'pipe'});return decode(clip,1.7);};
   const baseline=render(0,0);
   for(const slot of [0,1]){
    const moved=render(slot,100),sample=(slot===0?70:250),p=(90*320+sample)*3,other=(90*320+(slot===0?250:70))*3;
    assert.ok(moved[p]-baseline[p]>25,`${style.id} image ${slot+1} pans across its own width at 100% zoom`);
    assert.ok(Math.abs(moved[other]-baseline[other])<5,'moving one image leaves the other unchanged');
   }
  }
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
