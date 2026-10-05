import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { videoFramingFilter } from './video-framing.service.mjs';

for (const [label, width, height] of [['portrait',90,160], ['square',128,128], ['wide',240,80], ['16:9',320,180]]) {
  test(`${label} footage retains its complete sharp frame over a video-filled 16:9 canvas`, () => {
    const data = execFileSync('ffmpeg', ['-v','error','-f','lavfi','-i',`color=blue:s=${width}x${height}:r=12:d=0.25,drawbox=x=0:y=0:w=iw:h=ih/8:color=red:t=fill,drawbox=x=0:y=ih*7/8:w=iw:h=ih/8:color=lime:t=fill`, '-vf',videoFramingFilter(320,180,12),'-frames:v','1','-pix_fmt','rgb24','-f','rawvideo','-']);
    assert.equal(data.length,320*180*3);
    const pixel = (x,y) => [...data.subarray((y*320+x)*3,(y*320+x)*3+3)];
    const scale = Math.min(320/width,180/height);
    const top = (180-height*scale)/2;
    const red = pixel(160,Math.round(top+height*scale*.05));
    const green = pixel(160,Math.round(top+height*scale*.95));
    assert.ok(red[0]>180 && red[1]<70,'top of source must not be cropped');
    assert.ok(green[1]>180 && green[0]<70,'bottom of source must not be cropped');
    assert.ok(pixel(4,90).some(value=>value>100),'side areas must be filled with footage, not black bars');
  });
}
