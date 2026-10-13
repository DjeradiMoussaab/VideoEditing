// A single, time-addressable composition drives the editor and the exported frames.
export const GRAPHICS_VERSION = 2;
export const GRAPHIC_FONTS = {sans:'Montserrat',typewriter:'Mom´sTypewriter',script:'Signatura Monoline Script'};
export const GRAPHIC_TYPES = ['title', 'lower-third', 'big-title', 'arrow', 'circle', 'rectangle', 'icon'];
export const GRAPHIC_EFFECTS = ['none', 'fade', 'slide', 'scale', 'reveal'];
export const GRAPHIC_ICONS = ['star', 'check', 'heart', 'pin'];
export const GRAPHIC_PRESETS = [
  {type:'title', label:'Title', text:'Your title', width:.6, height:.16, fontSize:72},
  {type:'lower-third', label:'Lower third', text:'Name or title\nA little more context', x:.3, y:.8, width:.48, height:.17, fontSize:48, background:'#171b2e', backgroundOpacity:.88},
  {type:'big-title', label:'Big title', text:'MAKE IT COUNT', width:.86, height:.3, fontSize:128, fontWeight:900},
  {type:'arrow', label:'Arrow', width:.2, height:.1, color:'#ffda66'},
  {type:'circle', label:'Circle', width:.15, height:.267, color:'#ffda66'},
  {type:'rectangle', label:'Highlight', width:.3, height:.22, color:'#ffda66'},
  {type:'icon', label:'Icon', width:.1, height:.178, color:'#ffffff', icon:'star'}
];
export const clamp = (n,lo,hi) => Math.max(lo,Math.min(hi,n));
export const frameTime = (n,fps=30) => Math.round(n*fps)/fps;
export const projectDuration = scenes => (scenes||[]).reduce((sum,s)=>sum+Number(s.duration_sec||0),0);
export function createGraphic(type,time,duration,id,fps=30) {
  const preset=GRAPHIC_PRESETS.find(p=>p.type===type)||GRAPHIC_PRESETS[0];
  const start=frameTime(clamp(time,0,Math.max(0,duration-1/fps)),fps);
  return {...preset,id,start,end:Math.min(frameTime(duration,fps),frameTime(start+4,fps)),x:.5,y:.5,...preset,
    rotation:0,opacity:1,stroke:8,color:preset.color||'#ffffff',background:preset.background||'#111827',backgroundOpacity:preset.backgroundOpacity||0,
    fontWeight:preset.fontWeight||700,font:'sans',outlineWidth:0,outlineColor:'#000000',enter:'fade',exit:'fade',enterDuration:.4,exitDuration:.4,hidden:false,locked:false,keyframes:[]};
}
function fail(message){throw Object.assign(new Error(message),{statusCode:400});}
const color=(v,fallback)=>{if(v===undefined)return fallback;if(typeof v!=='string'||!/^#[\da-f]{6}$/i.test(v))fail('Use a six-digit hex color.');return v;};
const numeric=(v,fallback,min,max,name)=>{const n=v===undefined?fallback:v;if(typeof n!=='number'||!Number.isFinite(n)||n<min||n>max)fail(`Invalid ${name}.`);return n;};
export function validateGraphics(input,duration,fps=30) {
  if(!Array.isArray(input)||input.length>80)fail('Use at most 80 graphics.');
  const ids=new Set();
  return input.map(g=>{
    if(!g||typeof g!=='object'||!GRAPHIC_TYPES.includes(g.type))fail('Unknown graphic type.');
    if(typeof g.id!=='string'||! /^[a-zA-Z0-9_-]{1,80}$/.test(g.id)||ids.has(g.id))fail('Invalid or duplicate graphic ID.');
    ids.add(g.id);
    const start=frameTime(numeric(g.start,0,0,duration,'start time'),fps);
    const end=frameTime(numeric(g.end,duration,0,duration+1/fps,'end time'),fps);
    if(end-start<1/fps-1e-7||end>frameTime(duration,fps)+1e-7)fail('Graphics must last at least one frame and stay inside the project.');
    if(g.text!==undefined&&(typeof g.text!=='string'||g.text.length>500||/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(g.text)))fail('Graphic text must be at most 500 characters.');
    const effect=key=>{const v=g[key]??'fade';if(!GRAPHIC_EFFECTS.includes(v))fail('Unknown animation.');return v;};
    const groupId=g.groupId||null;if(groupId!==null&&(typeof groupId!=='string'||! /^[a-zA-Z0-9_-]{1,80}$/.test(groupId)))fail('Invalid group.');
    const keyframes=g.keyframes||[];
    if(!Array.isArray(keyframes)||keyframes.length>40)fail('Use at most 40 keyframes per graphic.');
    if(keyframes.some(k=>!k||typeof k!=='object'||Array.isArray(k)))fail('Invalid keyframe.');
    const keys=keyframes.map(k=>({at:numeric(k.at,0,0,1,'keyframe time'),x:numeric(k.x,g.x??.5,0,1,'keyframe X'),y:numeric(k.y,g.y??.5,0,1,'keyframe Y'),scale:numeric(k.scale,1,.1,4,'keyframe scale'),rotation:numeric(k.rotation,0,-360,360,'keyframe rotation'),opacity:numeric(k.opacity,1,0,1,'keyframe opacity')})).sort((a,b)=>a.at-b.at);
    if(keys.some((k,i)=>i&&Math.abs(k.at-keys[i-1].at)<1e-6))fail('Keyframe times must be different.');
    return {id:g.id,type:g.type,start,end,text:g.text||'',x:numeric(g.x,.5,0,1,'X'),y:numeric(g.y,.5,0,1,'Y'),width:numeric(g.width,.4,.02,1,'width'),height:numeric(g.height,.2,.02,1,'height'),rotation:numeric(g.rotation,0,-360,360,'rotation'),opacity:numeric(g.opacity,1,0,1,'opacity'),fontSize:numeric(g.fontSize,64,12,240,'font size'),fontWeight:[400,700,900].includes(g.fontWeight)?g.fontWeight:700,font:Object.hasOwn(GRAPHIC_FONTS,g.font)?g.font:'sans',outlineWidth:numeric(g.outlineWidth,0,0,12,'text outline'),outlineColor:color(g.outlineColor,'#000000'),stroke:numeric(g.stroke,8,1,40,'stroke'),color:color(g.color,'#ffffff'),background:color(g.background,'#111827'),backgroundOpacity:numeric(g.backgroundOpacity,0,0,1,'background opacity'),enter:effect('enter'),exit:effect('exit'),enterDuration:numeric(g.enterDuration,.4,0,5,'entrance duration'),exitDuration:numeric(g.exitDuration,.4,0,5,'exit duration'),hidden:g.hidden===true,locked:g.locked===true,groupId,icon:GRAPHIC_ICONS.includes(g.icon)?g.icon:'star',keyframes:keys};
  });
}
export function graphicPose(g,time) {
  const duration=g.end-g.start,local=time-g.start;
  const compression=Math.min(1,duration/Math.max(.00001,g.enterDuration+g.exitDuration));
  const enter=g.enterDuration*compression,exit=g.exitDuration*compression;
  const ease=x=>{x=clamp(x,0,1);return x*x*(3-2*x);};
  const a=enter?ease(local/enter):1,b=exit?ease((duration-local)/exit):1;
  let pose={x:g.x,y:g.y,scale:1,rotation:g.rotation,opacity:g.opacity,reveal:1};
  const keys=g.keyframes||[],p=clamp(local/duration,0,1);
  if(keys.length){
    const before=[...keys].reverse().find(k=>k.at<=p)||keys[0],after=keys.find(k=>k.at>=p)||keys.at(-1);
    const mix=after.at===before.at?0:ease((p-before.at)/(after.at-before.at));
    for(const key of ['x','y','scale','rotation','opacity'])pose[key]=before[key]+(after[key]-before[key])*mix;
    pose.opacity*=g.opacity;
  }
  for(const [effect,amount,direction] of [[g.enter,a,1],[g.exit,b,-1]]) {
    if(effect!=='none')pose.opacity*=amount;
    if(effect==='slide')pose.y+=(1-amount)*.06*direction;
    if(effect==='scale')pose.scale*=.75+.25*amount;
    if(effect==='reveal')pose.reveal*=amount;
  }
  return pose;
}
const xml=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
export function graphicMarkup(g,time) {
  if(g.hidden||time<g.start||time>=g.end)return '';
  const p=graphicPose(g,time),w=g.width*1920,h=g.height*1080;
  let content='';
  if(['title','lower-third','big-title'].includes(g.type)){
    const maxChars=Math.max(5,Math.floor((w-32)/(g.fontSize*.62)));
    const lines=[];
    for(const paragraph of g.text.split('\n')){
      let line='';for(const word of paragraph.split(/\s+/)){
        const parts=word.match(new RegExp(`.{1,${maxChars}}`,'gu'))||[''];
        for(const part of parts){if(line&&(line+' '+part).length>maxChars){lines.push(line);line='';}line+=(line?' ':'')+part;}
      }lines.push(line);
    }
    const size=Math.min(g.fontSize,(h-20)/Math.max(1,lines.length)/1.22);
    content=`<rect x="${-w/2}" y="${-h/2}" width="${w}" height="${h}" rx="8" fill="${g.background}" fill-opacity="${g.backgroundOpacity}"/>`;
    if(g.type==='lower-third')content+=`<rect x="${-w/2}" y="${-h/2}" width="6" height="${h}" fill="${g.color}"/>`;
    content+=lines.map((line,i)=>`<text x="${g.type==='lower-third'?-w/2+24:0}" y="${(i-(lines.length-1)/2)*size*1.22+size*.34}" text-anchor="${g.type==='lower-third'?'start':'middle'}" font-family="${xml(GRAPHIC_FONTS[g.font]||GRAPHIC_FONTS.sans)}" font-weight="${g.fontWeight}" font-size="${size}" fill="${g.color}" stroke="${g.outlineColor||'#000000'}" stroke-width="${g.outlineWidth||0}" paint-order="stroke fill" stroke-linejoin="round">${xml(line)}</text>`).join('');
  }else if(g.type==='circle')content=`<ellipse rx="${Math.max(1,w/2-g.stroke)}" ry="${Math.max(1,h/2-g.stroke)}" fill="${g.background}" fill-opacity="${g.backgroundOpacity}" stroke="${g.color}" stroke-width="${g.stroke}"/>`;
  else if(g.type==='rectangle')content=`<rect x="${-w/2+g.stroke/2}" y="${-h/2+g.stroke/2}" width="${Math.max(1,w-g.stroke)}" height="${Math.max(1,h-g.stroke)}" rx="10" fill="${g.background}" fill-opacity="${g.backgroundOpacity}" stroke="${g.color}" stroke-width="${g.stroke}"/>`;
  else if(g.type==='arrow')content=`<path d="M ${-w/2+g.stroke} 0 H ${w/2-g.stroke} M ${w*.15} ${-h/2+g.stroke} L ${w/2-g.stroke} 0 L ${w*.15} ${h/2-g.stroke}" fill="none" stroke="${g.color}" stroke-width="${g.stroke}" stroke-linecap="round" stroke-linejoin="round"/>`;
  else {
    const paths={star:'M0 -48 14 -16 48 -15 22 8 30 43 0 25 -30 43 -22 8 -48 -15 -14 -16Z',check:'M-40 0 -10 30 42 -32',heart:'M0 40 C-80 -8 -36 -65 0 -28 C36 -65 80 -8 0 40Z',pin:'M0 48 C-65 -22 -22 -65 0 -45 C22 -65 65 -22 0 48Z'};
    content=`<g transform="scale(${w/110} ${h/110})"><path d="${paths[g.icon]}" fill="${g.icon==='check'?'none':g.color}" stroke="${g.color}" stroke-width="${g.icon==='check'?10:2}" stroke-linejoin="round" stroke-linecap="round"/></g>`;
  }
  const clipId=`reveal_${g.id}`;
  return `<g transform="translate(${p.x*1920} ${p.y*1080}) rotate(${p.rotation}) scale(${p.scale})" opacity="${p.opacity}"><defs><clipPath id="${clipId}"><rect x="${-w/2-50}" y="${-h/2-50}" width="${(w+100)*p.reveal}" height="${h+100}"/></clipPath></defs><g clip-path="url(#${clipId})">${content}</g></g>`;
}
export function graphicsSvg(graphics,time,width=1920,height=1080) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 1920 1080">${graphics.map(g=>graphicMarkup(g,time)).join('')}</svg>`;
}
export function moveGraphicTime(graphics,id,kind,delta,duration,fps=30,snapPoints=[],threshold=0) {
  const selected=graphics.find(g=>g.id===id);if(!selected||selected.locked)return graphics;
  const targets=kind==='move'&&selected.groupId?graphics.filter(g=>g.groupId===selected.groupId):[selected];
  if(targets.some(g=>g.locked))return graphics;
  let d=frameTime(delta,fps);
  const edges=kind==='start'?[selected.start]:kind==='end'?[selected.end]:[selected.start,selected.end];
  let best=threshold;
  for(const edge of edges)for(const point of snapPoints){const distance=Math.abs(edge+d-point);if(distance<best){best=distance;d=point-edge;}}
  if(kind==='move')d=clamp(d,-Math.min(...targets.map(g=>g.start)),duration-Math.max(...targets.map(g=>g.end)));
  const ids=new Set(targets.map(g=>g.id));
  return graphics.map(g=>!ids.has(g.id)?g:{...g,start:frameTime(kind==='end'?g.start:kind==='start'?clamp(g.start+d,0,g.end-1/fps):g.start+d,fps),end:frameTime(kind==='start'?g.end:kind==='end'?clamp(g.end+d,g.start+1/fps,duration):g.end+d,fps)});
}
