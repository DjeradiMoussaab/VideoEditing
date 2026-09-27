const field = (key, label, maxLength, placeholder) => ({ key, label, maxLength, placeholder });
const text = field('text', 'Main quote', 600, 'Small steps can lead to extraordinary places.');
const author = field('author', 'Author / attribution', 100, 'Name or source');
const title = field('title', 'Title', 100, 'A thought worth keeping');
const secondary = field('text2', 'Second text', 400, 'Another perspective, or a supporting thought.');
const third = field('text3', 'Third text', 300, 'Leave the audience with something to remember.');
const eyebrow = field('eyebrow', 'Small label', 50, 'A MOMENT OF CLARITY');

// `font` picks the default typeface family for a style's blocks (see FONT_STACKS in
// QuotePreview.jsx and FONT_FILES in quote-motion.service.mjs for the two renderers).
// `scrim` tints a blurred background image/video so text stays legible: '#rrggbb@alpha'.
export const QUOTE_STYLES = [
  {id:'classic',name:'Classic',description:'A cinematic quotation with a blue accent.',fields:[text,author],bg:'#14273b',fg:'#f5f7fa',accent:'#45a8ed',font:'sans',scrim:'#0c1826@0.62'},
  {id:'dossier',name:'Dossier',description:'A stamped case file with a red banner and condensed type.',fields:[{...eyebrow,label:'Case / year',placeholder:'1969'},text,author],bg:'#100b0a',fg:'#f2ece1',accent:'#c62231',font:'condensed',scrim:'#100b0a@0.72'},
  {id:'broadcast',name:'Broadcast',description:'A news lower-third with a bold ticker and headline.',fields:[{...title,label:'Headline'},text,{...author,label:'Source'}],bg:'#0a1421',fg:'#f4f7fb',accent:'#e5342b',font:'alternate',scrim:'#0a1421@0.68'},
  {id:'archive',name:'Archive',description:'A sepia film reel with typewriter captions.',fields:[{...title,label:'Archive label'},text,{...author,label:'Recorded by'}],bg:'#241b10',fg:'#ecd9b3',accent:'#9c7a3f',font:'mono',scrim:'#1b1409@0.74'},
  {id:'redacted',name:'Redacted',description:'A classified document with heavy bars and a stamp.',fields:[{...eyebrow,label:'Stamp',placeholder:'CLASSIFIED'},{...text,label:'Statement'},author],bg:'#0c0c0c',fg:'#eeeeee',accent:'#c62231',font:'impact',scrim:'#0a0a0a@0.78'},
  {id:'chronicle',name:'Chronicle',description:'A newspaper column with a serif drop rule.',fields:[{...title,label:'Section'},text,{...author,label:'Byline'}],bg:'#171310',fg:'#f2ead9',accent:'#b48a4a',font:'newsprint',scrim:'#171310@0.68'},
  {id:'monument',name:'Monument',description:'Engraved memorial caps on stone.',fields:[text,{...author,label:'Inscription'}],bg:'#111314',fg:'#e9e6df',accent:'#c7a15a',font:'engraved',scrim:'#0d0f10@0.7'},
  {id:'timeline',name:'Timeline',description:'A documentary era marker with a connecting rule.',fields:[{...eyebrow,label:'Year / era',placeholder:'1969'},text,author],bg:'#0a1715',fg:'#eef4f1',accent:'#4fd3a8',font:'condensed',scrim:'#0a1715@0.7'}
];
export const quoteStyle = id => QUOTE_STYLES.find(style => style.id === id) || QUOTE_STYLES[0];
export function quoteValues(scene) {
  return {text:String(scene.quoteText ?? scene.narration ?? ''),author:String(scene.quoteAuthor || ''),title:'',text2:'',text3:'',eyebrow:'',...(scene.quoteFields || {})};
}
export function validateQuoteDesign(styleId, values) {
  if (!QUOTE_STYLES.some(style => style.id === styleId)) throw new Error('Choose a valid quote style.');
  if (!values || typeof values !== 'object' || Array.isArray(values)) throw new Error('Quote fields must be an object.');
  const limits={text:600,author:100,title:100,text2:400,text3:300,eyebrow:50};
  const out={};
  for (const [key,value] of Object.entries(values)) {
    if (!Object.hasOwn(limits, key) || typeof value !== 'string' || value.length > limits[key]) throw new Error(`Invalid quote field: ${key}`);
    out[key]=value;
  }
  return out;
}
// Average glyph width as a fraction of font size, used only to estimate wrap points.
const WRAP_RATIO = {serif:.58,sans:.6,condensed:.46,alternate:.62,mono:.62,impact:.66,newsprint:.56,engraved:.64};
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
  const style=quoteStyle(styleId), shapes=[], blocks=[];
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
    case 'classic':
      add('mark',260,100,220,160,200,{literal:'“',font:'serif',color:style.accent});
      add('text',320,270,1280,460,72,{align:'center'});
      if(values.author?.trim()){rect(650,810,620,3,style.accent);add('author',320,850,1280,75,30,{align:'center',bold:false});}break;
    case 'dossier': {
      const tag=String(values.eyebrow||'').trim();
      if(tag){rect(140,110,520,84,style.accent);add('eyebrow',176,124,460,56,34,{color:'#100b0a'});}
      rect(140,222,520,4,style.accent);
      add('text',140,320,1660,460,84);
      if(values.author?.trim()){rect(140,860,80,4,style.accent);add('author',140,890,1000,60,28,{font:'mono',bold:false});}
      rect(1700,90,120,5,style.accent);rect(1815,90,5,120,style.accent);
      rect(85,900,5,120,style.accent);rect(85,1015,120,5,style.accent);
      break;
    }
    case 'broadcast':
      rect(0,60,1920,10,style.accent);
      add('title',140,130,1640,90,44,{color:style.accent});
      add('text',140,300,1640,440,80,{font:'sans',align:'center'});
      rect(0,880,1920,10,style.accent);
      rect(140,930,24,24,style.accent);
      if(values.author?.trim())add('author',188,922,1500,60,30,{font:'sans',bold:true});break;
    case 'archive': {
      for(let i=0;i<14;i++){rect(660+i*22,58,12,12,style.accent);rect(660+i*22,1010,12,12,style.accent);}
      add('title',180,150,1560,70,32,{color:style.accent});
      add('text',180,260,1560,500,78,{align:'center'});
      if(values.author?.trim()){rect(760,830,400,2,style.accent);add('author',180,880,1560,60,28,{bold:false,align:'center'});}
      break;
    }
    case 'redacted': {
      const stamp=String(values.eyebrow||'').trim();
      if(stamp){rect(1300,120,480,90,'#0c0c0c',4);add('eyebrow',1330,138,420,54,32,{color:style.accent,align:'center'});}
      rect(140,140,10,800,'#0c0c0c');rect(140,140,900,10,'#0c0c0c');
      add('text',200,320,1560,440,104);
      rect(200,830,500,26,'#0c0c0c');rect(760,830,340,26,'#0c0c0c');
      if(values.author?.trim())add('author',200,900,1200,60,30,{font:'mono',bold:false,color:style.accent});
      break;
    }
    case 'chronicle':
      rect(140,140,1640,4,style.fg);
      add('title',140,170,1640,70,34,{color:style.accent,align:'center'});
      rect(140,260,1640,2,style.fg);
      add('text',140,330,1640,470,78,{align:'center'});
      rect(760,850,400,2,style.accent);
      if(values.author?.trim())add('author',140,890,1640,60,28,{bold:false,align:'center'});break;
    case 'monument':
      rect(120,110,1680,4,style.accent);rect(120,1006,1680,4,style.accent);
      rect(120,110,4,900,style.accent);rect(1796,110,4,900,style.accent);
      add('text',260,340,1400,420,96,{align:'center'});
      if(values.author?.trim()){rect(860,800,200,3,style.accent);add('author',260,840,1400,70,30,{font:'serif',align:'center',bold:false});}break;
    case 'timeline': {
      const era=String(values.eyebrow||'').trim();
      rect(140,500,1640,4,style.accent);
      if(era){rect(860,462,200,80,style.accent);add('eyebrow',860,478,200,50,28,{color:'#0a1715',align:'center'});}
      add('text',260,580,1400,360,72,{align:'center'});
      if(values.author?.trim())add('author',260,960,1400,70,30,{font:'sans',align:'center',bold:false});
      break;
    }
  }
  return {...style,shapes,blocks,width:1920,height:1080};
}
export const QUOTE_SAMPLE={text:'Small steps.\nExtraordinary possibilities.',author:'A thought to carry with you',title:'Make room for possibility',text2:'Begin where you are.\nBuild as you go.',text3:'Keep moving.\nLet the journey teach you.',eyebrow:'1969'};
