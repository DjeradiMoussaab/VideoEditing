import fs from 'node:fs';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {loadManifest,saveManifest} from './job-store.service.mjs';
const run=promisify(execFile);
export const END_SCREEN_SECONDS=10;
export const endScreenEnabled=manifest=>manifest?.exportOptions?.endScreen!==false;
export function saveEndScreenOption(jobId,{endScreen,expectedUpdatedAt}={}) {
 const fail=(message,statusCode=400)=>{throw Object.assign(new Error(message),{statusCode});};
 const manifest=loadManifest(jobId);if(!manifest)fail('Project not found.',404);
 if(typeof endScreen!=='boolean')fail('End screen must be on or off.');
 if(manifest.updatedAt!==expectedUpdatedAt)fail('The project changed. Reopen it before changing export options.',409);
 if(/_(RUNNING|PAUSED|STOPPING)$/.test(manifest.status))fail('Return to editing before changing export options.',409);
 manifest.exportOptions={...manifest.exportOptions,endScreen};
 manifest.artifacts={...manifest.artifacts,needsRegeneration:true};
 saveManifest(jobId,manifest);return manifest;
}
// Encode only the black tail. The content video is remuxed, never filtered or encoded.
// Use the untouched content export on every run so endings cannot accumulate.
export async function appendEndScreen(input,output) {
 if(path.resolve(input)===path.resolve(output))throw new Error('The ending output must differ from the content export.');
 const {stdout}=await run('ffprobe',['-v','error','-show_streams','-of','json',input],{maxBuffer:1024*1024});
 const streams=JSON.parse(stdout).streams||[],video=streams.find(s=>s.codec_type==='video');
 const duration=Number(video?.duration);
 if(!video||!Number.isFinite(duration)||duration<=0)throw new Error('Cannot determine the final video duration.');
 const rate=video.avg_frame_rate||video.r_frame_rate;
 const [numerator,denominator]=String(rate).split('/').map(Number);
 if(!(numerator>0&&denominator>0))throw new Error('Cannot determine the final video frame rate.');
 // The pipeline exports H.264. Do not silently fall back to an expensive full transcode.
 if(video.codec_name!=='h264')throw new Error('The optimized black ending requires an H.264 content export.');
 const frames=Math.round(END_SCREEN_SECONDS*numerator/denominator);
 const tailDuration=frames*denominator/numerator;
 const total=duration+tailDuration,hasAudio=streams.some(s=>s.codec_type==='audio');
 const work=fs.mkdtempSync(path.join(path.dirname(output),'end-screen-'));
 const head=path.join(work,'content.mp4'),tail=path.join(work,'black.mp4');
 const list=path.join(work,'concat.txt'),temporary=path.join(work,'finished.mp4');
 const profiles={'Constrained Baseline':'baseline','Baseline':'baseline','Main':'main','High':'high','High 10':'high10','High 4:2:2':'high422','High 4:4:4 Predictive':'high444'};
 try{
  // A video-only head avoids AAC priming/duration affecting the concat boundary.
  await run('ffmpeg',['-v','error','-y','-i',input,'-map','0:v:0','-c:v','copy','-an',head],{maxBuffer:2*1024*1024});
  const args=['-v','error','-y','-f','lavfi','-i',`color=black:s=${video.width}x${video.height}:r=${rate}`,
   '-frames:v',String(frames),'-an','-vf',`setsar=${video.sample_aspect_ratio?.replace(':','/')||'1'}`,
   '-c:v','libx264','-preset','veryfast','-crf','18','-bf',String(Number(video.has_b_frames)||0),'-pix_fmt',video.pix_fmt||'yuv420p'];
  if(profiles[video.profile])args.push('-profile:v',profiles[video.profile]);
  if(Number(video.level)>0)args.push('-level:v',String(Number(video.level)/10));
  const timescale=Number(String(video.time_base).split('/')[1]);
  if(Number.isSafeInteger(timescale)&&timescale>0)args.push('-video_track_timescale',String(timescale));
  for(const [key,flag] of [['color_range','-color_range'],['color_space','-colorspace'],['color_transfer','-color_trc'],['color_primaries','-color_primaries']]){
   if(video[key]&&video[key]!=='unknown')args.push(flag,video[key]);
  }
  args.push(tail);
  await run('ffmpeg',args,{maxBuffer:2*1024*1024});
  // Relative fixed filenames also handle spaces and apostrophes in project paths.
  fs.writeFileSync(list,`ffconcat version 1.0\nfile content.mp4\nduration ${duration}\nfile black.mp4\n`);
  const mux=['-v','error','-y','-f','concat','-safe','1','-i',list];
  if(hasAudio)mux.push('-i',input);
  else mux.push('-f','lavfi','-i','anullsrc=r=48000:cl=stereo');
  mux.push('-map','0:v:0','-map','1:a:0','-c:v','copy',
   '-af',`atrim=duration=${duration},asetpts=PTS-STARTPTS,apad,atrim=duration=${total}`,
   '-c:a','aac','-b:a','192k','-movflags','+faststart',temporary);
  await run('ffmpeg',mux,{maxBuffer:2*1024*1024});
  fs.renameSync(temporary,output);
  return {durationSec:total,endScreenSeconds:tailDuration};
 }catch(error){throw new Error(`Could not add the black ending: ${error.stderr?.slice(-1000)||error.message}`);}
 finally{fs.rmSync(work,{recursive:true,force:true});}
}
