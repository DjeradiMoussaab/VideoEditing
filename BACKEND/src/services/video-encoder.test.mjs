import test from 'node:test';
import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';

test('unavailable hardware encoder falls back to software and probes only once', async t => {
  let calls=0;
  t.mock.method(childProcess,'spawnSync',()=>{calls++;return {status:1,stderr:'Encoder unavailable'};});
  syncBuiltinESMExports();
  try {
    const {resolveVideoEncoderArgs}=await import('../utils/video-encoder.mjs?unavailable');
    for(let i=0;i<2;i++)assert.match(resolveVideoEncoderArgs({codec:'h264_videotoolbox'}),/-c:v libx264/);
    assert.equal(calls,1);
  } finally {t.mock.restoreAll();syncBuiltinESMExports();}
});

test('working hardware encoder stays enabled and software needs no probe', async t => {
  let calls=0;
  t.mock.method(childProcess,'spawnSync',()=>{calls++;return {status:0};});
  syncBuiltinESMExports();
  try {
    const {resolveVideoEncoderArgs}=await import('../utils/video-encoder.mjs?available');
    assert.match(resolveVideoEncoderArgs({codec:'libx264'}),/-c:v libx264/);
    assert.equal(calls,0);
    assert.match(resolveVideoEncoderArgs({codec:'h264_videotoolbox'}),/-c:v h264_videotoolbox/);
    assert.equal(calls,1);
  } finally {t.mock.restoreAll();syncBuiltinESMExports();}
});
