const field = (key, label, maxLength, placeholder) => ({ key, label, maxLength, placeholder });
const text = field('text', 'Main quote', 600, 'Small steps can lead to extraordinary places.');
const author = field('author', 'Author / attribution', 100, 'Name or source');
const title = field('title', 'Title', 100, 'A thought worth keeping');
const secondary = field('text2', 'Second text', 400, 'Another perspective, or a supporting thought.');
const third = field('text3', 'Third text', 300, 'Leave the audience with something to remember.');
export const QUOTE_STYLES = [
  {id:'classic',name:'Classic',description:'A cinematic quotation with a blue accent.',fields:[text,author],bg:'#14273b',fg:'#f5f7fa',accent:'#45a8ed'},
  {id:'editorial',name:'Editorial',description:'Warm paper, serif typography, and an editorial heading.',fields:[title,text,author],bg:'#eee8dc',fg:'#292622',accent:'#a44e35'},
  {id:'statement',name:'Bold Statement',description:'One powerful thought in oversized typography.',fields:[{...text,label:'Statement'}],bg:'#dbef86',fg:'#17251f',accent:'#17251f'},
  {id:'framed',name:'Framed',description:'A fine gold frame and a centered quotation.',fields:[text,author],bg:'#191b24',fg:'#f4eee3',accent:'#d9b87b'},
  {id:'duet',name:'Two Voices',description:'Two complementary thoughts in contrasting columns.',fields:[title,{...text,label:'First text'},secondary,author],bg:'#e9e4dc',fg:'#222c35',accent:'#b3573d'},
  {id:'triptych',name:'Three Thoughts',description:'Three numbered ideas with a shared heading.',fields:[title,{...text,label:'First text'},secondary,third],bg:'#182c29',fg:'#eef3e9',accent:'#b5dc9a'},
  {id:'spotlight',name:'Spotlight',description:'A small label, a striking title, and supporting text.',fields:[field('eyebrow','Small label',50,'A MOMENT OF CLARITY'),title,text,author],bg:'#352343',fg:'#fff4ea',accent:'#efa887'},
  {id:'lowerthird',name:'Lower Third',description:'A documentary title card with a bold bottom band.',fields:[title,text,author],bg:'#14252e',fg:'#f5f3eb',accent:'#6cd5ba'}
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
function wrap(text, size, width, serif) {
  const capacity=Math.max(2,Math.floor(width/(size*(serif?.61:.63))));
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
    let fontSize=size,lines=wrap(content,fontSize,w,options.serif);
    while(lines.length*fontSize*1.25>h && fontSize>8){fontSize-=1;lines=wrap(content,fontSize,w,options.serif);}
    const top=y+(h-lines.length*fontSize*1.25)/2;
    blocks.push({key,lines,x,y:top,w,fontSize,lineHeight:fontSize*1.25,color:options.color||style.fg,align:options.align||'left',serif:!!options.serif,bold:options.bold!==false,delay:blocks.length*.1});
  };
  switch(style.id){
    case 'classic':
      add('mark',260,100,220,160,200,{literal:'“',serif:true,color:style.accent});
      add('text',320,270,1280,460,72,{align:'center'});
      if(values.author?.trim()){rect(650,810,620,3,style.accent);add('author',320,850,1280,75,30,{align:'center',bold:false});}break;
    case 'editorial':
      rect(120,135,100,6,style.accent);add('title',260,100,1520,80,28,{color:style.accent});
      add('text',180,240,1560,510,84,{serif:true,bold:false});
      rect(180,850,1560,2,'#b9b0a2');add('author',180,900,1560,60,28,{bold:false});break;
    case 'statement':
      rect(120,120,100,14,style.fg);add('text',160,230,1600,640,130);rect(1700,930,100,14,style.fg);break;
    case 'framed':
      rect(105,95,1710,890,style.accent,3);rect(130,120,1660,840,style.accent,1);
      add('text',320,240,1280,500,78,{serif:true,align:'center',bold:false});
      if(values.author?.trim()){rect(890,810,140,3,style.accent);add('author',320,850,1280,70,28,{align:'center',color:style.accent,bold:false});}break;
    case 'duet':
      rect(960,0,960,1080,'#263c47');add('title',120,90,760,100,36,{color:style.accent});
      add('text',120,290,720,510,70,{serif:true,bold:false});add('text2',1080,290,720,510,70,{color:'#f2eee5',serif:true,bold:false});
      add('author',120,920,720,65,28,{color:style.accent,bold:false});break;
    case 'triptych':
      add('title',120,80,1680,120,58);
      ['text','text2','text3'].forEach((key,i)=>{const x=120+i*580;rect(x,290,80,4,style.accent);add(`number${i}`,x,330,200,100,60,{literal:`0${i+1}`,color:style.accent});add(key,x,470,480,430,48,{bold:false});});break;
    case 'spotlight':
      rect(140,140,8,770,style.accent);add('eyebrow',210,135,1500,70,26,{color:style.accent});
      add('title',210,270,1500,220,100,{serif:true});add('text',210,535,1400,260,52,{bold:false});add('author',210,880,1400,65,28,{color:style.accent,bold:false});break;
    case 'lowerthird':
      rect(0,770,1920,310,style.accent);rect(140,145,90,6,style.accent);
      add('text',140,240,1600,400,76);add('title',140,810,1600,100,48,{color:'#102c27'});add('author',140,940,1600,60,30,{color:'#102c27',bold:false});break;
  }
  return {...style,shapes,blocks,width:1920,height:1080};
}
export const QUOTE_SAMPLE={text:'Small steps.\nExtraordinary possibilities.',author:'A thought to carry with you',title:'Make room for possibility',text2:'Begin where you are.\nBuild as you go.',text3:'Keep moving.\nLet the journey teach you.',eyebrow:'A FRESH PERSPECTIVE'};
