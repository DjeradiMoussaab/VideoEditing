import {useRef,useState} from 'react';

// One transport for source clips, rendered images, and rendered quotes. Only the
// first ready event for each source autoplays: seeking/buffering respects pause.
export function ScenePreviewPlayer({children,seekable=false}) {
 const root=useRef(null),started=useRef(new WeakMap());
 const [playback,setPlayback]=useState({ready:false,playing:false,time:0,duration:0});
 const [error,setError]=useState('');
 const video=()=>root.current?.querySelector('video');
 function update(event){
  const media=event.target;if(media.tagName!=='VIDEO')return;
  setPlayback({ready:media.readyState>=2,playing:!media.paused&&!media.ended,time:media.currentTime||0,duration:Number.isFinite(media.duration)?media.duration:0});
 }
 function ready(event){
  update(event);
  const media=event.target;if(media.tagName!=='VIDEO')return;
  const source=media.currentSrc||media.src;
  if(started.current.get(media)===source)return;
  started.current.set(media,source);
  // Muted playback is allowed by browser autoplay policies; if blocked, the
  // same button remains available for an explicit user gesture.
  media.play().catch(()=>{});
 }
 function toggle(){
  const media=video();if(!media)return;setError('');
  if(!media.paused&&!media.ended){media.pause();return;}
  if(media.ended)media.currentTime=0;
  media.play().catch(()=>{if(root.current?.contains(media))setError('Could not play this preview. Try again.');});
 }
 return <div className="scene-preview-player" ref={root}
  onCanPlayCapture={ready} onLoadedMetadataCapture={update} onTimeUpdateCapture={update}
  onPlayCapture={update} onPauseCapture={update} onEndedCapture={update}
  onEmptiedCapture={()=>setPlayback({ready:false,playing:false,time:0,duration:0})}>
  {children}
  <div className="scene-preview-transport" role="group" aria-label="Scene preview playback">
   <button type="button" disabled={!playback.ready} aria-label={playback.playing?'Pause preview':'Play preview'} title={playback.playing?'Pause preview':'Play preview'} onClick={toggle}>
    <span aria-hidden="true">{playback.playing?'❚❚':'▶'}</span><span>{playback.playing?'Pause':'Play'}</span>
   </button>
   {seekable&&playback.duration>0&&<input type="range" aria-label="Preview playback position" min="0" max={playback.duration} step=".01" value={playback.time} onChange={event=>{const media=video();if(media)media.currentTime=Number(event.target.value);}}/>}
  </div>
  {error&&<span className="scene-preview-playback-error" role="alert">{error}</span>}
 </div>;
}
