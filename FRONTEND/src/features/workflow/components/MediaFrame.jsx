import {useEffect,useRef,useState} from 'react';
import {DEFAULT_FRAMING,framingGeometry} from '../../../../../SHARED/media-framing.mjs';
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));

// Zoom affects only picture pixels. Controls remain outside the transformed layer.
export function MediaFrame({scene,updatedAt,busy,onSave,children,playbackControls=false}) {
 const [frame,setFrame]=useState(scene.mediaFraming||DEFAULT_FRAMING),[saving,setSaving]=useState(false),[error,setError]=useState('');
 const [playback,setPlayback]=useState({playing:false,time:0,duration:0});
 const root=useRef(null),drag=useRef(null),current=useRef(frame),pending=useRef(null),running=useRef(false),mounted=useRef(true),revision=useRef(updatedAt),saveRef=useRef(onSave);
 saveRef.current=onSave;
 if(!running.current)revision.current=updatedAt;
 const disabled=busy&&!saving;
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 useEffect(()=>{if(!running.current&&!drag.current){const next=scene.mediaFraming||DEFAULT_FRAMING;current.current=next;setFrame(next);}},[scene.mediaFraming]);
 const media=()=>root.current?.querySelector('video');
 function change(next){current.current=next;setFrame(next);}
 async function commit(){
  pending.current={...current.current};
  if(running.current)return;
  running.current=true;setSaving(true);setError('');
  try{
   while(pending.current){
    const next=pending.current;pending.current=null;
    const result=await saveRef.current(scene.scene_id,{framing:next,expectedUpdatedAt:revision.current});
    revision.current=result.updatedAt;
   }
  }catch(e){pending.current=null;if(mounted.current)setError(e.message||'Could not save zoom. Try again.');}
  finally{running.current=false;if(mounted.current)setSaving(false);}
 }
 function zoom(value){
  if(disabled)return;
  const z=clamp(Math.round(value*100)/100,.5,3);
  change(z===1?{...DEFAULT_FRAMING}:{...current.current,zoom:z});void commit();
 }
 function begin(e){
  if(disabled||e.button!==0||current.current.zoom===1||e.target.closest('button,input'))return;
  e.preventDefault();media()?.pause();
  const rect=root.current.getBoundingClientRect();drag.current={x:e.clientX,y:e.clientY,frame:{...current.current},rect};
  e.currentTarget.setPointerCapture(e.pointerId);
 }
 function move(e){
  const d=drag.current;if(!d)return;
  change({...d.frame,x:clamp(d.frame.x-(e.clientX-d.x)/(d.rect.width*(d.frame.zoom-1)),0,1),y:clamp(d.frame.y-(e.clientY-d.y)/(d.rect.height*(d.frame.zoom-1)),0,1)});
 }
 function end(){if(drag.current){drag.current=null;void commit();}}
 function updatePlayback(e){const v=e.target;if(v.tagName==='VIDEO')setPlayback({playing:!v.paused,time:v.currentTime||0,duration:Number.isFinite(v.duration)?v.duration:0});}
 const box=framingGeometry(1920,1080,frame);
 const sx=frame.zoom<1?box.width/1920:1920/box.width,sy=frame.zoom<1?box.height/1080:1080/box.height;
 const tx=frame.zoom<1?box.x/1920*100:-box.x/1920*sx*100,ty=frame.zoom<1?box.y/1080*100:-box.y/1080*sy*100;
 return <div className={`media-frame ${frame.zoom!==1?'is-zoomed':''} ${drag.current?'is-panning':''}`} ref={root} aria-label="Media preview" onTimeUpdateCapture={updatePlayback} onPlayCapture={updatePlayback} onPauseCapture={updatePlayback} onLoadedMetadataCapture={updatePlayback}>
  <div className="media-frame-picture" style={{transform:`translate(${tx}% ,${ty}%) scale(${sx},${sy})`}}>{children}</div>
  <div className="media-frame-pan" onPointerDown={begin} onPointerMove={move} onPointerUp={end} onPointerCancel={()=>{if(drag.current){change(drag.current.frame);drag.current=null;}}}
   tabIndex={frame.zoom!==1&&!disabled?0:-1} role="group" aria-label="Drag picture to reframe; use arrow keys for fine adjustment"
   onKeyDown={e=>{if(disabled||frame.zoom===1||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();const step=e.shiftKey ? .1 : .02;change({...current.current,x:clamp(current.current.x+(e.key==='ArrowLeft'?-step:e.key==='ArrowRight'?step:0),0,1),y:clamp(current.current.y+(e.key==='ArrowUp'?-step:e.key==='ArrowDown'?step:0),0,1)});}}
   onKeyUp={e=>{if(e.key.startsWith('Arrow'))void commit();}} onBlur={()=>{if(!drag.current&&(current.current.x!==(scene.mediaFraming?.x??.5)||current.current.y!==(scene.mediaFraming?.y??.5)))void commit();}}/>
  <div className="media-zoom-controls" role="group" aria-label="Preview zoom">
   <button type="button" aria-label="Zoom out" title="Zoom out" disabled={disabled||frame.zoom<=.5} onClick={()=>zoom(current.current.zoom-.1)}>−</button>
   <button type="button" className="media-zoom-reset" aria-label={`Reset zoom (${Math.round(frame.zoom*100)} percent)`} title="Reset zoom and position" disabled={disabled} onClick={()=>{change({...DEFAULT_FRAMING});void commit();}}>{Math.round(frame.zoom*100)}%</button>
   <button type="button" aria-label="Zoom in" title="Zoom in" disabled={disabled||frame.zoom>=3} onClick={()=>zoom(current.current.zoom+.1)}>+</button>
  </div>
  {saving&&<span className="media-frame-saving" role="status">Saving…</span>}
  {playbackControls&&playback.duration>0&&<div className="media-frame-transport">
   <button type="button" aria-label={playback.playing?'Pause preview':'Play preview'} onClick={()=>{const v=media();if(!v)return;if(v.paused){if(v.ended)v.currentTime=0;v.play().catch(()=>setError('Preview playback is unavailable.'));}else v.pause();}}>{playback.playing?'❚❚':'▶'}</button>
   <input type="range" aria-label="Preview playback position" min="0" max={playback.duration} step=".01" value={playback.time} onChange={e=>{const v=media();if(v)v.currentTime=Number(e.target.value);}}/>
  </div>}
  {error&&<div className="media-frame-error" role="alert">{error}<button type="button" disabled={saving||disabled} onClick={()=>void commit()}>Retry</button></div>}
 </div>;
}
