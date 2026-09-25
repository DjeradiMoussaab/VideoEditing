import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {apiConfig} from '../config/api.config.mjs';
import {createManifest,ensureJobDirs,saveManifest,loadManifest} from './job-store.service.mjs';
import {splitScene,uploadSceneVideo} from './pipeline-backend.service.mjs';

test('split persists on reload, invalidates numbered clips and keeps replacement media independent', async () => {
  const originalDir=apiConfig.jobsDir;
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'scene-split-test-'));
  apiConfig.jobsDir=temp;
  try {
    const id='split-test';
    const dirs=ensureJobDirs(id);
    const asset=path.join(dirs.customDir,'original.mp4');
    fs.writeFileSync(asset,'original video fixture');
    const manifest=createManifest(id);
    manifest.status='DRAFT_READY';
    manifest.scenes=[{scene_id:1,start_sec:0,end_sec:6,duration_sec:6,type:'video',assetPath:asset,assetUrl:'/original.mp4'}];
    manifest.plan={scenes:structuredClone(manifest.scenes)};
    manifest.sceneChoices={1:'video'};
    saveManifest(id,manifest);
    fs.mkdirSync(path.join(dirs.outDir,'clips'));
    const clip=path.join(dirs.outDir,'clips','scene_01.mp4');
    fs.writeFileSync(clip,'old clip');
    const result=splitScene(id,1,3,manifest.updatedAt);
    assert.equal(result.newSceneId,2);
    assert.equal(fs.existsSync(clip),false);
    assert.deepEqual(loadManifest(id).scenes.map(s=>[s.scene_id,s.duration_sec,s.mediaOffsetSec||0]),[[1,3,0],[2,3,3]]);
    assert.throws(()=>splitScene(id,1,1.5,manifest.updatedAt),{statusCode:409});
    const updated=await uploadSceneVideo(id,2,{buffer:Buffer.from('replacement')});
    assert.notEqual(updated.scenes[0].assetPath,updated.scenes[1].assetPath);
    assert.equal(fs.readFileSync(updated.scenes[0].assetPath,'utf8'),'original video fixture');
    assert.equal(updated.scenes[1].mediaOffsetSec,0);
  } finally {
    apiConfig.jobsDir=originalDir;
    fs.rmSync(temp,{recursive:true,force:true});
  }
});
