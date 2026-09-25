import test from 'node:test';
import assert from 'node:assert/strict';
import {splitTarget,isSplitShortcut} from './scene-split.mjs';
const scenes=[{scene_id:1,start_sec:0,end_sec:4},{scene_id:2,start_sec:4,end_sec:8}];
test('split targets use the playhead, with strict millisecond-safe one-second margins',()=>{
  for(const time of [0,1,1.0004,3,4,5,7,8,NaN]) assert.equal(splitTarget(scenes,time),null);
  assert.equal(splitTarget(scenes,1.001).scene_id,1);
  assert.equal(splitTarget(scenes,6).scene_id,2);
});
test('shortcuts support Windows and Mac, excluding typing, repeats and other chords',()=>{
  const event={key:'b',ctrlKey:true,target:{closest:()=>null}};
  assert.equal(isSplitShortcut(event),true);
  assert.equal(isSplitShortcut({...event,ctrlKey:false,metaKey:true}),true);
  for(const props of [{ctrlKey:false},{repeat:true},{isComposing:true},{altKey:true},{shiftKey:true},{target:{closest:()=>({})}}]) assert.equal(Boolean(isSplitShortcut({...event,...props})),false);
});
