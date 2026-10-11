import {lifestyleMotion} from './modern-lifestyle-motion.mjs';
import {typographyMetrics} from './typography-metrics.mjs';

const field=(key,label,maxLength,placeholder)=>({key,label,maxLength,placeholder});
const description=field('text3','Description',300,'TYPE SOME FEW DESCRIPTION\nHERE TO EXPLAIN A BIT.');
const common={category:'opener',lifestyle:true,bg:'#000000',fg:'#ffffff',font:'montserratBlack',colorControl:true};
const colors=(accent,description=true)=>[
 ['textColor','Heading','#ffffff'],['accentColor','Accent',accent],
 ...(description?[['descriptionColor','Description','#eaeaea'],['lineColor','Divider','#ffffff']]:[]),
 ['backgroundColor','Background','#000000'],['glowColor','Reveal glow','#ffffff'],['atmosphereColor','Light leaks','#5476d7']
];
export const LIFESTYLE_STYLES=[
 {...common,id:'lifestyle_intro',name:'Lifestyle',sourceScene:1,accent:'#ffba00',description:'A sweeping photo reveal with a light heading, bold accent title and staggered description.',fields:[field('text','Heading',600,'MODERN'),field('text2','Accent title',400,'LIFESTYLE'),description],colors:colors('#ffba00'),sample:{text:'MODERN',text2:'LIFESTYLE',text3:'TYPE SOME FEW DESCRIPTION\nHERE TO EXPLAIN A BIT.'}},
 {...common,id:'lifestyle_minimal',name:'Minimal',sourceScene:3,accent:'#ffea00',description:'A wide reveal with a large centered title, sliding divider and description.',fields:[field('text','Title',600,'MINIMAL'),description],colors:colors('#ffea00').filter(c=>c[0]!=='textColor').map(c=>c[0]==='accentColor'?[c[0],'Title',c[2]]:c),sample:{text:'MINIMAL',text3:'TYPE SOME FEW DESCRIPTION\nHERE TO EXPLAIN A BIT.'}},
 {...common,id:'lifestyle_focus',name:'Spotlight',sourceScene:4,accent:'#ffc000',description:'A rising photo reveal with a bold right-aligned two-line title and description.',fields:[field('text','Heading',600,'VIDEO'),field('text2','Accent title',400,'TUTORIAL'),description],colors:colors('#ffc000'),sample:{text:'VIDEO',text2:'TUTORIAL',text3:'TYPE SOME FEW DESCRIPTION\nHERE TO EXPLAIN A BIT.'}},
 {...common,id:'lifestyle_logo',name:'Signature',sourceScene:10,accent:'#ffffff',description:'A luminous rising reveal with one bold centered name or title.',fields:[field('text','Name / title',600,'YOUR LOGO')],colors:colors('#ffffff',false).filter(c=>c[0]!=='accentColor'),sample:{text:'YOUR LOGO'}},
];
export const LIFESTYLE_COLOR_KEYS=['descriptionColor','lineColor','backgroundColor','glowColor','atmosphereColor'];
const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,n));
const bezier=(a,b,c,d,t)=>a*(1-t)**3+3*b*(1-t)**2*t+3*c*(1-t)*t*t+d*t*t*t;
// Premiere stores normalized spatial values, temporal speed and influence per key.
export function lifestyleCurve(keys,time) {
 if(time<=keys[0].t)return keys[0].v;
 for(let i=1;i<keys.length;i++){
  const a=keys[i-1],b=keys[i];if(time>b.t)continue;
  const duration=b.t-a.t,p=clamp((time-a.t)/duration),distance=Math.hypot(...b.v.map((v,j)=>v-a.v[j]));
  if(!distance)return a.v;
  if(!a.bezier)return a.v.map((v,j)=>v+(b.v[j]-v)*p);
  const x1=clamp(a.influenceOut),x2=1-clamp(b.influenceIn);
  let lo=0,hi=1;
  for(let k=0;k<28;k++){const mid=(lo+hi)/2;if(bezier(0,x1,x2,1,mid)<p)lo=mid;else hi=mid;}
  const q=(lo+hi)/2;
  const y1=clamp(Math.abs(a.outSpeed)*duration*x1/distance),y2=1-clamp(Math.abs(b.inSpeed)*duration*(1-x2)/distance);
  const progress=bezier(0,y1,y2,1,q);
  return a.v.map((v,j)=>v+(b.v[j]-v)*progress);
 }
 return keys.at(-1).v;
}
// Extend the settled middle for long scenes; retain both entrance and exit.
export function lifestyleTime(time,duration,sourceDuration){
 const speed=Math.min(1,duration/sourceDuration),hold=Math.max(0,duration-sourceDuration),hinge=4*speed;
 return time<hinge?time/speed:time<hinge+hold?4:(time-hold)/speed;
}
const width=(text,font)=>Array.from(text).reduce((n,c)=>n+(typographyMetrics[c.codePointAt(0)]??.7),0)*(font==='montserratLight'?.93:1);
function wrap(text,font,size,maxWidth){
 const result=[];
 for(const paragraph of text.split('\n')){
  let line='';
  for(const word of paragraph.split(/\s+/).filter(Boolean)){
   if(width(word,font)*size>maxWidth){
    if(line){result.push(line);line='';}
    for(const c of word){if(width(line+c,font)*size>maxWidth&&line){result.push(line);line='';}line+=c;}
   }else if(line&&width(`${line} ${word}`,font)*size>maxWidth){result.push(line);line=word;}else line=line?`${line} ${word}`:word;
  }
  result.push(line);
 }
 return result;
}
export function lifestyleLayout(style,values={}){
 const motion=lifestyleMotion[style.sourceScene],blocks=[],shapes=[];
 const primary=motion.layers.at(-1),body=motion.layers.find(l=>l.name!==primary.name&&l.name.startsWith('Text'));
 const line=motion.layers.find(l=>l.name==='Line Color');
 const color=(key,fallback)=>values[key]||fallback;
 const add=(layer,key,content,font,colorValue,{maxWidth,maxHeight,baselineOffset=0,sizeOverride}={})=>{
  const text=String(content||'').trim().toUpperCase().replace(/\r\n?/g,'\n');if(!text)return;
  const doc=layer.text,ss=doc.mStyleSheet,baseSize=sizeOverride??ss.mFontSize.mParamValues[0][1]*layer.textScale*layer.scale;
  let size=baseSize,lines;
  do {lines=wrap(text,font,size,maxWidth);if(lines.length*size*1.08<=maxHeight)break;size-=1;}while(size>2);
  const anchorX=layer.position[0]*1920+(layer.textPosition[0]-.5)*layer.size[0]*layer.scale;
  let baseline=layer.position[1]*1080+(layer.textPosition[1]-.5)*layer.size[1]*layer.scale+baselineOffset;
  const align=doc.mAlignment===2?'center':doc.mAlignment===1?'right':'left';
  const lineHeight=(ss.mFontSize.mParamValues[0][1]*1.2+doc.mLeading)*layer.textScale*layer.scale*(size/baseSize);
  if(key!=='text3')baseline-=(lines.length-1)*Math.max(size*.8,lineHeight);
  const naturalTop=baseline-size*.72;
  const x=align==='center'?anchorX-maxWidth/2:align==='right'?anchorX-maxWidth:anchorX;
  blocks.push({key,lines,x,w:maxWidth,y:naturalTop,baseline,fontSize:size,lineHeight:Math.max(size*.8,lineHeight),color:colorValue,font,bold:font!=='montserratLight',align,delay:layer.start,layer});
 };
 if(style.sourceScene===1||style.sourceScene===4){
  const size=100*primary.textScale*primary.scale,secondOffset=(120+primary.text.mLeading)*primary.textScale*primary.scale;
  add(primary,'text',values.text,style.sourceScene===1?'montserratLight':'montserratBlack',color('textColor','#ffffff'),{maxWidth:900,maxHeight:150});
  add(primary,'text2',values.text2,'montserratBlack',color('accentColor',style.accent),{maxWidth:900,maxHeight:150,baselineOffset:secondOffset,sizeOverride:size});
 }else add(primary,'text',values.text,'montserratBlack',style.sourceScene===3?color('accentColor',style.accent):color('textColor','#ffffff'),{maxWidth:1550,maxHeight:260});
 if(body)add(body,'text3',values.text3,'montserratBlack',color('descriptionColor','#eaeaea'),{maxWidth:900,maxHeight:145});
 if(line)shapes.push({x:line.position[0]*1920-1920*line.scaleX/2,y:line.position[1]*1080-1080*line.scale/2,w:1920*line.scaleX,h:1080*line.scale,color:color('lineColor','#ffffff'),layer:line});
 return {...style,bg:color('backgroundColor',style.bg),blocks,shapes,width:1920,height:1080,motion};
}
