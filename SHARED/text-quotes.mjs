import {blackHanMetrics} from './black-han-metrics.mjs';

// The six selected Text Quotes templates: 07, 04, 06, 08, 01 and 03.
// Coordinates are measured in the source preview's 1920 × 1080 space.
const text={key:'text',label:'Quote text',maxLength:600,placeholder:'Write your quote. Use a new line to control the layout.'};
const author={key:'author',label:'Author / attribution',maxLength:100,placeholder:'Name or source (optional)'};
const specs=[
  ['07','Framed','#ff0072','#00ffc0','You can never\nplan the future\nby the past.','Edmund Burke'],
  ['04','Wide','#00aeff','#ffd800','Life is like a box of chocolates.\nYou never know what you’re going to get','Forrest Gump'],
  ['06','Editorial','#00aeff','#ff0072','Your time is limited,\nso don’t waste\nit living someone\nelse’s life.','Steve Jobs'],
  ['08','Oversized','#00ffc0','#5a00ff','Forgiveness is\nthe final form of love','Reinhold Niebuhr'],
  ['01','Stacked','#00ffc0','#ff0072','Great minds discuss ideas\naverage minds discuss events\nsmall minds discuss people','Eleanor Roosevelt'],
  ['03','Right aligned','#ff0072','#00aeff','If you want to\nbe happy, be','Leo Tolstoy']
];
export const TEXT_QUOTE_STYLES=specs.map(([source,name,accent,authorColor,quote,attribution])=>({
  id:`text_quotes_${source}`,sourceQuote:Number(source),name,chevronQuote:true,font:'blackHan',bg:'#0b1320',fg:'#ffffff',accent,authorColor,colorControl:true,
  description:{'07':'Centered quote framed by two bright chevrons.','04':'A wide, compact quote with chevrons on both sides.','06':'Left-aligned lines with attribution above and a closing accent.','08':'A bold headline over oversized translucent quotation marks.','01':'Three clean lines with an opening chevron.','03':'Right-aligned typography with a large closing chevron.'}[source],
  sceneFit:`A bold, contemporary attributed quotation. ${name} layout with animated chevrons and sequential text reveals.`,
  fields:[text,author],colors:[['textColor','Text','#ffffff'],['accentColor','Chevrons',accent],['authorColor','Author',authorColor]],sample:{text:quote,author:attribution}
}));
export const textQuoteWidth=text=>Array.from(text).reduce((sum,c)=>sum+(blackHanMetrics[c.codePointAt(0)]??1),0);
const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,v));
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const color=(value,fallback)=>/^#[\da-f]{6}$/i.test(value||'')?value:fallback;
const layouts={
  7:{x:510,y:324,w:900,h:310,size:94,line:114,align:'center',author:{x:360,y:720,w:1200,size:42,align:'center'},dash:true,marks:[[340,426,114,120,'left'],[1468,426,114,120,'right']]},
  4:{x:340,y:488,w:1240,h:100,size:50,line:54,align:'center',author:{x:340,y:650,w:1240,size:38,align:'center'},marks:[[212,482,104,108,'left'],[1604,482,104,108,'right']]},
  6:{x:490,y:316,w:1120,h:440,size:90,line:122,align:'left',author:{x:490,y:238,w:1120,size:42,align:'left'},dash:true,marks:[[330,636,114,120,'left']]},
  8:{x:402,y:448,w:1120,h:208,size:126,secondSize:84,line:132,align:'center',author:{x:400,y:694,w:1120,size:36,align:'center'},marks:[[400,234,450,430,'left',.24],[1200,560,166,144,'right',.24]]},
  1:{x:300,y:418,w:1200,h:225,size:64,line:80,align:'left',author:{x:310,y:682,w:1400,size:42,align:'center'},dash:true,marks:[[166,374,120,126,'left']]},
  3:{x:420,y:470,w:1100,h:240,size:126,secondSize:102,line:144,align:'right',secondOffset:116,author:{x:420,y:386,w:1100,size:42,align:'right'},dash:true,marks:[[1560,382,190,200,'right']]}
};
function wrap(content,width,size){
  const lines=[];
  for(const paragraph of content.split('\n')){
    let line='';
    for(const word of paragraph.trim().split(/\s+/).filter(Boolean)){
      // Keep every character, including unusually long unbroken words.
      const chunks=[];let chunk='';
      for(const char of word){if(chunk&&textQuoteWidth(chunk+char)*size>width){chunks.push(chunk);chunk='';}chunk+=char;}
      if(chunk)chunks.push(chunk);
      for(const part of chunks){const next=line?`${line} ${part}`:part;if(line&&textQuoteWidth(next)*size>width){lines.push(line);line=part;}else line=next;}
    }
    if(line)lines.push(line);
  }
  return lines;
}
export function textQuoteLayout(style,values={}){
  const spec=layouts[style.sourceQuote],blocks=[],content=String(values.text||'').trim().toUpperCase();
  const fg=color(values.textColor,style.fg),accent=color(values.accentColor,style.accent),attributionColor=color(values.authorColor,style.authorColor);
  if(content){
    let scale=1,lines;
    // Explicit line breaks use the template's distinct headline/subline sizes.
    const entered=content.split('\n').map(s=>s.trim()).filter(Boolean);
    const explicit=entered.length>1;
    for(let attempt=0;attempt<180;attempt++){
      lines=explicit?entered:wrap(content,spec.w,spec.size*scale);
      const sizeAt=i=>(i>0&&spec.secondSize?spec.secondSize:spec.size)*scale;
      if(lines.every((line,i)=>textQuoteWidth(line)*sizeAt(i)<=spec.w)&&((lines.length-1)*spec.line+sizeAt(lines.length-1)/scale*.8)*scale<=spec.h)break;
      scale*=.965;
    }
    lines.forEach((line,i)=>{
      const fontSize=(i>0&&spec.secondSize?spec.secondSize:spec.size)*scale;
      blocks.push({key:`text-${i}`,lines:[line],x:spec.x+(i>0?(spec.secondOffset||0):0),y:spec.y+i*spec.line*scale,w:spec.w,fontSize,lineHeight:fontSize*.95,baseline:spec.y+i*spec.line*scale+fontSize*.75,color:fg,font:'blackHan',bold:false,align:spec.align,delay:.44+i*.13});
    });
  }
  const name=String(values.author||'').trim().toUpperCase().replace(/[–—]/g,'-');
  if(name){
    const a=spec.author,value=spec.dash&&!/^[–—-]/.test(name)?`- ${name}`:name;
    const size=Math.min(a.size,a.w/Math.max(1,textQuoteWidth(value)));
    blocks.push({key:'author',lines:[value],x:a.x,y:a.y,w:a.w,fontSize:size,lineHeight:size*.95,baseline:a.y+size*.75,color:attributionColor,font:'blackHan',bold:false,align:a.align,delay:.62});
  }
  return {...style,fg,accent,shapes:[],blocks,width:1920,height:1080,marks:content?spec.marks.map(([x,y,w,h,direction,opacity=1],i)=>({x,y,w,h,direction,opacity,delay:style.sourceQuote===6?.56:i*.08})):[]};
}
// Smooth, masked line entrances; a stable reading hold expands to the scene duration.
// Short scenes compress entrance/exit together instead of cutting off their text.
export function textQuoteTiming(time,duration){
  const speed=Math.min(1,Math.max(.001,duration)/3.2);
  return {enter:time/speed,exit:Math.max(0,(time-(duration-.72*speed))/speed)};
}
const ease=v=>{v=clamp(v);return 1-(1-v)**3;};
export function textQuoteMarkup(design,time=3,duration=8,id=design.id){
  const {enter,exit}=textQuoteTiming(time,duration);
  const marks=design.marks.map((m,i)=>{
    const p=ease((enter-m.delay)/.65),out=ease((exit-i*.07)/.5);
    const dir=m.direction==='left'?1:-1;
    const x=m.x+dir*70*(1-p)-dir*24*out;
    const scale=.82+.18*p;
    return `<g opacity="${m.opacity*p*(1-out)}" transform="translate(${x+m.w/2} ${m.y+m.h/2}) scale(${scale}) translate(${-m.w/2} ${-m.h/2})"><svg width="${m.w}" height="${m.h}" viewBox="${m.direction==='left'?60:20} -750 808 750" preserveAspectRatio="none" overflow="visible"><text font-family="Black Han Sans" font-size="1000" fill="${design.accent}">${m.direction==='left'?'&lt;&lt;':'&gt;&gt;'}</text></svg></g>`;
  }).join('');
  const text=design.blocks.map((b,i)=>{
    const p=ease((enter-b.delay)/.72),out=ease((exit-i*.045)/.42);
    const left=b.align==='center'?b.x+b.w/2-textQuoteWidth(b.lines[0])*b.fontSize/2:b.align==='right'?b.x+b.w-textQuoteWidth(b.lines[0])*b.fontSize:b.x;
    const width=textQuoteWidth(b.lines[0])*b.fontSize;
    const shift=(1-p)*32*(b.align==='right'?-1:1);
    const y=b.baseline+(1-p)*b.fontSize*.58-out*b.fontSize;
    return `<defs><clipPath id="${id}-${i}"><rect x="${left-3}" y="${b.y-4}" width="${(width+6)*p}" height="${b.fontSize*1.1+8}"/></clipPath></defs><g clip-path="url(#${id}-${i})" opacity="${p*(1-out)}"><text x="${left+shift}" y="${y}" font-family="Black Han Sans" font-size="${b.fontSize}" fill="${b.color}">${escape(b.lines[0])}</text></g>`;
  }).join('');
  return marks+text;
}
export function textQuoteSvg(design,time,duration,width=1920,height=1080){return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 1920 1080">${textQuoteMarkup(design,time,duration)}</svg>`;}
