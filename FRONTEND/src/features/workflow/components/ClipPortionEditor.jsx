import {useEffect,useRef,useState} from 'react';
import {request,toAbsoluteUrl} from '../../../services/api-client';
import {BlurredVideoPreview} from './BlurredVideoPreview';
const clamp=(n,max)=>Math.max(0,Math.min(max,n));
const clock=n=>{const value=Math.max(0,Number(n)||0);return `${String(Math.floor(value/60)).padStart(2,'0')}:${(value%60).toFixed(2).padStart(5,'0')}`;};

export function ClipPortionEditor({projectId,scene,updatedAt,busy,onSave}) {
 const [attempt,setAttempt]=useState(0),[info,setInfo]=useState(null),[error,setError]=useState(''),[loading,setLoading]=useState(true);
 const [offset,setOffset]=useState(Number(scene.mediaOffsetSec||0));
 const behavior=scene.mediaEndBehavior||'loop';
 const [saving,setSaving]=useState(false);
 const savingRef=useRef(false),video=useRef(null),drag=useRef(null),track=useRef(null),offsetRef=useRef(offset),mounted=useRef(true);
 const duration=Number(scene.duration_sec),max=Math.max(0,(info?.duration||0)-duration),short=info&&info.duration<duration-.02;
 const locked=busy||saving||loading||!info;
 const src=toAbsoluteUrl(scene.assetUrl);
 useEffect(()=>{stop();},[scene.duration_sec,busy]);
 function stop(){video.current?.pause();}
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;video.current?.pause();};},[]);
 useEffect(()=>{
  const controller=new AbortController();setLoading(true);setError('');
  request(`/projects/${projectId}/scenes/${scene.scene_id}/portion`,{signal:controller.signal}).then(data=>{setInfo(data);setLoading(false);}).catch(e=>{if(!controller.signal.aborted){setError(e.message);setLoading(false);}});
  return()=>controller.abort();
 },[projectId,scene.scene_id,scene.assetUrl,attempt]);
 useEffect(()=>{
  if(drag.current)return;
  const start=Number(scene.mediaOffsetSec||0);offsetRef.current=start;setOffset(start);
 },[scene.mediaOffsetSec,scene.mediaEndBehavior]);
 function seek(value){
  stop();const next=clamp(Math.round(clamp(value,max)*(info?.fps||30))/(info?.fps||30),max);offsetRef.current=next;setOffset(next);
  if(video.current?.readyState>=1)video.current.currentTime=next;
  return next;
 }
 async function commit(value=offsetRef.current,mode=behavior){
  if(locked||savingRef.current)return;
  const next=seek(value);
  if(Math.abs(next-Number(scene.mediaOffsetSec||0))<.000001&&mode===(scene.mediaEndBehavior||'loop'))return;
  savingRef.current=true;setSaving(true);setError('');
  try{await onSave(scene.scene_id,{start:next,behavior:mode,expectedUpdatedAt:updatedAt});}
  catch(e){if(mounted.current){setError(e.message||'Could not save this portion. Try again.');}}
  finally{savingRef.current=false;if(mounted.current)setSaving(false);}
 }
 function begin(e){if(locked||max===0||e.button!==0)return;e.preventDefault();stop();const width=track.current.getBoundingClientRect().width*.36;drag.current={x:e.clientX,start:offsetRef.current,pixels:width/duration};e.currentTarget.setPointerCapture(e.pointerId);}
 function move(e){if(drag.current)seek(drag.current.start-(e.clientX-drag.current.x)/drag.current.pixels);}
 function release(){if(!drag.current)return;drag.current=null;void commit();}
 const stripWidth=info?36*info.duration/duration:100;
 return <section className="clip-portion-editor" aria-label="Choose clip portion">
  <BlurredVideoPreview src={src} mediaOffsetSec={offset} videoRef={video} muted controls={false} onError={()=>{stop();setError('The clip cannot be previewed in this browser.');}}/>
  <div className="clip-portion-panel" aria-busy={saving}>
   <header><div><h4>Choose clip portion</h4><p>{short?'This clip is shorter than the scene.':info&&!info.filmstripUrl?'Slide to preview the clip. Thumbnails are unavailable.':'Slide the filmstrip to find your moment.'}</p></div><span className="clip-duration">{duration.toFixed(2)}s scene</span></header>
   {loading&&!info?<div className="clip-film-loading" role="status">Preparing clip thumbnails…</div>:info&&<>
    <div ref={track} className={`clip-filmstrip ${locked||max===0?'is-locked':''}`} role="slider" tabIndex={locked||!max?-1:0} aria-label="Clip start time" aria-valuemin={0} aria-valuemax={max} aria-valuenow={clamp(offset,max)} aria-valuetext={`${clock(offset)} to ${clock(Math.min(info.duration,offset+duration))}`} aria-disabled={locked||!max}
     onPointerDown={begin} onPointerMove={move} onPointerUp={release} onPointerCancel={()=>{drag.current=null;seek(Number(scene.mediaOffsetSec||0));}}
     onKeyDown={e=>{if(locked)return;let next;if(e.key==='ArrowRight')next=offsetRef.current+(e.shiftKey?1:1/info.fps);else if(e.key==='ArrowLeft')next=offsetRef.current-(e.shiftKey?1:1/info.fps);else if(e.key==='Home')next=0;else if(e.key==='End')next=max;else return;e.preventDefault();seek(next);}}
     onKeyUp={e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key))void commit();}} onBlur={()=>{if(!drag.current)void commit();}}>
     {info.filmstripUrl&&<img alt="" draggable="false" src={toAbsoluteUrl(info.filmstripUrl)} style={{width:`${stripWidth}%`,left:`${32-offset/info.duration*stripWidth}%`}}/>}
     <div className="clip-film-shade left"/><div className="clip-film-shade right"/><div className="clip-film-window">{short&&<small className="clip-tail" style={{left:`${info.duration/duration*100}%`}}>{behavior==='freeze'?'Hold':'Loop'}</small>}<span>{duration.toFixed(2)}s</span></div>
    </div>
    <div className="clip-range-labels"><span>{clock(offset)}</span><span>{clock(Math.min(info.duration,offset+duration))}</span></div>
   </>}
   {error&&<div className="clip-portion-error" role="alert">{error}<button type="button" disabled={saving||busy} onClick={()=>info?void commit():setAttempt(n=>n+1)}>{info?'Retry save':'Retry preview'}</button></div>}
  </div>
 </section>;
}
