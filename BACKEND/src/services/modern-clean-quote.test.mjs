import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execSync,execFileSync} from 'node:child_process';
import {makeQuoteClipCommand} from './quote-motion.service.mjs';
import {quoteComposition,quoteStyle,validateQuoteDesign} from '../../../SHARED/quote-styles.mjs';

test('modern clean has two text fields and validates its configurable color',()=>{
  assert.deepEqual(quoteStyle('modern_clean').fields.map(f=>f.key),['text','text2']);
  assert.throws(()=>validateQuoteDesign('modern_clean',{accentColor:'red;bad'}));
  assert.equal(quoteComposition('modern_clean',{text:'Hello',accentColor:'#00cc88'}).shapes[0].color,'#00cc88');
  const colors=validateQuoteDesign('modern_clean',{text:'One',text2:'Two',textColor:'#112233',text2Color:'#445566',accentColor:'#abcdef',banner2Color:'#fedcba'});
  const design=quoteComposition('modern_clean',colors);
  assert.deepEqual(design.blocks.map(b=>b.color),['#112233','#445566']);
  assert.deepEqual(design.blocks.map(b=>b.bannerColor),['#abcdef','#fedcba']);
  assert.deepEqual(design.shapes.map(s=>s.color),['#abcdef','#fedcba']);
  assert.throws(()=>validateQuoteDesign('modern_clean',{text2Color:'invalid'}));
});

test('modern clean wraps the reported sentence at word boundaries without losing text',()=>{
  const text='Her husband disappeared only six weeks after they got married.';
  const block=quoteComposition('modern_clean',{text}).blocks[0];
  assert.ok(block.lines.length>1);
  assert.equal(block.lines.join(' '),text.toUpperCase());
  assert.ok(block.lines.some(line=>line.includes('WEEKS')));
  const longWord='Supercalifragilisticexpialidocious'.repeat(4);
  const unbroken=quoteComposition('modern_clean',{text:longWord}).blocks[0];
  assert.deepEqual(unbroken.lines,[longWord.toUpperCase()]);
});

test('both banners size independently to their text within minimum and maximum widths',()=>{
  const small=quoteComposition('modern_clean',{text:'Hi',text2:'Yes'});
  assert.deepEqual(small.shapes.map(s=>s.w),[400,280]);
  const larger=quoteComposition('modern_clean',{text:'A longer first title',text2:'A longer second title'});
  assert.ok(larger.shapes[0].w>400);assert.ok(larger.shapes[1].w>280);
  for(const [i,max] of [1400,1120].entries()){
    const shape=larger.shapes[i];assert.ok(shape.w<=max);assert.equal(shape.x+shape.w/2,960);
  }
  const onlyFirstChanged=quoteComposition('modern_clean',{text:'A much longer first title to display',text2:'Yes'});
  assert.equal(onlyFirstChanged.shapes[1].w,small.shapes[1].w);
});

test('modern clean remains visible and breathes beyond five seconds without audio',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'modern-quote-'));
  try{
    const clip=path.join(dir,'result.mp4');
    execSync(makeQuoteClipCommand({paths:{clipCacheDir:dir}},{width:480,height:270,fps:30,codec:'libx264',encodePreset:'ultrafast'},{clip,durationSec:12,quoteStyleId:'modern_clean',quoteFields:{text:'FIRST TEXT',text2:'SECOND TEXT',accentColor:'#00cc88'}}),{stdio:'pipe'});
    const meta=JSON.parse(execFileSync('ffprobe',['-v','error','-show_entries','stream=codec_type,nb_frames:format=duration','-of','json',clip]));
    assert.equal(meta.streams.length,1);assert.equal(meta.streams[0].codec_type,'video');
    assert.equal(meta.streams[0].nb_frames,'360');assert.equal(Number(meta.format.duration),12);
    const pixels=execFileSync('ffmpeg',['-v','error','-i',clip,'-vf',"select='eq(n,210)+eq(n,270)'",'-fps_mode','passthrough','-pix_fmt','rgb24','-f','rawvideo','-'],{maxBuffer:2e6});
    const size=480*270*3;assert.equal(pixels.length,size*2);
    assert.notDeepEqual(pixels.subarray(0,size),pixels.subarray(size),'hold must continue moving');
    for(let offset=0;offset<pixels.length;offset+=size){
      let green=0;for(let i=offset;i<offset+size;i+=3)if(pixels[i+1]>140&&pixels[i]<60)green++;
      assert.ok(green>1000,'custom-colored banner stays visible after five seconds');
    }
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
