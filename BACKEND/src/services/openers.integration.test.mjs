import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {once} from 'node:events';
import {apiConfig} from '../config/api.config.mjs';
import {createApp} from '../app.mjs';
import {createManifest, saveManifest, loadManifest} from './job-store.service.mjs';
import {QUOTE_STYLES, OPENER_STYLES} from '../../../SHARED/quote-styles.mjs';
import {splitScene, uploadSceneImage, uploadSceneVideo} from './pipeline-backend.service.mjs';

test('Openers migrate legacy projects and work through HTTP editing, preview and background routes', async () => {
  const old=apiConfig.jobsDir, dir=fs.mkdtempSync(path.join(os.tmpdir(),'openers-'));
  apiConfig.jobsDir=dir;
  let server;
  try {
    assert.deepEqual(new Set(OPENER_STYLES.map(s=>s.id)),new Set(['typography_split','lifestyle_intro','lifestyle_minimal','lifestyle_focus','lifestyle_logo']));
    assert.ok(!QUOTE_STYLES.some(s=>s.id==='typography_split'));
    const m=createManifest('opener-test');
    m.status='DRAFT_READY';
    m.scenes=[{scene_id:1,type:'quote',quoteStyleId:'typography_split',quoteText:'An opening',quoteFields:{text:'An opening',highlightWords:'1'},start_sec:0,end_sec:4,duration_sec:4,mediaOffsetSec:2}];
    m.plan={scenes:structuredClone(m.scenes)}; m.sceneChoices={1:'quote'};
    saveManifest(m.id,m);
    const migrated=loadManifest(m.id);
    assert.equal(migrated.scenes[0].type,'opener');
    assert.equal(migrated.sceneChoices[1],'opener');
    assert.equal(migrated.plan.scenes[0].scene_type,'opener');
    assert.deepEqual(migrated.scenes[0].quoteFields,m.scenes[0].quoteFields);
    assert.equal(migrated.scenes[0].mediaOffsetSec,2);
    server=createApp().listen(0,'127.0.0.1'); await once(server,'listening');
    const base=`http://127.0.0.1:${server.address().port}/api/projects/${m.id}`;
    async function request(suffix,body,method='POST',status=200){
      const res=await fetch(base+suffix,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
      const data=await res.json(); assert.equal(res.status,status,JSON.stringify(data)); return data;
    }
    await request('/scenes/1',{quoteStyleId:'classic'},'PATCH',400);
    await request('/scenes/1/preview',{quoteStyleId:'classic'},'POST',400);
    await request('/scenes/1',{quoteFields:{text:'Welcome to the story',highlightWords:'1,2'}},'PATCH');
    const preview=await request('/scenes/1/preview',{});
    assert.ok(JSON.stringify(preview).includes('.mp4'));
    await request('/scenes/1',{type:'quote'},'PATCH');
    assert.equal(loadManifest(m.id).scenes[0].quoteStyleId,'classic');
    await request('/scenes/1',{type:'opener'},'PATCH');
    assert.equal(loadManifest(m.id).scenes[0].quoteStyleId,'typography_split');
    assert.equal(loadManifest(m.id).scenes[0].quoteText,'Welcome to the story');
    await uploadSceneImage(m.id,1,{buffer:Buffer.from('image fixture')});
    assert.equal(loadManifest(m.id).scenes[0].type,'opener');
    await uploadSceneVideo(m.id,1,{buffer:Buffer.from('video fixture')});
    assert.equal(loadManifest(m.id).scenes[0].type,'opener');
    await request('/scenes/1/background/clear',{});
    assert.equal(loadManifest(m.id).scenes[0].assetPath,null);
    const loaded=loadManifest(m.id);
    const split=splitScene(m.id,1,2,loaded.updatedAt);
    assert.deepEqual(split.project.scenes.map(s=>s.type),['opener','opener']);
    assert.equal(loadManifest(m.id).sceneChoices[2],'opener');
  } finally {
    if(server)await new Promise(resolve=>server.close(resolve));
    apiConfig.jobsDir=old; fs.rmSync(dir,{recursive:true,force:true});
  }
});

test('final clip rendering accepts an opener without background and preserves its type', async () => {
  const {makeClipsStep}=await import('../steps/03-make-clips.mjs');
  const {execSync,execFileSync}=await import('node:child_process');
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'opener-final-'));
  try {
    const clip=path.join(root,'scene.mp4');
    const ctx={config:{video:{width:480,height:270,fps:24,codec:'libx264',pixFmt:'yuv420p',encodePreset:'ultrafast',clipCacheEnabled:true}},runOptions:{},plan:{scenes:[{scene_id:1,duration_sec:4}]},sceneVisualChoices:{1:'opener'},sceneVisuals:{1:{type:'opener',path:null,quoteText:'Welcome to the story'}},fs:{exists:fs.existsSync},paths:{outDir:root,clipCacheDir:path.join(root,'cache'),sceneClip:()=>clip},ffmpeg:{execAsync:async command=>execSync(command,{stdio:'pipe'})}};
    await makeClipsStep(ctx);
    assert.equal(ctx.sceneVisuals[1].type,'opener');
    const meta=JSON.parse(execFileSync('ffprobe',['-v','error','-show_streams','-of','json',clip]));
    assert.equal(meta.streams[0].nb_frames,'96');
    const pixels=execFileSync('ffmpeg',['-v','error','-ss','3','-i',clip,'-frames:v','1','-pix_fmt','rgb24','-f','rawvideo','-']);
    let yellow=0; for(let i=0;i<pixels.length;i+=3)if(pixels[i]>180&&pixels[i+1]>170&&pixels[i+2]<80)yellow++;
    assert.ok(yellow>100,'Opener uses Split yellow typography through the final render path');
  } finally {fs.rmSync(root,{recursive:true,force:true});}
});
