import {useEffect,useId,useState} from 'react';
import {splitStyle,splitSlot,splitViewport,splitImageGeometry,splitImageBounds} from '../../../../../SHARED/split-screens.mjs';
import {toAbsoluteUrl} from '../../../services/api-client';
const palette=['#356c79','#ac7855','#69679d'];
const labels={10:[[440,540],[1460,540]],9:[[440,540],[1460,540]],8:[[1300,540],[280,540]],7:[[960,720],[960,165]],6:[[960,370],[960,910]],5:[[690,540],[1640,540]],4:[[480,540],[1440,540]],3:[[480,540],[1440,540]],2:[[960,270],[960,810]],1:[[480,280],[480,810],[1440,540]]};
function Picture({source,bounds,frame,onSize,slot}){
 const {x,y,width:w,height:h}=bounds;
 const [size,setSize]=useState(null);
 useEffect(()=>{
  let active=true;
  const image=new Image();
  image.onload=()=>{if(active&&image.naturalWidth&&image.naturalHeight)setSize([image.naturalWidth,image.naturalHeight]);};
  image.src=source;
  return ()=>{active=false;image.onload=null;};
 },[source]);
 useEffect(()=>{if(size)onSize?.(slot,size);},[size,slot,onSize]);
 const g=size?splitImageGeometry(w,h,size[0],size[1],frame):null;
 // Keep images in SVG's coordinate system. Positioned HTML in foreignObject
 // can escape SVG transforms and clipping in Safari/WebKit.
 return <svg x={x} y={y} width={w} height={h} viewBox={`0 0 ${w} ${h}`} overflow="hidden" preserveAspectRatio="none"><image href={source} x={g?.x??0} y={g?.y??0} width={g?.width??w} height={g?.height??h} preserveAspectRatio={g?'none':'xMidYMid slice'} pointerEvents="none"/></svg>;
}
export function SplitPreview({styleId,images=[],assetUrl,background='#ffffff',numbers=true,selectedSlot,onImageSize,...events}){
 const style=splitStyle(styleId),prefix=useId().replace(/:/g,'');if(!style)return null;
 function layerView(layer,key){
  const maskId=`${prefix}-${key}`,slot=splitSlot(layer),[w,h]=layer.size;
  const source=toAbsoluteUrl(images[slot]?.url)||assetUrl;
  return <g key={key} transform={`translate(${layer.position}) scale(${layer.scale}) translate(${-layer.anchor[0]} ${-layer.anchor[1]})`}>
   <defs><clipPath id={`${maskId}-clip`}><rect width={w} height={h}/></clipPath>
   {layer.mask&&<mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width={w} height={h}><rect width={w} height={h} fill={layer.mask.invert?'white':'black'}/><path d={layer.mask.svgPath} fill={layer.mask.invert?'black':'white'}/></mask>}</defs>
   <g clipPath={`url(#${maskId}-clip)`} mask={layer.mask?`url(#${maskId})`:undefined}>
    {layer.child?layerView(layer.child,key+'-inner'):<><rect width={w} height={h} fill={source?background:palette[slot]}/>{source&&<Picture key={source} source={source} bounds={splitImageBounds(style,layer)} frame={images[slot]} slot={slot} onSize={onImageSize}/ >}{selectedSlot===slot&&<rect width={w} height={h} fill="#49d4a8" fillOpacity=".12" stroke="#49d4a8" strokeWidth="14"/>}</>}
   </g>
  </g>;
 }
 const v=splitViewport(style);
 return <svg {...events} className="split-layout-preview" viewBox={`${v.x} ${v.y} ${v.width} ${v.height}`} preserveAspectRatio="none" aria-label={`${style.label}, ${style.panels} images`} role="img"><rect width="1920" height="1080" fill={background}/>{[...style.motion.layers].reverse().map((layer,i)=>layerView(layer,String(i)))}{numbers&&labels[style.motion.sourceScreen].map(([x,y],i)=><g key={i} transform={`translate(${x} ${y})`}><circle r="72" fill={selectedSlot===i?'#49d4a8':'#102029b8'}/><text fill={selectedSlot===i?'#102029':'white'} fontSize="90" fontWeight="700" textAnchor="middle" dominantBaseline="middle">{i+1}</text></g>)}</svg>;
}
