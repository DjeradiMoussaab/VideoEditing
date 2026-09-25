import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync, execSync} from 'node:child_process';
import {config} from '../BACKEND/src/config.mjs';
import {imageMotionCommand} from '../BACKEND/src/services/image-motion.service.mjs';
import {makeQuoteClipCommand} from '../BACKEND/src/services/quote-motion.service.mjs';
import {QUOTE_STYLES, QUOTE_SAMPLE} from '../SHARED/quote-styles.mjs';
import {concatVisualsStep} from '../BACKEND/src/steps/04-concat-visuals.mjs';
import {addAudioStep} from '../BACKEND/src/steps/05-add-audio.mjs';
import * as media from '../BACKEND/src/services/ffmpeg.service.mjs';
import * as fileUtils from '../BACKEND/src/services/fs.service.mjs';
if(process.platform==='win32')throw new Error('Run the render smoke test in WSL2; native Windows shell rendering is not yet supported.');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'video smoke '));
const command=cmd=>{try{execSync(cmd,{stdio:'pipe',timeout:120000});}catch(e){throw new Error(e.stderr?.toString()||e.message);}};
const ffmpeg=args=>execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-y',...args],{stdio:'pipe',timeout:30000});
try{
 const video={...config.video,width:640,height:360,fps:24,codec:process.env.VIDEO_CODEC || 'libx264',encodePreset:'ultrafast',renderProfiles:{},transitionDuration:.2};
 const paths={outDir:dir,clipCacheDir:path.join(dir,'cache'),visualsMp4:path.join(dir,'visuals.mp4'),finalMp4:path.join(dir,'final.mp4'),voiceMp3:path.join(dir,'voice.wav')};
 const img=path.join(dir,'reference.png');
 ffmpeg(['-f','lavfi','-i','testsrc2=s=640x360:r=24','-frames:v','1',img]);
 const clips=[];
 for(const [id,profile] of Object.entries(config.video.imageAnimationProfiles)){
  const clip=path.join(dir,`image-${id}.mp4`);command(imageMotionCommand(video,profile,{img,clip,durationSec:1}));clips.push(clip);console.log(`OK image ${id}`);
 }
 for(const style of QUOTE_STYLES){
  const clip=path.join(dir,`quote-${style.id}.mp4`);command(makeQuoteClipCommand({paths},video,{clip,durationSec:1,quoteStyleId:style.id,quoteFields:QUOTE_SAMPLE}));clips.push(clip);console.log(`OK quote ${style.id}`);
 }
 ffmpeg(['-f','lavfi','-i','sine=frequency=440:duration=30',paths.voiceMp3]);
 const ctx={paths,config:{video},runOptions:{},fs:fileUtils,ffmpeg:{...media,exec:command},clipFiles:[clips[0],clips.at(-1)],plan:{scenes:[]}};
 await concatVisualsStep(ctx);await addAudioStep(ctx);
 const probe=JSON.parse(execFileSync('ffprobe',['-v','error','-show_streams','-of','json',paths.finalMp4],{encoding:'utf8'}));
 if(!probe.streams.some(s=>s.codec_name==='h264')||!probe.streams.some(s=>s.codec_name==='aac'))throw new Error('Final video must contain H.264 video and AAC audio.');
 if(!(media.getVideoDurationSeconds(paths.finalMp4)>1))throw new Error('Final video duration is invalid.');
 console.log('PASS: image animations, all quote styles, transitions and final audio/video export. No external API requests.');
}finally{fs.rmSync(dir,{recursive:true,force:true});}
