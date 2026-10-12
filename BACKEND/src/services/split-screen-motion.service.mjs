import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {splitStyle,splitPosition,splitEntranceDuration,splitViewport,splitImageBounds} from '../../../SHARED/split-screens.mjs';
import {resolveVideoEncoderArgs} from '../utils/video-encoder.mjs';
const assets=fileURLToPath(new URL('../../assets/split-screens/',import.meta.url));
const quote=v=>`'${String(v).replace(/'/g, `'\\''`)}'`;
const n=v=>Number(v.toFixed(5));
const even=v=>Math.max(2,Math.round(v/2)*2);
export function splitMotionCommand(video,{img,clip,durationSec,styleId,splitImages=[],splitBackground='#ffffff'}){
 const style=splitStyle(styleId);if(!style)throw new Error('Unknown split layout.');
 const duration=Number(durationSec),fps=Number(video.fps);
 if(!Number.isFinite(duration)||duration<=0)throw new Error('Invalid split duration.');
 const sx=video.width/1920,sy=video.height/1080;
 const speed=Math.min(1,duration/Math.max(2,splitEntranceDuration(style)+.5));
 const sources=Array.from({length:style.panels},(_,i)=>splitImages[i]?.path||img);
 if(sources.some(s=>!s))throw new Error('Choose an image for each split panel.');
 const inputs=[],filters=[];let seq=0;
 const addInput=file=>{const i=inputs.length;inputs.push(`-i ${quote(file)}`);return i;};
 const blank=(w,h,name)=>filters.push(`color=c=black@0:s=${w}x${h}:r=${fps}:d=${duration},format=rgba[${name}]`);
 const expression=(layer,axis)=>{
  if(!layer.keys)return String(n((layer.position[axis]-layer.anchor[axis]*layer.scale[axis])*(axis?sy:sx)));
  const end=layer.keys.at(-1).t*speed,points=Array.from({length:97},(_,i)=>{const t=end*i/96;return [t,(splitPosition(layer,t/speed)[axis]-layer.anchor[axis]*layer.scale[axis])*(axis?sy:sx)];});
  const term=(a,b)=>{if(b-a===1){const [t,v]=points[a],[t2,v2]=points[b];return `${n(v)}+(t-${n(t)})*${n((v2-v)/(t2-t))}`;}const m=Math.floor((a+b)/2);return `if(lt(t,${n(points[m][0])}),${term(a,m)},${term(m,b)})`;};
  return `if(gte(t,${n(end)}),${n(points.at(-1)[1])},${term(0,96)})`;
 };
 const mask=(layer,label,w,h)=>{
  if(!layer.mask)return label;
  const i=addInput(path.join(assets,layer.mask.file)),id=seq++;
  filters.push(`[${i}:v]scale=${w}:${h},format=gray[mask${id}]`);
  // Preserve transparency from the animated inner precomposition.
  filters.push(`[${label}]split[rgba${id}][alphaSrc${id}];[alphaSrc${id}]alphaextract[alpha${id}];[alpha${id}][mask${id}]blend=all_mode=multiply[maskedAlpha${id}];[rgba${id}][maskedAlpha${id}]alphamerge[masked${id}]`);
  return `masked${id}`;
 };
 function panel(layer){
  const id=seq++,w=even(layer.size[0]*sx),h=even(layer.size[1]*sy);let label;
  if(layer.child){
   const child=panel(layer.child);blank(w,h,`empty${id}`);
   filters.push(`[empty${id}][${child}]overlay=x='${expression(layer.child,0)}':y='${expression(layer.child,1)}':format=auto:eval=frame[inner${id}]`);label=`inner${id}`;
  }else{
   const i=addInput(sources[layer.slot]);
   const focus=splitImages[layer.slot]||{},x=Number(focus.x??50)/100,y=Number(focus.y??50)/100,z=Number(focus.zoom??1);
   const bounds=splitImageBounds(style,layer);
   const bx=Math.max(0,Math.floor(bounds.x*sx/2)*2),by=Math.max(0,Math.floor(bounds.y*sy/2)*2);
   const bw=Math.min(w-bx,even(bounds.width*sx)),bh=Math.min(h-by,even(bounds.height*sy));
   const zw=even(bw*z),zh=even(bh*z);
   filters.push(`[${i}:v]scale=${zw}:${zh}:force_original_aspect_ratio=increase,pad=w='max(iw,${bw})':h='max(ih,${bh})':x='(ow-iw)*${x}':y='(oh-ih)*${y}':color=${splitBackground.replace('#','0x')},crop=${bw}:${bh}:x='(iw-ow)*${x}':y='(ih-oh)*${y}',pad=${w}:${h}:${bx}:${by}:color=${splitBackground.replace('#','0x')},setsar=1,format=rgba[still${id}]`);label=`still${id}`;
  }
  label=mask(layer,label,w,h);
  const rw=even(w*layer.scale[0]),rh=even(h*layer.scale[1]);
  filters.push(`[${label}]scale=${rw}:${rh}[sized${id}]`);
  if(!layer.child){filters.push(`[sized${id}]loop=loop=-1:size=1:start=0,setpts=N/${fps}/TB[panel${id}]`);return `panel${id}`;}
  return `sized${id}`;
 }
 let last='base';filters.push(`color=c=${splitBackground.replace('#','0x')}:s=${video.width}x${video.height}:r=${fps}:d=${duration},format=rgba[base]`);
 // AE layer lists are front-to-back; compose from the bottom up.
 for(const layer of [...style.motion.layers].reverse()){
  const p=panel(layer),id=seq++;
  filters.push(`[${last}][${p}]overlay=x='${expression(layer,0)}':y='${expression(layer,1)}':format=auto:eval=frame[out${id}]`);last=`out${id}`;
 }
 const viewport=splitViewport(style);
 filters.push(`[${last}]crop=${Math.round(viewport.width*sx)}:${Math.round(viewport.height*sy)}:${Math.round(viewport.x*sx)}:${Math.round(viewport.y*sy)},scale=${video.width}:${video.height},setsar=1,format=yuv420p[out]`);
 return `ffmpeg -hide_banner -loglevel error -y -filter_complex_threads 1 ${inputs.join(' ')} -filter_complex ${quote(filters.join(';'))} -map '[out]' -an -frames:v ${Math.max(1,Math.round(duration*fps))} ${resolveVideoEncoderArgs(video)} -movflags +faststart ${quote(clip)}`;
}
