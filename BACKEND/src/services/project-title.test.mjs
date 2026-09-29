import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {apiConfig} from '../config/api.config.mjs';
import {createManifest,saveManifest,loadManifest,ensureJobDirs} from './job-store.service.mjs';
import {renameProject,projectVideoFilename} from './project-title.service.mjs';
import {createApp} from '../app.mjs';

test('project numbers survive deletion, migrate older projects, and names survive stale worker writes',()=>{
  const original=apiConfig.jobsDir,dir=fs.mkdtempSync(path.join(os.tmpdir(),'project-titles-'));
  apiConfig.jobsDir=dir;
  try{
    for(const [id,date] of [['older','2020-01-01'],['newer','2020-02-01']]){
      const paths=ensureJobDirs(id);fs.writeFileSync(paths.manifestPath,JSON.stringify({id,createdAt:date,inputs:{},scenes:[]}));
    }
    assert.equal(loadManifest('newer').title,'Project 2');
    assert.equal(loadManifest('older').title,'Project 1');
    const third=createManifest('third');saveManifest('third',third);
    assert.equal(third.title,'Project 3');
    renameProject('third','A beautiful story');
    third.status='FINAL_RUNNING';saveManifest('third',third);
    assert.equal(loadManifest('third').title,'A beautiful story');
    assert.equal(loadManifest('third').status,'FINAL_RUNNING');
    fs.rmSync(path.join(dir,'third'),{recursive:true});
    assert.equal(createManifest('fourth').title,'Project 4');
    assert.equal(createManifest('fourth').projectNumber,4);
    assert.equal(loadManifest('newer').titleIsCustom,false);
    assert.equal(renameProject('newer','Project 2').titleIsCustom,true,'explicitly keeping the default confirms the download name');
    assert.throws(()=>renameProject('newer','   '),{statusCode:400});
    assert.throws(()=>renameProject('newer','bad\nname'),{statusCode:400});
    assert.throws(()=>renameProject('../outside','Bad'),{statusCode:400});
    assert.equal(projectVideoFilename({title:'A/B: story?',projectNumber:1}),'A-B- story-.mp4');
    assert.equal(projectVideoFilename({title:'Été à Paris',projectNumber:1},2),'Été à Paris - v2.mp4');
  }finally{apiConfig.jobsDir=original;fs.rmSync(dir,{recursive:true,force:true});}
});

test('title API allows renaming while rendering and downloads use the project title',async()=>{
  const original=apiConfig.jobsDir,dir=fs.mkdtempSync(path.join(os.tmpdir(),'project-title-api-'));
  apiConfig.jobsDir=dir;let server;
  try{
    const m=createManifest('download-test'),paths=ensureJobDirs(m.id);
    fs.writeFileSync(path.join(paths.outDir,'final.mp4'),'video bytes');
    m.status='FINAL_RUNNING';m.artifacts.finalUrl=`/api/media/${m.id}/out/final.mp4`;saveManifest(m.id,m);
    server=createApp().listen(0,'127.0.0.1');await new Promise((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject);});
    const base=`http://127.0.0.1:${server.address().port}`;
    const response=await fetch(`${base}/api/projects/${m.id}/title`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({title:'My documentary'})});
    assert.equal(response.status,200);assert.equal((await response.json()).identity.title,'My documentary');
    const download=await fetch(`${base}${m.artifacts.finalUrl}?download=1`);
    assert.equal(download.status,200);assert.match(download.headers.get('content-disposition'),/filename="My documentary.mp4"/);
    assert.equal(await download.text(),'video bytes');
    assert.equal(loadManifest(m.id).status,'FINAL_RUNNING');
  }finally{if(server)await new Promise(resolve=>server.close(resolve));apiConfig.jobsDir=original;fs.rmSync(dir,{recursive:true,force:true});}
});
