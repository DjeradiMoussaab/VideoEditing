import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {LIFESTYLE_STYLES,lifestyleLayout,lifestyleCurve,lifestyleTime} from '../../../SHARED/modern-lifestyle.mjs';
import {resolveVideoEncoderArgs} from '../utils/video-encoder.mjs';

const assets=fileURLToPath(new URL('../../assets/modern-lifestyle/',import.meta.url));
const blackFont=fileURLToPath(new URL('../../assets/typography-titles/Montserrat-Black.ttf',import.meta.url));
const shell=value=>`'${String(value).replace(/'/g, `'\\''`)}'`;
const filterPath=value=>String(value).replace(/[\\':]/g, '\\$&').replace(/[\\'\[\],;]/g, '\\$&');
const num=n=>Number(n.toFixed(6));
const rgb=hex=>hex.slice(1).match(/../g).map(v=>parseInt(v,16)/255);
const tint=hex=>{const [r,g,b]=rgb(hex);return `colorchannelmixer=rr=${r}:gg=${g}:bb=${b}`;};
const isVideo=file=>/\.(mp4|mov|mkv|webm|avi|m4v)$/i.test(file);

// Compact, adaptive piecewise-linear evaluation of the original temporal Beziers.
// Expressions run per frame; no JavaScript frame rasterizer or browser is needed.
export function lifestyleExpression(fn,duration,variable='t',tolerance=.12){
 const points=[[0,fn(0)]];
 function sample(a,b,va,vb,depth){
  const m=(a+b)/2,vm=fn(m),q=(a*3+b)/4,vq=fn(q);
  if(depth<11 && (Math.abs(vm-(va+vb)/2)>tolerance||Math.abs(vq-(va*.75+vb*.25))>tolerance)){
   sample(a,m,va,vm,depth+1);sample(m,b,vm,vb,depth+1);
  }else points.push([b,vb]);
 }
 // Seed short intervals so a settled middle cannot hide an entrance/exit.
 for(let a=0;a<duration;a+=.5){const b=Math.min(duration,a+.5);sample(a,b,fn(a),fn(b),0);}
 const kept=[points[0]];
 for(let i=1;i<points.length-1;i++){
  const a=kept.at(-1),b=points[i],c=points[i+1],linear=a[1]+(c[1]-a[1])*(b[0]-a[0])/(c[0]-a[0]);
  if(Math.abs(b[1]-linear)>tolerance/3)kept.push(b);
 }
 kept.push(points.at(-1));
 function expression(a,b){
  if(b-a===1){const [t0,v0]=kept[a],[t1,v1]=kept[b];if(Math.abs(v1-v0)<1e-7)return String(num(v0));return `${num(v0)}+(${variable}-${num(t0)})*${num((v1-v0)/(t1-t0))}`;}
  const m=Math.floor((a+b)/2);return `if(lt(${variable},${num(kept[m][0])}),${expression(a,m)},${expression(m,b)})`;
 }
 return expression(0,kept.length-1);
}

export function modernLifestyleCommand(ctx,video,{clip,durationSec,quoteStyleId,quoteText='',quoteFields={},inputVideo=null,mediaOffsetSec=0}){
 const style=LIFESTYLE_STYLES.find(s=>s.id===quoteStyleId);
 if(!style)throw new Error('Unknown lifestyle opener.');
 const duration=Number(durationSec);
 if(!Number.isFinite(duration)||duration<=0)throw new Error('Invalid opener duration.');
 const design=lifestyleLayout(style,{text:quoteText,...quoteFields}),{motion}=design;
 const w=video.width,h=video.height,fps=video.fps,sx=w/1920,sy=h/1080;
 const native=motion.duration,speed=Math.min(1,duration/native),hold=Math.max(0,duration-native);
 const sourceTime=t=>lifestyleTime(t,duration,native);
 const expr=(fn,variable='t',tolerance=.12)=>lifestyleExpression(fn,duration,variable,tolerance);
 const col=(key,fallback)=>quoteFields[key]||fallback;
 const inputs=[],graph=[];
 fs.mkdirSync(ctx.paths.clipCacheDir,{recursive:true});
 const safeFile=(prefix,content,suffix)=>{
  const name=path.join(ctx.paths.clipCacheDir,`${prefix}_${crypto.createHash('sha256').update(content).digest('hex')}.${suffix}`);
  if(!fs.existsSync(name))fs.writeFileSync(name,content);return name;
 };
 const opacityInput=(fn,width,height,label)=>{
  const pixels=Buffer.from(Array.from({length:Math.max(1,Math.round(duration*fps))},(_,frame)=>Math.round(Math.max(0,Math.min(1,fn(frame/fps)))*255)));
  const file=safeFile('lifestyle-alpha',pixels,'gray'),index=inputs.length;
  inputs.push(`-f rawvideo -pixel_format gray -video_size 1x1 -framerate ${fps} -i ${shell(file)}`);
  graph.push(`[${index}:v]scale=${width}:${height}:flags=neighbor,format=gray[${label}]`);
 };
 const source=inputVideo&&fs.existsSync(inputVideo)?inputVideo:null;
 inputs.push(source?(isVideo(source)?`-stream_loop -1 -ss ${Math.max(0,Number(mediaOffsetSec)||0)} -i ${shell(source)}`:`-loop 1 -i ${shell(source)}`):`-f lavfi -i ${shell(`color=c=0x313448:s=${w}x${h}:r=${fps}`)}`);
 inputs.push(`-i ${shell(path.join(assets,`matte-${style.sourceScene}.mkv`))}`);
 inputs.push(`-i ${shell(path.join(assets,`glow-${style.sourceScene}.mkv`))}`);
 inputs.push(`-stream_loop -1 -i ${shell(path.join(assets,'atmosphere.mp4'))}`);
 inputs.push(`-stream_loop -1 -i ${shell(path.join(assets,'texture.mp4'))}`);
 inputs.push(`-loop 1 -i ${shell(path.join(assets,'vignette.png'))}`);
 graph.push(`[0:v]fps=${fps},scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},setsar=1,split=2[photo][backphoto]`);
 graph.push(`[backphoto]scale=${Math.ceil(w*1.4/2)*2}:${Math.ceil(h*1.4/2)*2},crop=${w}:${h},format=gbrp[back]`);
 graph.push(`color=c=${design.bg.replace('#','0x')}:s=${w}x${h}:r=${fps}:d=${duration},format=gbrp[solid]`);
 opacityInput(t=>Math.min(.1,sourceTime(t)/2.54*.1)*Math.min(1,Math.max(0,(native-sourceTime(t))/.6)),w,h,'backAlpha');
 graph.push('[solid][back][backAlpha]maskedmerge[base]');
 const scale=t=>lifestyleCurve(motion.imageScale,sourceTime(t))[0]/100;
 const position=t=>lifestyleCurve(motion.imageMove,sourceTime(t));
 const z=expr(t=>2*scale(t),'on/'+fps,.0001);
 const x=expr(t=>w-w/(2*scale(t))-w*(position(t)[0]-.5)/scale(t),'on/'+fps);
 const y=expr(t=>h-h/(2*scale(t))-h*(position(t)[1]-.5)/scale(t),'on/'+fps);
 graph.push(`[photo]pad=${w*2}:${h*2}:${w/2}:${h/2},fillborders=left=${w/2}:right=${w/2}:top=${h/2}:bottom=${h/2}:mode=reflect,zoompan=z='${z}':x='${x}':y='${y}':d=1:fps=${fps}:s=${w}x${h},format=gbrp,colorchannelmixer=rr=.8:gg=.8:bb=.8[image]`);
 graph.push(`[1:v]setpts='(PTS-STARTPTS)*${speed}+if(gte(T,4),${hold}/TB,0)',fps=${fps},scale=${w}:${h},format=gray,tpad=stop_mode=clone:stop_duration=${duration}[matte]`);
 graph.push(`[base][image][matte]maskedmerge,format=gbrp[reveal]`);
 graph.push(`[2:v]trim=duration=3.533333,setpts=(PTS-STARTPTS)*${speed},fps=${fps},scale=${w}:${h},format=gbrp,${tint(col('glowColor','#ffffff'))},tpad=stop_mode=add:stop_duration=${duration}:color=black[glow]`);
 graph.push('[reveal][glow]blend=all_mode=screen[lit]');
 let last='lit',index=0;
 const delta=(layer,t,axis)=>{const p=lifestyleCurve(layer.move,sourceTime(t)-layer.start);return (p[axis]-.5)*layer.size[axis]*(axis?layer.scale:layer.scaleX)*(axis?sy:sx);};
 const alpha=(layer,t)=>sourceTime(t)<layer.start?0:Math.max(0,Math.min(1,lifestyleCurve(layer.opacity,sourceTime(t)-layer.start)[0]/100));
 for(const shape of design.shapes){
  const layer=shape.layer,idx=index++,rw=Math.max(2,Math.round(shape.w*sx)),rh=Math.max(2,Math.round(shape.h*sy));
  opacityInput(t=>alpha(layer,t),rw,rh,`lineAlpha${idx}`);
  graph.push(`color=c=${shape.color.replace('#','0x')}:s=${rw}x${rh}:r=${fps}:d=${duration},format=rgb24[lineColor${idx}]`);
  graph.push(`[lineColor${idx}][lineAlpha${idx}]alphamerge[line${idx}]`);
  graph.push(`[${last}][line${idx}]overlay=x='${expr(t=>shape.x*sx+delta(layer,t,0))}':y='${expr(t=>shape.y*sy+delta(layer,t,1))}':eval=frame:format=auto[text${idx}]`);last=`text${idx}`;
 }
 for(const block of design.blocks){
  const layer=block.layer,font=block.font==='montserratLight'?path.join(assets,'Montserrat-Light.ttf'):blackFont;
  for(const [lineIndex,text] of block.lines.entries()){
   const file=safeFile('lifestyle-text',text,'txt'),idx=index++;
   const anchor=block.align==='center'?block.x+block.w/2:block.align==='right'?block.x+block.w:block.x;
   const horizontal=block.align==='center'?'-text_w/2':block.align==='right'?'-text_w':'';
   const draw=`drawtext=fontfile=${filterPath(font)}:textfile=${filterPath(file)}:expansion=none:fontsize=${block.fontSize*sy}:fontcolor=${block.color.replace('#','0x')}:x='${expr(t=>anchor*sx+delta(layer,t,0))}${horizontal}':y='${expr(t=>(block.baseline+lineIndex*block.lineHeight)*sy+delta(layer,t,1))}-ascent':alpha='${expr(t=>alpha(layer,t),'t',.001)}':shadowcolor=black@0.5:shadowx=${3.535*sx}:shadowy=${3.535*sy}`;
   graph.push(`[${last}]${draw}[text${idx}]`);last=`text${idx}`;
  }
 }
 graph.push(`[5:v]scale=${w}:${h},format=rgba[vignette]`);
 graph.push(`[${last}][vignette]overlay=0:0:format=auto,format=gbrp[vignetted]`);
 graph.push(`[4:v]fps=${fps},scale=${w}:${h},format=gbrp[texture]`);
 graph.push('[vignetted][texture]blend=all_mode=overlay:all_opacity=0.05[textured]');
 // Tint is controllable; the default retains the supplied blue light-leak colors.
 const atmosphere=col('atmosphereColor','#5476d7');
 graph.push(`[3:v]fps=${fps},scale=${w}:${h},format=gbrp${atmosphere==='#5476d7'?'':`,hue=s=0,${tint(atmosphere)}`}[atmosphere]`);
 graph.push(`[textured][atmosphere]blend=all_mode=screen,unsharp=5:5:0.4:3:3:0,curves=master='0/0 0.2745098/0.2235294 0.8/0.8392157 1/1':blue='0/0.1058824 1/1',trim=duration=${duration}${style.sourceScene===10?`,fade=t=out:st=${Math.max(0,duration-Math.min(1.3,duration*.18))}:d=${Math.min(1.3,duration*.18)}`:''},setsar=1,format=yuv420p[out]`);
 const script=safeFile('lifestyle-filter',graph.join(';\n'),'txt');
 return `ffmpeg -hide_banner -loglevel error -y -filter_complex_threads 1 ${inputs.join(' ')} -filter_complex_script ${shell(script)} -map '[out]' -frames:v ${Math.max(1,Math.round(duration*fps))} -an ${resolveVideoEncoderArgs(video)} -movflags +faststart ${shell(clip)}`;
}
