import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execSync,execFileSync} from 'node:child_process';
import {makeQuoteClipCommand} from './quote-motion.service.mjs';
import {quoteStyle,quoteComposition,validateQuoteDesign} from '../../../SHARED/quote-styles.mjs';

test('typography reproduces template highlight selections and preserves complete words',()=>{
  for(const id of ['typography_focus','typography_split']){
    const style=quoteStyle(id),design=quoteComposition(id,style.sample);
    assert.deepEqual(design.blocks.map(b=>b.lines[0]),style.sample.text.toUpperCase().split(/\s+/));
    assert.ok(design.blocks.every(b=>b.font==='montserratBlack'));
    assert.deepEqual(design.blocks.flatMap((b,i)=>b.highlight?[i+1]:[]),style.highlightWords.split(',').map(Number));
    assert.equal(new Set(design.blocks.map(b=>b.y)).size,id==='typography_focus'?2:5);
    assert.equal(quoteComposition(id,{text:'One two',highlightWords:''}).shapes.length,0);
    const colored=quoteComposition(id,{text:'One two',highlightWords:'1',textColor:'#123456',accentColor:'#abcdef'});
    assert.equal(colored.blocks[1].color,'#123456');
    assert.equal(colored.blocks[0].initialColor,'#123456');
  }
  assert.throws(()=>validateQuoteDesign('typography_focus',{highlightWords:'1;bad'}));
});

test('both typography styles render silent extended clips with a completed text hold',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'typography-test-'));
  try{
    for(const id of ['typography_focus','typography_split']){
      const clip=path.join(dir,`${id}.mp4`);
      execSync(makeQuoteClipCommand({paths:{clipCacheDir:dir}},{width:480,height:270,fps:30,codec:'libx264',encodePreset:'ultrafast'},{clip,durationSec:8,quoteStyleId:id,quoteFields:quoteStyle(id).sample}),{stdio:'pipe'});
      const meta=JSON.parse(execFileSync('ffprobe',['-v','error','-show_entries','stream=codec_type,nb_frames:format=duration','-of','json',clip]));
      assert.equal(meta.streams.length,1);assert.equal(meta.streams[0].codec_type,'video');assert.equal(meta.streams[0].nb_frames,'240');assert.equal(Number(meta.format.duration),8);
      const pixels=execFileSync('ffmpeg',['-v','error','-ss','7','-i',clip,'-frames:v','1','-pix_fmt','rgb24','-f','rawvideo','-']);
      let yellow=0;for(let i=0;i<pixels.length;i+=3)if(pixels[i]>180&&pixels[i+1]>170&&pixels[i+2]<80)yellow++;
      assert.ok(yellow>100,'accent text/highlights stay visible after five seconds');
    }
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
