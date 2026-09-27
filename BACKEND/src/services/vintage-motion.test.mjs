import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, execSync } from 'node:child_process';
import { vintageMotionCommand, VINTAGE_CYCLE_SEC } from './vintage-motion.service.mjs';

test('vintage loops the selected image silently for two complete cycles', () => {
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'vintage-test-'));
    try {
        const img=path.join(dir,"person's photo.ppm"), clip=path.join(dir,'two cycles.mp4');
        fs.writeFileSync(img,Buffer.concat([Buffer.from('P6\n64 36\n255\n'),Buffer.alloc(64*36*3,90)]));
        execSync(vintageMotionCommand({width:320,height:180,fps:30,codec:'libx264',encodePreset:'ultrafast'}, {img,clip,durationSec:VINTAGE_CYCLE_SEC*2}),{stdio:'pipe'});
        const result=JSON.parse(execFileSync('ffprobe',['-v','error','-show_entries','stream=codec_type,width,height,nb_frames:format=duration','-of','json',clip]));
        assert.equal(result.streams[0].nb_frames,'386');
        assert.equal(result.streams[0].width,320);
        assert.ok(result.streams.every(stream => stream.codec_type !== 'audio'));
        assert.ok(Math.abs(Number(result.format.duration)-2*VINTAGE_CYCLE_SEC)<.05);
        const frames=execFileSync('ffmpeg',['-v','error','-i',clip,'-vf',"select='eq(n,45)+eq(n,238)'",'-vsync','0','-pix_fmt','gray','-f','rawvideo','-'],{maxBuffer:2*320*180+1000});
        assert.equal(frames.length,2*320*180);
        let delta=0;for(let i=0;i<320*180;i++)delta+=Math.abs(frames[i]-frames[i+320*180]);
        assert.ok(delta/(320*180)<2,'matching points in each cycle must show the same frame');
    } finally { fs.rmSync(dir,{recursive:true,force:true}); }
});

test('final export adds no vintage soundtrack', async () => {
    const { addAudioStep } = await import('../steps/05-add-audio.mjs');
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'vintage-audio-'));
    try {
        const visualsMp4=path.join(dir,'visuals.mp4'),voiceMp3=path.join(dir,'voice.wav'),finalMp4=path.join(dir,'final.mp4');
        execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','color=s=160x90:r=30','-t','5','-c:v','libx264',visualsMp4]);
        execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','anullsrc=r=44100:cl=stereo','-t','5',voiceMp3]);
        await addAudioStep({paths:{visualsMp4,voiceMp3,finalMp4},fs:{exists:fs.existsSync},ffmpeg:{exec:cmd=>execSync(cmd,{stdio:'pipe'})},config:{video:{imageAnimationProfiles:{documentary_echo:{treatment:'vintage'}}}},runOptions:{},plan:{scenes:[{scene_id:1,start_sec:0,duration_sec:2},{scene_id:2,start_sec:3,duration_sec:2}]},sceneVisuals:{1:{type:'image',animationStyle:'documentary_echo'},2:{type:'image',animationStyle:'documentary_echo'}}});
        const raw=execFileSync('ffmpeg',['-v','error','-i',finalMp4,'-vn','-ac','1','-ar','8000','-f','s16le','-']);
        function rms(start,end){let sum=0,n=0;for(let i=Math.round(start*8000);i<Math.round(end*8000);i++){const v=raw.readInt16LE(i*2);sum+=v*v;n++;}return Math.sqrt(sum/n);}
        assert.ok(rms(.5,1)<5,'first vintage scene must remain silent');
        assert.ok(rms(3.5,4)<5,'second vintage scene must remain silent');
        assert.ok(rms(2.3,2.7)<5,'sound must not spill into other scenes');
        assert.ok(raw.length>=5*8000*2);
    } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
