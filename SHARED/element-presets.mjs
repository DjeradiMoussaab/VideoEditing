import {createGraphic} from './graphics.mjs';
export const ELEMENT_CATEGORIES = [
  {id:'titles',label:'Titles',presets:[{id:'simple',label:'Simple title',type:'title',text:'Your title',enter:'none',exit:'none'},{id:'big',label:'Big title',type:'big-title',text:'MAKE IT COUNT'}]},
  {id:'arrows',label:'Arrows',presets:[{id:'fine',label:'Fine arrow',type:'arrow',stroke:4,rotation:-25},{id:'bold',label:'Bold arrow',type:'arrow',stroke:18}]},
  {id:'lower-thirds',label:'Lower thirds',presets:[{id:'minimal',label:'Minimal',type:'lower-third',backgroundOpacity:0},{id:'banner',label:'Banner',type:'lower-third',backgroundOpacity:.9}]},
  {id:'circles',label:'Circles',presets:[{id:'ring',label:'Outline circle',type:'circle',stroke:5},{id:'filled',label:'Filled circle',type:'circle',background:'#ffda66',backgroundOpacity:.85,stroke:1}]},
  {id:'shapes',label:'Shapes',presets:[{id:'outline',label:'Outline box',type:'rectangle',stroke:5},{id:'solid',label:'Filled box',type:'rectangle',background:'#ffda66',backgroundOpacity:.85,stroke:1}]},
  {id:'icons',label:'Icons',presets:[{id:'star',label:'Star',type:'icon',icon:'star'},{id:'check',label:'Check',type:'icon',icon:'check'}]}
];
export function applyElementPreset(element,preset,duration) {
  const next={...createGraphic(preset.type,element.start,duration,element.id),...preset,start:element.start,end:element.end,groupId:null,keyframes:[]};
  next.id=element.id;
  if(['title','big-title','lower-third'].includes(element.type)&&['title','big-title','lower-third'].includes(next.type))next.text=element.text;
  return next;
}
export const elementCategory = type => ELEMENT_CATEGORIES.find(c=>c.presets.some(p=>p.type===type))?.id||'titles';
