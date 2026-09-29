import assert from 'node:assert/strict';
import {execFileSync, execSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {historySlideshowMotionCommand, HISTORY_SLIDESHOW_CYCLE_SEC} from './history-slideshow-motion.service.mjs';

test('history slideshow renders two identical silent cloud cycles', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'history-slideshow-'));
    try {
        const img = path.join(directory, "person's photo.ppm"), clip = path.join(directory, 'loop.mp4');
        fs.writeFileSync(img, Buffer.concat([Buffer.from('P6\n64 36\n255\n'), Buffer.alloc(64 * 36 * 3, 90)]));
        execSync(historySlideshowMotionCommand({width:320,height:180,fps:30,codec:'libx264',encodePreset:'ultrafast'}, {img,clip,durationSec:HISTORY_SLIDESHOW_CYCLE_SEC*2}), {stdio:'pipe'});
        const metadata = JSON.parse(execFileSync('ffprobe', ['-v','error','-show_entries','stream=codec_type,nb_frames:format=duration','-of','json',clip]));
        assert.equal(metadata.streams.length, 1);
        assert.equal(metadata.streams[0].codec_type, 'video');
        assert.equal(metadata.streams[0].nb_frames, '390');
        assert.ok(Math.abs(Number(metadata.format.duration)-13)<.01);
        const pixels=execFileSync('ffmpeg',['-v','error','-i',clip,'-vf',"select='eq(n,90)+eq(n,285)'",'-fps_mode','passthrough','-pix_fmt','gray','-f','rawvideo','-']);
        const count=320*180;
        assert.equal(pixels.length,count*2);
        let difference=0;
        for(let i=0;i<count;i++)difference+=Math.abs(pixels[i]-pixels[count+i]);
        assert.ok(difference/count<2,'clouds, overlays and camera must repeat together');
    } finally { fs.rmSync(directory,{recursive:true,force:true}); }
});
