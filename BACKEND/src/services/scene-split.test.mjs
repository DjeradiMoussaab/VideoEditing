import test from 'node:test';
import assert from 'node:assert/strict';
import { splitSceneManifest } from './scene-split.service.mjs';

function fixture(type = 'video') {
  const scenes = [{ scene_id: 1, start_sec: 0, end_sec: 6, duration_sec: 6, type,
    assetPath: '/media/original.mp4', assetUrl: '/media/original.mp4', mediaOffsetSec: 2,
    quoteText: 'Keep this quote', quoteAuthor: 'Author', imageAnimationStyle: 'style',
    stockSuggestions: [{id:'stock'}], selectedSuggestionId: 'stock', referenceMatches: [{id:'ref'}] },
    {scene_id:2, start_sec:6,end_sec:9,duration_sec:3,type:'image'}];
  return { status:'FINAL_READY',updatedAt:'revision', scenes, plan:{scenes:structuredClone(scenes)},sceneChoices:{1:type,2:'image'},artifacts:{finalUrl:'/previous.mp4'} };
}

test('splits all scene types, preserving media/settings, chronology, numbering and total duration', () => {
  for (const type of ['image','video','quote']) {
    const original=fixture(type), snapshot=structuredClone(original);
    const {project,newSceneId}=splitSceneManifest(original,1,2.125,'revision');
    assert.deepEqual(original,snapshot);
    assert.equal(newSceneId,2);
    assert.deepEqual(project.scenes.map(s=>[s.scene_id,s.start_sec,s.end_sec,s.duration_sec]),[[1,0,2.125,2.125],[2,2.125,6,3.875],[3,6,9,3]]);
    assert.deepEqual(project.plan.scenes.map(s=>s.duration_sec),[2.125,3.875,3]);
    assert.equal(project.scenes[1].mediaOffsetSec,4.125);
    for (const field of ['assetPath','assetUrl','quoteText','quoteAuthor','imageAnimationStyle','stockSuggestions','selectedSuggestionId','referenceMatches']) assert.deepEqual(project.scenes[1][field],snapshot.scenes[0][field]);
    assert.deepEqual(project.sceneChoices,{1:type,2:type,3:'image'});
    assert.equal(project.artifacts.finalUrl,'/previous.mp4');
    assert.equal(project.artifacts.needsRegeneration,true);
    project.scenes[1].stockSuggestions[0].id='changed';
    assert.equal(project.scenes[0].stockSuggestions[0].id,'stock');
  }
});

test('rejects edges, exact one-second results and sub-millisecond rounding into one second', () => {
  for (const time of [-1,0,1,1.0004,5,5.5,6,9,NaN,Infinity,null,'2']) assert.throws(()=>splitSceneManifest(fixture(),1,time,'revision'));
  for (const time of [1.001,4.999]) assert.doesNotThrow(()=>splitSceneManifest(fixture(),1,time,'revision'));
});
test('rejects stale requests, missing scenes and in-progress renders', () => {
  assert.throws(()=>splitSceneManifest(fixture(),1,3,'old'), {statusCode:409});
  assert.throws(()=>splitSceneManifest(fixture(),99,3,'revision'), {statusCode:404});
  for (const status of ['FINAL_RUNNING','DRAFT_RUNNING']) assert.throws(()=>splitSceneManifest({...fixture(),status},1,3,'revision'),{statusCode:409});
});
test('repeated splits accumulate offsets without shifting later scenes', () => {
  const first=splitSceneManifest(fixture(),1,2,'revision').project;
  const second=splitSceneManifest(first,2,4,'revision').project;
  assert.deepEqual(second.scenes.map(s=>s.start_sec),[0,2,4,6]);
  assert.equal(second.scenes[2].mediaOffsetSec,6);
  assert.equal(second.scenes.reduce((sum,s)=>sum+s.duration_sec,0),9);
});
