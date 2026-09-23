import test from 'node:test';
import assert from 'node:assert/strict';
import { audioRegions, waveformPeaks } from './timeline-audio.mjs';

test('inserted clips pause narration without consuming source audio', () => {
  const scenes = [{start_sec:0,duration_sec:2}, {start_sec:2,duration_sec:3,isInsertedScene:true}, {start_sec:5,duration_sec:4}];
  assert.deepEqual(audioRegions(scenes, 5).map(r => [r.start, r.source, r.audible]), [[0,0,2],[2,2,0],[5,2,3]]);
});
test('multiple insertions and exhausted source remain silent', () => {
  const scenes = [{start_sec:0,duration_sec:1,isInsertedScene:true}, {start_sec:1,duration_sec:2}, {start_sec:3,duration_sec:1,source:'inserted_video'}, {start_sec:4,duration_sec:2}, {start_sec:6,duration_sec:1}];
  assert.deepEqual(audioRegions(scenes, 3).map(r => r.audible), [0,2,0,1,0]);
});
test('waveform preserves negative peaks and both channels', () => {
  const buffer = {duration:1,sampleRate:4,numberOfChannels:2,getChannelData: i => new Float32Array(i ? [0,-1,0,0] : [0.1,0.2,0.5,0])};
  assert.deepEqual(Array.from(waveformPeaks(buffer,2).peaks), [1,0.5]);
});
