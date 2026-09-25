import test from 'node:test';
import assert from 'node:assert/strict';
import {deleteSceneManifest} from './scene-delete.service.mjs';
import {splitSceneManifest} from './scene-split.service.mjs';
function fixture() {
  const scenes=[{scene_id:1,type:'image',start_sec:0,end_sec:2.125,duration_sec:2.125,assetPath:'first'},
    {scene_id:2,type:'video',start_sec:2.125,end_sec:6,duration_sec:3.875,assetPath:'second',mediaOffsetSec:1.25},
    {scene_id:3,type:'quote',start_sec:6,end_sec:10,duration_sec:4,assetPath:'third',quoteText:'Preserve',quoteAuthor:'Author'}];
  return {status:'DRAFT_READY',updatedAt:'rev',scenes,plan:{scenes:structuredClone(scenes)},sceneChoices:{1:'image',2:'video',3:'quote'},artifacts:{finalUrl:'previous'}};
}
for (const [id,timings,assets,selected] of [
  [1,[[0,6,6],[6,10,4]],['second','third'],1],
  [2,[[0,2.125,2.125],[2.125,10,7.875]],['first','third'],2],
  [3,[[0,2.125,2.125],[2.125,10,7.875]],['first','second'],2]
]) test(`deleting scene ${id} gives its time to the correct neighbour`,()=>{
  const input=fixture(),before=structuredClone(input);
  const result=deleteSceneManifest(input,id,'rev');
  assert.deepEqual(input,before);
  assert.equal(result.selectedSceneId,selected);
  const project=result.project;
  for (const scenes of [project.scenes,project.plan.scenes]) {
    assert.deepEqual(scenes.map(s=>[s.start_sec,s.end_sec,s.duration_sec]),timings);
    assert.deepEqual(scenes.map(s=>s.scene_id),[1,2]);
    assert.equal(scenes.reduce((sum,s)=>sum+s.duration_sec,0),10);
  }
  assert.deepEqual(project.scenes.map(s=>s.assetPath),assets);
  assert.deepEqual(project.sceneChoices,Object.fromEntries(project.scenes.map(s=>[s.scene_id,s.type])));
  assert.equal(project.artifacts.needsRegeneration,true);
  assert.equal(project.artifacts.finalUrl,'previous');
});
test('cannot delete final remaining scene, stale revisions, missing scenes or scenes during rendering',()=>{
  const input=fixture();
  for(const status of ['DRAFT_RUNNING','FINAL_RUNNING']) assert.throws(()=>deleteSceneManifest({...input,status},1,'rev'),{statusCode:409});
  assert.throws(()=>deleteSceneManifest(input,1,'old'),{statusCode:409});
  assert.throws(()=>deleteSceneManifest(input,10,'rev'),{statusCode:404});
  const two=deleteSceneManifest(input,1,'rev').project;
  const one=deleteSceneManifest(two,2,'rev').project;
  assert.equal(one.scenes[0].duration_sec,10);
  assert.throws(()=>deleteSceneManifest(one,1,'rev'),/only remaining/);
});
test('split then delete preserves chronology, media ownership and original asset mapping',()=>{
  const split=splitSceneManifest(fixture(),2,4,'rev').project;
  const result=deleteSceneManifest(split,1,'rev').project;
  assert.deepEqual(result.scenes.map(s=>s.originalSceneId),[2,2,3]);
  assert.deepEqual(result.scenes.map(s=>[s.start_sec,s.end_sec]),[[0,4],[4,6],[6,10]]);
  assert.equal(result.scenes[1].mediaOffsetSec,3.125);
});
