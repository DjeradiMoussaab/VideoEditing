import {useEffect,useRef,useState} from 'react';
import {splitStyle,splitViewport,splitPanelAt,splitPanelGeometry,splitImageGeometry} from '../../../../../SHARED/split-screens.mjs';
import {SplitPreview} from './SplitPreview';
import {RenderedScenePreview} from './RenderedScenePreview';
const clamp=v=>Math.max(0,Math.min(100,v));
export function SplitCanvasEditor({projectId,scene,assetUrl,busy,onSave,selectedSlot,onSelectSlot}){
 const [images,setImages]=useState(scene.splitImages||[]),[playing,setPlaying]=useState(false),[saving,setSaving]=useState(false),[error,setError]=useState('');
 const drag=useRef(null),sizes=useRef({}),pending=useRef(null),locked=useRef(false);
 const style=splitStyle(scene.imageAnimationStyle),viewport=splitViewport(style);
 useEffect(()=>{if(!drag.current&&!locked.current)setImages(scene.splitImages||[]);},[scene.splitImages]);
 const frame=images[selectedSlot]||{},disabled=busy||saving;
 async function save(update){locked.current=true;setSaving(true);setError('');pending.current=update;try{await onSave(update);pending.current=null;}catch(e){setError(e.message||'Could not save framing.');}finally{locked.current=false;setSaving(false);}}
 function updateFrame(slot,values){setImages(prev=>{const next=[...prev];next[slot]={...next[slot],...values};return next;});}
 function start(e){if(disabled||locked.current||e.button!==0)return;const rect=e.currentTarget.getBoundingClientRect();const slot=splitPanelAt(style,viewport.x+(e.clientX-rect.left)/rect.width*viewport.width,viewport.y+(e.clientY-rect.top)/rect.height*viewport.height);if(slot===null)return;
  onSelectSlot(slot);e.currentTarget.focus();e.currentTarget.setPointerCapture(e.pointerId);const f=images[slot]||{};drag.current={slot,rect,startX:e.clientX,startY:e.clientY,frame:f,values:null};
 }
 function move(e){const d=drag.current;if(!d)return;const size=sizes.current[d.slot];if(!size)return;const p=splitPanelGeometry(style,d.slot),g=splitImageGeometry(p.width,p.height,...size,d.frame);
  const dx=(e.clientX-d.startX)/d.rect.width*viewport.width/p.scaleX,dy=(e.clientY-d.startY)/d.rect.height*viewport.height/p.scaleY;
  const values={x:clamp((d.frame.x??50)+(Math.abs(p.width-g.width)>1?dx/(p.width-g.width)*100:0)),y:clamp((d.frame.y??50)+(Math.abs(p.height-g.height)>1?dy/(p.height-g.height)*100:0)),zoom:d.frame.zoom??1};d.values=values;updateFrame(d.slot,values);
 }
 function end(e){const d=drag.current;if(!d)return;drag.current=null;if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);if(d.values)save({slot:d.slot,...d.values});}
 function zoom(value){if(disabled||locked.current)return;const values={x:frame.x??50,y:frame.y??50,zoom:Math.max(.5,Math.min(3,Math.round(value*100)/100))};updateFrame(selectedSlot,values);save({slot:selectedSlot,...values});}
 return <div className="split-canvas-editor">
  {playing?<RenderedScenePreview projectId={projectId} scene={scene} disabled={busy}><SplitPreview styleId={style.id} images={images} assetUrl={assetUrl} background={scene.splitBackground} numbers={false}/></RenderedScenePreview>:<SplitPreview styleId={style.id} images={images} assetUrl={assetUrl} background={scene.splitBackground} selectedSlot={selectedSlot} onImageSize={(slot,size)=>{sizes.current[slot]=size;}} tabIndex={0} onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerCancel={end} onKeyDown={e=>{if(disabled)return;if(['1','2','3'].includes(e.key)&&Number(e.key)<=style.panels){onSelectSlot(Number(e.key)-1);e.preventDefault();}if(e.key==='+'||e.key==='='){e.preventDefault();zoom((frame.zoom??1)+.1);}if(e.key==='-'){e.preventDefault();zoom((frame.zoom??1)-.1);}}}/>}
  <div className="split-canvas-toolbar">
   {!playing&&<><strong aria-live="polite">Image {selectedSlot+1} selected</strong><div className="split-canvas-zoom" role="group" aria-label="Selected image zoom"><button type="button" disabled={disabled||(frame.zoom??1)<=.5} aria-label="Zoom out selected image" onClick={()=>zoom((frame.zoom??1)-.1)}>−</button><button type="button" disabled={disabled} title="Reset zoom" onClick={()=>zoom(1)}>{Math.round((frame.zoom??1)*100)}%</button><button type="button" disabled={disabled||(frame.zoom??1)>=3} aria-label="Zoom in selected image" onClick={()=>zoom((frame.zoom??1)+.1)}>+</button></div></>}
   <button type="button" disabled={disabled} onClick={()=>setPlaying(!playing)}>{playing?'Edit images':'Play animation'}</button>
  </div>
  {!playing&&<p className="split-canvas-hint">Click an image to select · Drag to position · Choose a suggestion to replace it</p>}
  {error&&<p role="alert">{error} <button type="button" disabled={disabled} onClick={()=>pending.current&&save(pending.current)}>Retry</button></p>}
 </div>;
}
