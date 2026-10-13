import {useEffect,useRef,useState} from 'react';
import {graphicsSvg,graphicPose,clamp} from '../../../../../SHARED/graphics.mjs';
import {projectApi} from '../../../services/project-api';
import {toAbsoluteUrl} from '../../../services/api-client';
import {formatTimecode} from './timeline-format.mjs';
import regularFont from '../../../../../BACKEND/assets/modern-clean/Montserrat-Regular.ttf?url';
import boldFont from '../../../../../BACKEND/assets/modern-clean/Montserrat-Bold.ttf?url';
import blackFont from '../../../../../BACKEND/assets/typography-titles/Montserrat-Black.ttf?url';
import typewriterFont from '../../../../../BACKEND/assets/vintage/typewriter.ttf?url';
import scriptFont from '../../../../../BACKEND/assets/vintage/handwriting.ttf?url';
import {ELEMENT_CATEGORIES,applyElementPreset,elementCategory} from '../../../../../SHARED/element-presets.mjs';

export function GraphicsWorkspace({project,graphics,audio,duration,disabled,onClose}) {
  const {items,selected,set,commit}=graphics;
  const g=items.find(item=>item.id===selected);
  const [category,setCategory]=useState(()=>elementCategory(g.type));
  const [preview,setPreview]=useState(null),[error,setError]=useState(''),[retry,setRetry]=useState(0),[ready,setReady]=useState(false);
  const video=useRef(null),stage=useRef(null),drag=useRef(null),editor=useRef(null);
  useEffect(()=>{editor.current?.scrollIntoView({behavior:'smooth',block:'start'});},[]);
  const sceneKey=JSON.stringify(project.scenes);
  useEffect(()=>{
    const controller=new AbortController();
    audio.pause();setPreview(null);setReady(false);setError('');
    const timer=setTimeout(async()=>{
      try {const result=await projectApi.previewProject(project.id,{start:g.start,end:g.end,includeGraphics:false},controller.signal);
        if(!controller.signal.aborted){setPreview(result);audio.seek(g.start+Math.min(.5,(g.end-g.start)/2));}
      } catch(e){if(!controller.signal.aborted)setError(e.message||'Could not load preview.');}
    },250);
    return()=>{clearTimeout(timer);controller.abort();};
  },[project.id,sceneKey,g.start,g.end,retry]);
  useEffect(()=>{audio.setRange({start:g.start,end:g.end,loop:false});return()=>{audio.pause();audio.setRange(null);};},[g.start,g.end,audio.setRange]);
  useEffect(()=>{
    if(!preview||!ready||!video.current)return;
    const v=video.current,local=clamp(audio.time-preview.start,0,preview.durationSec);
    if(!audio.playing||Math.abs(v.currentTime-local)>.15)v.currentTime=local;
    if(audio.playing)v.play().catch(()=>audio.pause());else v.pause();
  },[audio.time,audio.playing,preview,ready]);
  const time=clamp(audio.time,g.start,g.end-1/30);
  const pose=graphicPose(g,time);
  function patch(update,save=false){const next=graphics.current.current.map(item=>item.id===g.id?{...item,...update}:item);if(save)void commit(next);else set(next);}
  function begin(event,kind){if(disabled||event.button!==0)return;event.preventDefault();audio.pause();event.currentTarget.setPointerCapture(event.pointerId);drag.current={kind,x:event.clientX,y:event.clientY,rect:stage.current.getBoundingClientRect(),g,items};}
  function move(event){const d=drag.current;if(!d)return;const dx=(event.clientX-d.x)/d.rect.width,dy=(event.clientY-d.y)/d.rect.height;
    if(d.kind==='move')patch({x:clamp(d.g.x+dx,0,1),y:clamp(d.g.y+dy,0,1),keyframes:[]});
    else if(d.kind==='resize'){
      const angle=d.g.rotation*Math.PI/180,localX=dx*Math.cos(angle)+dy*d.rect.height/d.rect.width*Math.sin(angle);
      const scale=clamp((d.g.width+localX*2)/d.g.width,Math.max(.02/d.g.width,.02/d.g.height,12/(d.g.fontSize||64)),Math.min(1/d.g.width,1/d.g.height,240/(d.g.fontSize||64)));
      patch({width:d.g.width*scale,height:d.g.height*scale,fontSize:(d.g.fontSize||64)*scale});
    }else patch({rotation:Math.atan2(event.clientY-(d.rect.top+d.g.y*d.rect.height),event.clientX-(d.rect.left+d.g.x*d.rect.width))*180/Math.PI+90,keyframes:[]});
  }
  function finish(event){if(!drag.current)return;const d=drag.current;drag.current=null;if(event.type==='pointercancel')set(d.items);else void commit();}
  const handles=kind=>({onPointerDown:e=>begin(e,kind),onPointerMove:move,onPointerUp:finish,onPointerCancel:finish});
  const textElement=['title','big-title','lower-third'].includes(g.type);
  return <section ref={editor} className="graphics-workspace panel" aria-label="Element editor" data-graphics-editor>
    <style>{`@font-face{font-family:Montserrat;src:url("${regularFont}");font-weight:400}@font-face{font-family:Montserrat;src:url("${boldFont}");font-weight:700}@font-face{font-family:Montserrat;src:url("${blackFont}");font-weight:900}@font-face{font-family:"Mom´sTypewriter";src:url("${typewriterFont}")}@font-face{font-family:"Signatura Monoline Script";src:url("${scriptFont}")}`}</style>
    <header className="graphics-heading"><div><h3>Edit element</h3><p>{formatTimecode(g.start)} – {formatTimecode(g.end)} · {(g.end-g.start).toFixed(1)} seconds</p></div><div className="graphics-actions"><span role="status">{graphics.saving?'Saving…':graphics.dirty?'Unsaved changes':'Saved'}</span><button disabled={disabled||!graphics.canUndo} onClick={()=>void graphics.undo()} aria-label="Undo element edit">↶</button><button disabled={disabled} onClick={async()=>{if(await commit(items.filter(i=>i.id!==g.id)))onClose();}}>Delete</button><button disabled={disabled} onClick={async()=>{if(!graphics.dirty||await commit())onClose();}}>Done</button></div></header>
    <div className="element-tabs" role="tablist" aria-label="Element categories">{ELEMENT_CATEGORIES.map(c=><button key={c.id} id={`element-tab-${c.id}`} role="tab" aria-selected={category===c.id} aria-controls="element-designs" onClick={()=>setCategory(c.id)}>{c.label}</button>)}</div>
    <div className="element-layout">
      <aside className="element-options">
        <div id="element-designs" role="tabpanel" aria-labelledby={`element-tab-${category}`} className="element-presets">{ELEMENT_CATEGORIES.find(c=>c.id===category).presets.map(p=>{const sample=applyElementPreset({...g,text:p.text||'Your name'},p,duration);sample.start=0;sample.end=4;sample.x=.5;sample.y=.5;sample.width=['circle','icon'].includes(sample.type)?.3:.8;sample.height=['circle','icon'].includes(sample.type)?.53:.45;sample.fontSize=150;return <button key={p.id} aria-label={p.label} disabled={disabled} onClick={()=>{audio.pause();audio.seek(g.start+Math.min(.5,(g.end-g.start)/2));void commit(items.map(i=>i.id===g.id?applyElementPreset(g,p,duration):i));}}><span aria-hidden="true" className="element-preset-art" dangerouslySetInnerHTML={{__html:graphicsSvg([sample],2)}}/><span>{p.label}</span></button>;})}</div>
        {textElement&&<label>Text<textarea aria-label="Element text" rows={3} maxLength={500} value={g.text} disabled={disabled} onChange={e=>patch({text:e.target.value})} onBlur={()=>void commit()}/></label>}
        <div className="element-colors"><label>Color<input aria-label="Element color" type="color" value={g.color} disabled={disabled} onChange={e=>patch({color:e.target.value,...(!textElement&&g.backgroundOpacity?{background:e.target.value}:{})})} onBlur={()=>void commit()}/></label>{textElement&&g.backgroundOpacity>0&&<label>Background<input type="color" value={g.background} disabled={disabled} onChange={e=>patch({background:e.target.value})} onBlur={()=>void commit()}/></label>}</div>
        <p className="element-hint">Drag to move. Pull the corner to resize.<br/>Drag the clip edges on the timeline to change its duration.</p>
      </aside>
      <div className="graphics-preview-column">
        <div className="graphics-stage" ref={stage}>
          {preview?<video ref={video} src={toAbsoluteUrl(preview.url)} muted playsInline preload="auto" onLoadedData={()=>setReady(true)} onError={()=>{setError('Could not play preview.');setReady(false);}}/>:<div className="graphics-preview-placeholder"><span>{error?'Preview unavailable':'Loading element preview…'}</span></div>}
          <div className="graphics-svg" dangerouslySetInnerHTML={{__html:graphicsSvg(items,time)}}/>
          {!audio.playing&&<div className="graphic-selection" style={{left:`${pose.x*100}%`,top:`${pose.y*100}%`,width:`${g.width*100}%`,height:`${g.height*100}%`,transform:`translate(-50%,-50%) rotate(${pose.rotation}deg) scale(${pose.scale})`}}>
            <button className="graphic-move" aria-label="Move element" disabled={disabled} {...handles('move')} onKeyDown={e=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();e.stopPropagation();patch({x:clamp(g.x+(e.key==='ArrowRight'?.005:e.key==='ArrowLeft'?-.005:0),0,1),y:clamp(g.y+(e.key==='ArrowDown'?.005:e.key==='ArrowUp'?-.005:0),0,1),keyframes:[]},true);}}/>
            <button className="graphic-resize" aria-label="Resize element" disabled={disabled} {...handles('resize')}/><button className="graphic-rotate" aria-label="Rotate element" disabled={disabled} {...handles('rotate')}>↻</button>
          </div>}
        </div>
        <div className="graphics-transport"><button disabled={!ready||audio.status!=='ready'} onClick={()=>void audio.toggle()}>{audio.playing?'Ⅱ Pause':'▶ Play'}</button><input aria-label="Element preview position" type="range" min={g.start} max={g.end} step={1/30} value={clamp(audio.time,g.start,g.end)} onChange={e=>{audio.pause();audio.seek(Number(e.target.value));}}/><output>{formatTimecode(clamp(audio.time-g.start,0,g.end-g.start))} / {formatTimecode(g.end-g.start)}</output></div>
        <p className="element-preview-caption">Full element preview · continues across scene changes</p>
        {error&&<p className="graphics-error" role="alert">{error} <button onClick={()=>setRetry(v=>v+1)}>Retry preview</button></p>}
      </div>
    </div>
    {graphics.error&&<div className="graphics-error" role="alert">{graphics.error}<button disabled={disabled} onClick={()=>void commit()}>Retry save</button><button disabled={disabled} onClick={graphics.discard}>Discard edits</button></div>}
  </section>;
}
