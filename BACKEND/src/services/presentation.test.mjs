import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {PRESENTATION_STYLES,presentationLayout,presentationSvg} from '../../../SHARED/presentation.mjs';
import {OPENER_STYLES,QUOTE_STYLES,validateQuoteDesign} from '../../../SHARED/quote-styles.mjs';
import {renderPresentation} from './presentation-render.mjs';

test('all eleven presentation openers remain separate from quotes and preserve custom fields',()=>{
 assert.equal(PRESENTATION_STYLES.length,11);
 for(const style of PRESENTATION_STYLES){
  assert.ok(OPENER_STYLES.includes(style));assert.ok(!QUOTE_STYLES.includes(style));
  const fields=validateQuoteDesign(style.id,{...style.sample,accentColor:'#00aa77',textColor:'#eeeeee'});
  const d=presentationLayout(style,fields);assert.equal(d.accent,'#00aa77');
  const svg=presentationSvg(d,3,8);assert.ok(svg.includes('#00aa77'));assert.ok(!svg.includes('#9300ff'));
  for(const time of [0,.1,1,3,7.9])assert.ok(!/NaN|Infinity/.test(presentationSvg(d,time,8)));
 }
});
test('long titles fit, markup is escaped and empty fields remain empty',()=>{
 for(const style of PRESENTATION_STYLES){
  const d=presentationLayout(style,{text:'W'.repeat(600),text2:'Long description '.repeat(25)});
  for(const b of d.blocks)assert.ok(b.lines.length*b.lineHeight<=b.h);
  assert.equal(presentationLayout(style,{}).blocks.length,0);
  assert.ok(!presentationSvg(presentationLayout(style,{text:'<script>& "test"'}),3,8).includes('<script>'));
 }
});
test('presentation render accepts image, moving clip and absent media with exact duration',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'presentation-'));
 try{
  const media=path.join(dir,'motion.mp4');
  execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','testsrc2=s=320x180:r=12:d=1','-c:v','libx264','-pix_fmt','yuv420p',media]);
  const image=path.join(dir,'image.png');execFileSync('ffmpeg',['-v','error','-i',media,'-frames:v','1',image]);
  for(const [i,inputVideo] of [image,media,null].entries()){
   const clip=path.join(dir,`${i}.mp4`),style=PRESENTATION_STYLES[i===1?3:i];
   await renderPresentation({video:{width:320,height:180,fps:12,codec:'libx264',pixFmt:'yuv420p',encodePreset:'ultrafast'},clip,durationSec:2,quoteStyleId:style.id,quoteFields:{...style.sample,accentColor:'#008855'},inputVideo,mediaOffsetSec:.3});
   const meta=JSON.parse(execFileSync('ffprobe',['-v','error','-show_streams','-of','json',clip]));assert.equal(meta.streams[0].nb_frames,'24');assert.equal(Number(meta.streams[0].duration),2);
  }
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
