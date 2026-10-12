import {splitScreenMotion} from './split-screen-motion.mjs';
const names=['Diagonal In','Diagonal Rise','Wide Right','Wide Bottom','Wide Top','Wide Left','Center Reveal','Side Slide','Row Slide','Trio'];
export const SPLIT_STYLES=splitScreenMotion.map((motion,i)=>({id:`split_${String(motion.sourceScreen).padStart(2,'0')}`,label:names[i],category:'split',treatment:'split',manualOnly:true,panels:motion.sourceScreen===1?3:2,description:motion.sourceScreen===1?'Two stacked images beside a tall third image.':'Independently chosen images with the original staggered split-screen reveal.',estimatedM1SecPer1SecClip:.4,motion}));
export const splitStyle=id=>SPLIT_STYLES.find(style=>style.id===id);
export function splitPosition(layer,time){
 const keys=layer.keys;if(!keys)return layer.position;
 const [a,b]=keys;if(time<=a.t)return a.position;if(time>=b.t)return b.position;
 const distance=Math.hypot(...b.position.map((v,i)=>v-a.position[i]));
 const dt=b.t-a.t,x1=a.influenceOut,x2=1-b.influenceIn;
 const y1=a.speed*dt*x1/distance,y2=1-b.speed*dt*(1-x2)/distance;
 const bez=(c1,c2,t)=>3*(1-t)**2*t*c1+3*(1-t)*t*t*c2+t**3;
 let lo=0,hi=1;for(let i=0;i<24;i++){const m=(lo+hi)/2;if(bez(x1,x2,m)<(time-a.t)/dt)lo=m;else hi=m;}
 const p=bez(y1,y2,(lo+hi)/2);return a.position.map((v,i)=>v+(b.position[i]-v)*p);
}
export function splitSlot(layer){return layer.child?splitSlot(layer.child):layer.slot;}
export function splitEntranceDuration(style){return Math.max(...style.motion.layers.map(l=>(l.child||l).keys?.at(-1).t||0));}

// Trim only the authored outside frame; interior divider geometry stays intact.
const edgeBounds={1:[24,22,1898,1064],2:[20,22,1894,1058],3:[16,12,1896,1066],4:[22,12,1896,1066],5:[20,12,1900,1066],6:[20,22,1894,1050],7:[20,20,1894,1056],8:[20,12,1898,1066],9:[16,12,1894,1066],10:[20,12,1894,1066]};
export function splitViewport(style){
 const [x,y,r,b]=edgeBounds[style.motion.sourceScreen];
 // A small shared inset prevents antialiased mask edges and low-resolution rounding
 // from reintroducing a one-pixel outside frame in thumbnails or video previews.
 const inset=10;
 return {x:x+inset,y:y+inset,width:r-x-inset*2,height:b-y-inset*2};
}
function insidePolygon(points,x,y){let inside=false;for(let i=0,j=points.length-1;i<points.length;j=i++){const [xi,yi]=points[i],[xj,yj]=points[j];if((yi>y)!==(yj>y)&&x<(xj-xi)*(y-yi)/(yj-yi)+xi)inside=!inside;}return inside;}
export function splitPanelAt(style,x,y){
 function hit(layer,px,py){const lx=(px-layer.position[0])/layer.scale[0]+layer.anchor[0],ly=(py-layer.position[1])/layer.scale[1]+layer.anchor[1];
  if(lx<0||ly<0||lx>layer.size[0]||ly>layer.size[1])return null;
  if(layer.mask&&insidePolygon(layer.mask.points,lx,ly)===layer.mask.invert)return null;
  return layer.child?hit(layer.child,lx,ly):layer.slot;
 }
 for(const layer of style.motion.layers){const slot=hit(layer,x,y);if(slot!==null)return slot;}return null;
}
// Diagonal AE layers use a full-frame source canvas. Fit the image to the
// visible mask's bounding box instead, including the complement of inverted masks.
export function splitImageBounds(style,layer){
 const [width,height]=layer.size;
 if(![9,10].includes(style.motion.sourceScreen)||!layer.mask)return {x:0,y:0,width,height};
 const {points,invert}=layer.mask;
 const rows=[0,height,...points.map(p=>p[1]).filter(y=>y>0&&y<height)];
 let left=width,right=0;
 for(const y of rows){
  const cuts=[0,width];
  for(let i=0;i<points.length;i++){
   const a=points[i],b=points[(i+1)%points.length];
   if(a[1]!==b[1]&&y>=Math.min(a[1],b[1])&&y<=Math.max(a[1],b[1])){
    const x=a[0]+(b[0]-a[0])*(y-a[1])/(b[1]-a[1]);
    if(x>0&&x<width)cuts.push(x);
   }
  }
  cuts.sort((a,b)=>a-b);
  for(let i=1;i<cuts.length;i++)if(insidePolygon(points,(cuts[i-1]+cuts[i])/2,y)!==invert){left=Math.min(left,cuts[i-1]);right=Math.max(right,cuts[i]);}
 }
 const x=Math.floor(left);
 return {x,y:0,width:Math.ceil(right)-x,height};
}
export function splitPanelGeometry(style,slot){
 function find(layer,sx=1,sy=1){sx*=layer.scale[0];sy*=layer.scale[1];if(layer.child)return find(layer.child,sx,sy);return layer.slot===slot?{...splitImageBounds(style,layer),scaleX:sx,scaleY:sy}:null;}
 return style.motion.layers.map(l=>find(l)).find(Boolean);
}
export function splitImageGeometry(width,height,naturalWidth,naturalHeight,frame={}){
 frame=frame||{};
 const zoom=frame.zoom??1,scale=Math.max(width/naturalWidth,height/naturalHeight)*zoom;
 const w=naturalWidth*scale,h=naturalHeight*scale;
 return {width:w,height:h,x:(width-w)*(frame.x??50)/100,y:(height-h)*(frame.y??50)/100};
}
