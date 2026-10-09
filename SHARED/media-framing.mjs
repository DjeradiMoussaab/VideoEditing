export const DEFAULT_FRAMING = {zoom:1,x:.5,y:.5};
export function validateFraming(value) {
 if(!value||typeof value!=='object'||Array.isArray(value))throw Object.assign(new Error('Invalid preview framing.'),{statusCode:400});
 for(const [key,min,max] of [['zoom',.5,3],['x',0,1],['y',0,1]])if(typeof value[key]!=='number'||!Number.isFinite(value[key])||value[key]<min||value[key]>max)throw Object.assign(new Error(`Invalid framing ${key}.`),{statusCode:400});
 return value.zoom===1?{...DEFAULT_FRAMING}:{zoom:value.zoom,x:value.x,y:value.y};
}
export function framingGeometry(width,height,framing=DEFAULT_FRAMING) {
 const {zoom,x,y}=validateFraming(framing);
 if(zoom<1){
  const w=Math.max(2,Math.floor(width*zoom/2)*2),h=Math.max(2,Math.floor(height*zoom/2)*2);
  return {width:w,height:h,x:Math.round((width-w)*x/2)*2,y:Math.round((height-h)*y/2)*2};
 }
 const w=Math.max(2,Math.floor(width/zoom/2)*2),h=Math.max(2,Math.floor(height/zoom/2)*2);
 return {width:w,height:h,x:Math.round((width-w)*x/2)*2,y:Math.round((height-h)*y/2)*2};
}
