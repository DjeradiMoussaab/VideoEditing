import {useRef} from 'react';
import {moveGraphicTime,GRAPHIC_PRESETS,createGraphic} from '../../../../../SHARED/graphics.mjs';
export function GraphicsTracks({graphics,duration,scenes,audio,disabled}) {
  const drag=useRef(null);
  const {items,selected,select,set,commit}=graphics;
  function start(event,g,kind){
    if(disabled||g.locked||event.button!==0)return;
    event.preventDefault();event.stopPropagation();if(kind!=='move')audio.pause();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current={id:g.id,kind,x:event.clientX,width:event.currentTarget.closest('.graphics-track').clientWidth,items};
  }
  function move(event){const d=drag.current;if(!d)return;
    if(!d.moved&&Math.abs(event.clientX-d.x)<3)return;
    if(!d.moved){d.moved=true;audio.pause();}
    const related=items.find(g=>g.id===d.id)?.groupId;
    const points=event.altKey?[]:[0,duration,audio.time,...scenes.flatMap(s=>[s.start_sec,s.end_sec]),...d.items.filter(g=>g.id!==d.id&&(!related||g.groupId!==related)).flatMap(g=>[g.start,g.end])];
    set(moveGraphicTime(d.items,d.id,d.kind,(event.clientX-d.x)/d.width*duration,duration,30,points,8/d.width*duration));
  }
  function finish(event){const d=drag.current;if(!d)return;drag.current=null;if(event.type==='pointercancel')set(d.items);else if(d.moved)void commit();}
  function key(event,g,kind){if(disabled||g.locked||!['ArrowLeft','ArrowRight'].includes(event.key))return;event.preventDefault();event.stopPropagation();audio.pause();void commit(moveGraphicTime(items,g.id,kind,(event.key==='ArrowRight'?1:-1)*(event.shiftKey?1:1/30),duration));}
  return <div className="graphics-tracks" aria-label="Graphics tracks" data-graphics-editor onDragOver={e=>{if(!disabled&&e.dataTransfer.types.includes('application/x-video-graphic')){e.preventDefault();e.dataTransfer.dropEffect='copy';}}} onDrop={e=>{const type=e.dataTransfer.getData('application/x-video-graphic');if(disabled||!GRAPHIC_PRESETS.some(p=>p.type===type))return;e.preventDefault();const rect=e.currentTarget.getBoundingClientRect();const item=createGraphic(type,(e.clientX-rect.left)/rect.width*duration,duration,crypto.randomUUID());audio.pause();select(item.id);audio.seek(item.start+Math.min(.5,(item.end-item.start)/2));void commit([...items,item]);}}>
    {!items.length&&<div className="graphics-track-empty">Titles & graphics · Add an element above to start</div>}
    {[...items].reverse().map(g=><div className={`graphics-track ${g.hidden?'is-hidden':''}`} key={g.id} aria-label={`${GRAPHIC_PRESETS.find(p=>p.type===g.type)?.label} track`}>
      <div className={`graphics-clip ${selected===g.id?'is-selected':''} ${g.locked?'is-locked':''}`} style={{left:`${g.start/duration*100}%`,width:`${(g.end-g.start)/duration*100}%`}}>
        <button type="button" className="graphics-trim" disabled={disabled||g.locked} aria-label={`Trim start of ${g.text||g.type}`} onPointerDown={e=>start(e,g,'start')} onPointerMove={move} onPointerUp={finish} onPointerCancel={finish} onKeyDown={e=>key(e,g,'start')}>Ⅱ</button>
        <button type="button" className="graphics-clip-body" disabled={disabled} aria-pressed={selected===g.id} onClick={()=>select(g.id)} onDoubleClick={()=>audio.seek(g.start+Math.min(.5,(g.end-g.start)/2))} onPointerDown={e=>start(e,g,'move')} onPointerMove={move} onPointerUp={finish} onPointerCancel={finish} onKeyDown={e=>key(e,g,'move')} title={`${g.text||g.type} · ${g.start.toFixed(2)}–${g.end.toFixed(2)}s · Alt disables snapping`}>
          <span>{g.locked?'▣ ':g.hidden?'Hidden · ':''}{g.groupId?'↔ ':''}{g.text||GRAPHIC_PRESETS.find(p=>p.type===g.type)?.label}</span><small>{(g.end-g.start).toFixed(2)}s</small>
        </button>
        <button type="button" className="graphics-trim" disabled={disabled||g.locked} aria-label={`Trim end of ${g.text||g.type}`} onPointerDown={e=>start(e,g,'end')} onPointerMove={move} onPointerUp={finish} onPointerCancel={finish} onKeyDown={e=>key(e,g,'end')}>Ⅱ</button>
      </div>
    </div>)}
  </div>;
}
