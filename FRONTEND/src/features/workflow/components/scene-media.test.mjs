import test from 'node:test';
import assert from 'node:assert/strict';
import { detectSceneMediaType } from './scene-media.mjs';

test('replacement media detection uses MIME and falls back to extensions when unavailable', () => {
  assert.equal(detectSceneMediaType({type:'video/quicktime', name:'clip.mov'}), 'video');
  assert.equal(detectSceneMediaType({type:'image/jpeg', name:'photo.jpg'}), 'image');
  assert.equal(detectSceneMediaType({type:'', name:'CLIP.MP4'}), 'video');
  assert.equal(detectSceneMediaType({type:'application/octet-stream', name:'photo.PNG'}), 'image');
  assert.equal(detectSceneMediaType({type:'audio/mpeg', name:'audio.mp3'}), null);
  assert.equal(detectSceneMediaType({type:'text/plain', name:'fake.jpg'}), null);
  assert.equal(detectSceneMediaType({type:'', name:'file.unknown'}), null);
});
