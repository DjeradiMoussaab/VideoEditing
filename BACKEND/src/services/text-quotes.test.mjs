import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync,execSync} from 'node:child_process';
import {TEXT_QUOTE_STYLES,textQuoteSvg,textQuoteTiming,textQuoteWidth} from '../../../SHARED/text-quotes.mjs';
import {quoteComposition,validateQuoteDesign} from '../../../SHARED/quote-styles.mjs';
import {makeQuoteClipCommand} from './quote-motion.service.mjs';
const pixels=(clip,at)=>execFileSync('ffmpeg',['-v','error','-ss',String(at),'-i',clip,'-frames:v','1','-pix_fmt','rgb24','-f','rawvideo','-'],{maxBuffer:2e6});
const bright=buf=>{let n=0;for(let i=0;i<buf.length;i+=3)if(buf[i]>160&&buf[i+1]>160&&buf[i+2]>160)n++;return n;};

test('the six selected source templates have simple text and color controls',()=>{
  assert.deepEqual(TEXT_QUOTE_STYLES.map(s=>s.sourceQuote),[7,4,6,8,1,3]);
  for(const style of TEXT_QUOTE_STYLES){
    assert.deepEqual(style.fields.map(f=>f.key),['text','author']);
    const values=validateQuoteDesign(style.id,{...style.sample,textColor:'#abcdef',accentColor:'#123456',authorColor:'#fedcba'});
    const d=quoteComposition(style.id,values);
    assert.ok(d.blocks.filter(b=>b.key!=='author').every(b=>b.color==='#abcdef'));
    assert.equal(d.blocks.find(b=>b.key==='author').color,'#fedcba');assert.equal(d.accent,'#123456');
    for(const b of d.blocks)assert.ok(textQuoteWidth(b.lines[0])*b.fontSize<=b.w+.01);
    assert.throws(()=>validateQuoteDesign(style.id,{authorColor:'red" onclick="bad'}));
  }
});
test('long text fits without truncation, attribution is optional, markup is escaped',()=>{
  for(const style of TEXT_QUOTE_STYLES){
    for(const text of ['A WIDE THOUGHT '.repeat(42).trim(),'W'.repeat(600),'ONE\nTWO\nTHREE\nFOUR\nFIVE\nSIX']){
      const d=quoteComposition(style.id,{text});
      assert.equal(d.blocks.map(b=>b.lines.join('')).join('').replace(/\s/g,''),text.replace(/\s/g,''));
      assert.ok(d.blocks.every(b=>b.x>=0&&b.x+b.w<=1920&&b.y>=0&&b.y+b.lineHeight<=1080));
    }
    assert.equal(quoteComposition(style.id,{}).blocks.length,0);
    assert.equal(quoteComposition(style.id,{text:'Hello'}).blocks.some(b=>b.key==='author'),false);
    assert.ok(!textQuoteSvg(quoteComposition(style.id,{text:'<script> & "Hi"'}),3,8).includes('<SCRIPT>'));
  }
});
test('long holds remain steady and short scenes preserve a complete reading interval',()=>{
  for(const style of TEXT_QUOTE_STYLES){
    const d=quoteComposition(style.id,style.sample);
    assert.equal(textQuoteSvg(d,3,20),textQuoteSvg(d,15,20));
    assert.notEqual(textQuoteSvg(d,.2,6),textQuoteSvg(d,.8,6));
    assert.notEqual(textQuoteSvg(d,3,6),textQuoteSvg(d,5.9,6));
    assert.ok(textQuoteTiming(.3,.5).enter>1.5);
  }
});
test('all six templates render through the clip command with correct duration and motion',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'text-quotes-'));
  try{
    for(const style of TEXT_QUOTE_STYLES){
      const clip=path.join(dir,`${style.id}.mp4`);
      execSync(makeQuoteClipCommand({paths:{clipCacheDir:dir}},{width:480,height:270,fps:24,codec:'libx264',encodePreset:'ultrafast'},{clip,durationSec:4,quoteStyleId:style.id,quoteFields:style.sample}),{stdio:'pipe'});
      const meta=JSON.parse(execFileSync('ffprobe',['-v','error','-show_entries','stream=codec_type,nb_frames:format=duration','-of','json',clip]));
      assert.equal(meta.streams.length,1);assert.equal(meta.streams[0].nb_frames,'96');assert.equal(Number(meta.format.duration),4);
      const start=pixels(clip,0),middle=pixels(clip,2),exit=pixels(clip,3.95);
      assert.ok(bright(middle)>300,`${style.id} readable hold`);assert.ok(bright(start)<bright(middle)/10);assert.ok(bright(exit)<bright(middle)/2);
    }
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('short scenes, long holds, custom colors and looping video backgrounds stay usable',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'text-quotes-duration-'));
  try{
    const source=path.join(dir,'background.mp4');
    execFileSync('ffmpeg',['-v','error','-y','-f','lavfi','-i','testsrc2=size=320x180:rate=30:duration=1','-c:v','libx264','-pix_fmt','yuv420p',source]);
    for(const duration of [.5,12]){
      const clip=path.join(dir,`quote-${duration}.mp4`);
      execSync(makeQuoteClipCommand({paths:{clipCacheDir:dir}},{width:320,height:180,fps:30,codec:'libx264',encodePreset:'ultrafast'},{clip,durationSec:duration,inputVideo:source,mediaOffsetSec:.4,quoteStyleId:'text_quotes_07',quoteFields:{text:'A CUSTOM\nQUOTE',author:'An author',textColor:'#ffffff',accentColor:'#ff0000',authorColor:'#00ff00'}}),{stdio:'pipe'});
      const meta=JSON.parse(execFileSync('ffprobe',['-v','error','-show_entries','stream=nb_frames:format=duration','-of','json',clip]));
      assert.equal(Number(meta.format.duration),duration);assert.equal(Number(meta.streams[0].nb_frames),duration*30);
      const mid=pixels(clip,duration<1?.3:9);assert.ok(bright(mid)>100);
      let red=0,green=0;for(let i=0;i<mid.length;i+=3){if(mid[i]>160&&mid[i+1]<70&&mid[i+2]<70)red++;if(mid[i+1]>140&&mid[i]<90&&mid[i+2]<90)green++;}
      assert.ok(red>40,'custom chevrons are visible');assert.ok(green>5,'custom author color is visible');
    }
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
