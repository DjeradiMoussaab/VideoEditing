import { montserratMetrics } from './montserrat-metrics.mjs';
import { typographyLayout } from './typography-layout.mjs';
const field = (key, label, maxLength, placeholder) => ({ key, label, maxLength, placeholder });
const text = field('text', 'Main quote', 600, 'Small steps can lead to extraordinary places.');
const author = field('author', 'Author / attribution', 100, 'Name or source');
const title = field('title', 'Title', 100, 'A thought worth keeping');

// `font` picks the default typeface family for a style's blocks (see FONT_STACKS in
// QuotePreview.jsx and FONT_FILES in quote-motion.service.mjs for the two renderers).
// `scrim` tints a blurred background image/video so text stays legible: '#rrggbb@alpha'.
export const QUOTE_STYLES = [
  {id:'typography_focus',name:'Typography • Focus',description:'Full-screen filtered background with centered word reveals and yellow highlights.',fields:[text],bg:'#101010',fg:'#ffffff',accent:'#ffef00',colorControl:true,wordHighlights:true,highlightWords:'1,2,4,6,7,8',sample:{text:"Things don't always work\nout the first time."}},
  {id:'typography_split',name:'Typography • Split',description:'Bold yellow words and white highlights beside a monochrome image or video.',fields:[text],bg:'#080808',fg:'#ffef00',accent:'#ffef00',colorControl:true,wordHighlights:true,highlightWords:'1,3,9,11',sample:{text:'Happiness\nis not\na destination.\nIt is a method\nof life'}},
  {id:'modern_clean',name:'Modern Clean',description:'Two animated banners with Montserrat typography and a gentle breathing hold.',fields:[field('text','First text',600,'MINIMAL TITLES'),field('text2','Second text',400,'AWESOME DESIGN')],bg:'#151515',fg:'#ffffff',accent:'#ff0000',font:'montserrat',scrim:'#000000@0.35',colorControl:true},
  {id:'classic',name:'Classic',description:'A cinematic quotation with a blue accent.',fields:[text,author],bg:'#14273b',fg:'#f5f7fa',accent:'#45a8ed',font:'sans',scrim:'#0c1826@0.62'},
  {id:'archive',name:'Archive',description:'A sepia film reel with typewriter captions.',fields:[{...title,label:'Archive label'},text,{...author,label:'Recorded by'}],bg:'#241b10',fg:'#ecd9b3',accent:'#9c7a3f',font:'mono',scrim:'#1b1409@0.74'},
];
export const quoteStyle = id => QUOTE_STYLES.find(style => style.id === id) || QUOTE_STYLES.find(style => style.id === 'classic');
export function quoteValues(scene) {
  return {text:String(scene.quoteText ?? scene.narration ?? ''),author:String(scene.quoteAuthor || ''),title:'',text2:'',text3:'',eyebrow:'',...(scene.quoteFields || {})};
}
export function validateQuoteDesign(styleId, values) {
  if (!QUOTE_STYLES.some(style => style.id === styleId)) throw new Error('Choose a valid quote style.');
  if (!values || typeof values !== 'object' || Array.isArray(values)) throw new Error('Quote fields must be an object.');
  const limits={text:600,author:100,title:100,text2:400,text3:300,eyebrow:50};
  const out={};
  for (const [key,value] of Object.entries(values)) {
    if(key==='highlightWords') {
      if(typeof value!=='string'||value.length>1200||! /^(?:[1-9]\d{0,2}(?:,[1-9]\d{0,2})*)?$/.test(value))throw new Error('Invalid highlighted words.');
      out[key]=value;continue;
    }
    if(['accentColor','textColor','text2Color','banner2Color'].includes(key)) {
      if(typeof value!=='string'||!/^#[0-9a-f]{6}$/i.test(value)) throw new Error('Choose a valid accent color.');
      out[key]=value; continue;
    }
    if (!Object.hasOwn(limits, key) || typeof value !== 'string' || value.length > limits[key]) throw new Error(`Invalid quote field: ${key}`);
    out[key]=value;
  }
  return out;
}
// Average glyph width as a fraction of font size, used only to estimate wrap points.
const WRAP_RATIO = {serif:.58,sans:.6,mono:.62};
function wrap(text, size, width, fontKey) {
  const ratio=WRAP_RATIO[fontKey]||.6;
  const capacity=Math.max(2,Math.floor(width/(size*ratio)));
  const lines=[];
  for (const paragraph of String(text || '').split('\n')) {
    let line='';
    for(const token of paragraph.trim().split(/\s+/).filter(Boolean)) {
      const chunks=Array.from(token).reduce((a,c,i)=>{if(i%capacity===0)a.push('');a[a.length-1]+=c;return a;},[]);
      for(const word of chunks) {
        if(line && Array.from(`${line} ${word}`).length>capacity){lines.push(line);line='';}
        line=line?`${line} ${word}`:word;
      }
    }
    lines.push(line);
  }
  return lines;
}
// One layout definition drives the SVG preview and the FFmpeg renderer.
export function quoteComposition(styleId, values={}) {
  const base=quoteStyle(styleId);
  const style={...base,accent:base.colorControl && /^#[0-9a-f]{6}$/i.test(values.accentColor||'')?values.accentColor:base.accent}, shapes=[], blocks=[];
  if(style.wordHighlights)return typographyLayout(style,values);
  const rect=(x,y,w,h,color,stroke=0)=>shapes.push({x,y,w,h,color,stroke});
  const add=(key,x,y,w,h,size,options={})=>{
    const content=options.literal ?? String(values[key] || '');
    if(!content.trim())return;
    const fontKey=options.font || style.font || 'sans';
    let fontSize=size,lines=wrap(content,fontSize,w,fontKey);
    while(lines.length*fontSize*1.25>h && fontSize>8){fontSize-=1;lines=wrap(content,fontSize,w,fontKey);}
    const top=y+(h-lines.length*fontSize*1.25)/2;
    blocks.push({key,lines,x,y:top,w,fontSize,lineHeight:fontSize*1.25,color:options.color||style.fg,align:options.align||'left',font:fontKey,bold:options.bold!==false,delay:blocks.length*.1});
  };
  switch(style.id){
    case 'modern_clean': {
      const specs=[['text',408,400,1400,138,108,true],['text2',562,280,1120,80,60,false]];
      for(const [key,y,minWidth,w,h,initial,bold] of specs){
        const entered=String(values[key]||'').trim();
        const content=key==='text'?entered.toUpperCase():entered;
        if(!content)continue;
        const metrics=montserratMetrics[bold?'ExtraBold':'Medium'];
        const width=line=>Array.from(line).reduce((sum,c)=>sum+(metrics[c.codePointAt(0)]??.7),0);
        let size=initial,lines;
        do {
          lines=[];
          for(const paragraph of content.split('\n')) {
            let line='';
            for(const word of paragraph.trim().split(/\s+/).filter(Boolean)){
              const next=line?`${line} ${word}`:word;
              if(line && width(next)*size>w-70){lines.push(line);line=word;}else line=next;
            }
            lines.push(line);
          }
          if(lines.length*size*1.15<=h-24 && lines.every(line=>width(line)*size<=w-70))break;
          size-=1;
        }while(size>1);
        const bannerWidth=Math.min(w,Math.max(minWidth,Math.ceil(Math.max(...lines.map(width))*size+70)));
        const x=(1920-bannerWidth)/2;
        const bannerColor=bold?style.accent:(values.banner2Color||'#ffffff');
        rect(x,y,bannerWidth,h,bannerColor);
        blocks.push({key,lines,x:x+35,y:y+(h-lines.length*size*1.15)/2,w:bannerWidth-70,bannerWidth,bannerColor,fontSize:size,lineHeight:size*1.15,color:bold?(values.textColor||'#ffffff'):(values.text2Color||'#151515'),align:'center',font:'montserrat',bold,delay:bold?.86:1.16});
      }
      break;
    }
    case 'classic':
      add('mark',260,100,220,160,200,{literal:'“',font:'serif',color:style.accent});
      add('text',320,270,1280,460,72,{align:'center'});
      if(values.author?.trim()){rect(650,810,620,3,style.accent);add('author',320,850,1280,75,30,{align:'center',bold:false});}break;
    case 'archive': {
      for(let i=0;i<14;i++){rect(660+i*22,58,12,12,style.accent);rect(660+i*22,1010,12,12,style.accent);}
      add('title',180,150,1560,70,32,{color:style.accent});
      add('text',180,260,1560,500,78,{align:'center'});
      if(values.author?.trim()){rect(760,830,400,2,style.accent);add('author',180,880,1560,60,28,{bold:false,align:'center'});}
      break;
    }

  }
  return {...style,shapes,blocks,width:1920,height:1080};
}
export const QUOTE_SAMPLE={text:'Small steps.\nExtraordinary possibilities.',author:'A thought to carry with you',title:'Make room for possibility',text2:'Begin where you are.\nBuild as you go.',text3:'Keep moving.\nLet the journey teach you.',eyebrow:'1969'};
