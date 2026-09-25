import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {apiConfig} from '../config/api.config.mjs';
import {createManifest,ensureJobDirs,saveManifest,loadManifest} from './job-store.service.mjs';
import {deleteScene} from './pipeline-backend.service.mjs';

test('deletion persists, clears all old clip IDs, retains media and invalidates previous final output',()=>{
  const old=apiConfig.jobsDir;
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'scene-delete-test-'));
  apiConfig.jobsDir=temp;
  try {
    const m=createManifest('deletion');
    m.status='DRAFT_READY';
    const dirs=ensureJobDirs(m.id);
    const asset=path.join(dirs.customDir,'shared.mp4');
    fs.writeFileSync(asset,'shared media');
    m.scenes=[1,2,3].map((id)=>({scene_id:id,type:'video',start_sec:(id-1)*3,end_sec:id*3,duration_sec:3,assetPath:asset}));
    m.plan={scenes:structuredClone(m.scenes)};
    m.sceneChoices={1:'video',2:'video',3:'video'};
    saveManifest(m.id,m);
    const clips=path.join(dirs.outDir,'clips');
    fs.mkdirSync(clips);
    for(const id of [1,2,3]) fs.writeFileSync(path.join(clips,`scene_0${id}.mp4`),'old');
    deleteScene(m.id,2,m.updatedAt);
    const loaded=loadManifest(m.id);
    assert.deepEqual(loaded.scenes.map(s=>[s.scene_id,s.duration_sec]),[[1,3],[2,6]]);
    assert.equal(loaded.artifacts.needsRegeneration,true);
    assert.deepEqual(fs.readdirSync(clips),[]);
    assert.equal(fs.readFileSync(asset,'utf8'),'shared media');
    assert.throws(()=>deleteScene(m.id,1,m.updatedAt),{statusCode:409});
  } finally { apiConfig.jobsDir=old; fs.rmSync(temp,{recursive:true,force:true}); }
});
