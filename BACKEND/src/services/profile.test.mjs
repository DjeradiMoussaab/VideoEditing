import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {PROFILE_STYLES,profileLayout,profileSvg} from '../../../SHARED/profile.mjs';
import {OPENER_STYLES,QUOTE_STYLES,quoteComposition,validateQuoteDesign} from '../../../SHARED/quote-styles.mjs';
import {makeQuoteClipCommand} from './quote-motion.service.mjs';
import {renderPresentation} from './presentation-render.mjs';
test('PROFILE contains exactly four selected opener styles with customizable colors',()=>{
 assert.deepEqual(PROFILE_STYLES.map(s=>s.sourceSlide),['01','04','06','14']);
 for(const style of PROFILE_STYLES){assert.ok(OPENER_STYLES.includes(style));assert.ok(!QUOTE_STYLES.includes(style));
 const fields=validateQuoteDesign(style.id,{...style.sample,accentColor:'#ff6600',banner2Color:'#88cc22',textColor:'#112233'});
 const d=quoteComposition(style.id,fields);assert.equal(d.collection,'profile');const svg=profileSvg(d,3,8);for(const c of ['#ff6600','#88cc22','#112233'])assert.ok(svg.includes(c));
 for(const [t,dur] of [[0,.2],[.1,.2],[2,5],[29,30]])assert.ok(!/NaN|Infinity/.test(profileSvg(d,t,dur)));
 }
});
test('profile text fits supported field limits and does not inject SVG',()=>{
 for(const style of PROFILE_STYLES){
  for(const text of ['W'.repeat(600),'A thoughtful sentence. '.repeat(26)]){const d=profileLayout(style,{text,text2:'Description '.repeat(33),title:'L'.repeat(100)});for(const b of d.blocks){assert.ok(b.y+b.lines.length*b.lineHeight<=1080);assert.ok(b.lines.length*b.lineHeight<=b.h);}}
  assert.equal(profileLayout(style,{}).blocks.length,0);
  assert.ok(profileSvg(profileLayout(style,{text:'<script>& test'}),3,8).includes('&lt;SCRIPT&gt;'));
 }
});
test('all profile layouts render exact-length clips with image, video and placeholder inputs',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'profile-'));
 try{
  const media=path.join(dir,'motion.mp4');execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','testsrc2=s=320x180:r=12:d=1','-c:v','libx264','-pix_fmt','yuv420p',media]);
  const image=path.join(dir,'image.png');execFileSync('ffmpeg',['-v','error','-i',media,'-frames:v','1',image]);
  for(const [i,style] of PROFILE_STYLES.entries()){
   const clip=path.join(dir,`${i}.mp4`),video={width:320,height:180,fps:12,codec:'libx264',pixFmt:'yuv420p',encodePreset:'ultrafast'},opts={clip,durationSec:2,quoteStyleId:style.id,quoteFields:style.sample,inputVideo:[image,media,null,image][i],mediaOffsetSec:.2};
   const command=makeQuoteClipCommand({paths:{clipCacheDir:dir}},video,opts);assert.ok(command.includes('presentation-render.mjs'));
   await renderPresentation({video,...opts});const meta=JSON.parse(execFileSync('ffprobe',['-v','error','-show_streams','-of','json',clip]));assert.equal(meta.streams[0].nb_frames,'24');assert.equal(Number(meta.streams[0].duration),2);
  }
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
