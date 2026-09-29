import { RenderedScenePreview } from "./RenderedScenePreview";
import { ReferenceSuggestions } from "./ReferenceSuggestions";
import { useEffect, useMemo, useState } from 'react';
import { QUOTE_STYLES, QUOTE_SAMPLE, quoteStyle, quoteValues } from '../../../../../SHARED/quote-styles.mjs';
import { QuotePreview } from './QuotePreview';
import { QuoteBackgroundPicker } from './QuoteBackgroundPicker';

// Color pickers and highlight-word selections are per-style customizations, not shared
// content, so they're namespaced by style id in local state (`__styleId__key`). Otherwise
// switching styles mid-session (before a save round-trip resets things) would leak one
// style's color choice into another style's picker, since they use the same field names
// (accentColor, textColor, ...). Text content fields (text, author, ...) stay shared across
// styles on purpose, so re-picking a design doesn't clear what was already typed.
const STYLE_SCOPED_KEYS=['accentColor','textColor','text2Color','banner2Color','highlightWords'];
const scopedKey=(styleId,key)=>`__${styleId}__${key}`;

export function QuoteEditor({projectId,scene,busy,onSave,onRefreshSuggestions,onChooseSuggestion,onUseReferenceImage}) {
  // No resync-from-scene effect here: SceneEditor remounts this component (key={scene.scene_id})
  // whenever the selected scene changes, so local state only ever needs to seed once per scene.
  // Resyncing on every scene.quoteStyleId/quoteFields change would clobber in-flight typing with
  // the autosave's own round-trip once the save below lands.
  const [styleId,setStyleId]=useState(()=>quoteStyle(scene.quoteStyleId).id);
  const [values,setValues]=useState(()=>{
    const base=quoteValues(scene);
    const initialStyleId=quoteStyle(scene.quoteStyleId).id;
    const seeded={...base};
    for(const key of STYLE_SCOPED_KEYS) if(base[key]!==undefined){seeded[scopedKey(initialStyleId,key)]=base[key];delete seeded[key];}
    return seeded;
  });
  const [error,setError]=useState('');
  const [saving,setSaving]=useState(false);
  const style=quoteStyle(styleId);
  // The values actually sent to the composer/preview/save: shared content fields plus only
  // this style's own scoped color/highlight picks, resolved back to their plain key names.
  const composedValues=useMemo(()=>{
    const out={};
    for(const [key,value] of Object.entries(values)) if(!key.startsWith('__')) out[key]=value;
    for(const key of STYLE_SCOPED_KEYS){
      const scoped=values[scopedKey(styleId,key)];
      if(scoped!==undefined) out[key]=scoped;
    }
    return out;
  },[values,styleId]);
  const accent=composedValues.accentColor||style.accent;
  const colorControls=styleId==='modern_clean'
    ? [['textColor','Text 1','#ffffff'],['accentColor','Banner 1',style.accent],['text2Color','Text 2','#151515'],['banner2Color','Banner 2','#ffffff']]
    : [['accentColor','Accent',style.accent],['textColor','Text',styleId==='typography_split'?accent:'#ffffff']];
  const rgb=accent.slice(1).match(/../g).map(hex=>parseInt(hex,16));
  const chipText=rgb[0]*.299+rgb[1]*.587+rgb[2]*.114>150?'#111111':'#ffffff';
  const setScoped=(key,value)=>setValues({...values,[scopedKey(styleId,key)]:value});
  const changed=styleId!==(scene.quoteStyleId||'classic') || JSON.stringify(composedValues)!==JSON.stringify(quoteValues(scene));
  async function save(){setSaving(true);setError('');try{await onSave(styleId,composedValues);}catch(err){setError(err.message||'Could not save quote.');}finally{setSaving(false);}}
  // Debounced autosave: gated on `saving` so a save in flight suppresses new timers; once it
  // settles this effect re-fires and, if edits landed meanwhile, schedules the next save.
  useEffect(()=>{
    if(!changed || saving) return;
    const timer=setTimeout(()=>{void save();},700);
    return ()=>clearTimeout(timer);
  },[changed,saving,styleId,composedValues]);
  return <div className="quote-workspace">
    <div className="scene-editor-columns">
      <div className="scene-editor-settings scene-editor-settings--quote">
        <ReferenceSuggestions scene={scene} busy={busy} onUseReferenceImage={onUseReferenceImage} />
      </div>
      <div className="quote-style-picker" aria-label="Quote styles">
        <div className="quote-picker-heading"><h4>Quote styles</h4><span>{QUOTE_STYLES.length} designs</span></div>
        <div className="quote-style-grid">{QUOTE_STYLES.map((item,index)=><button type="button" key={item.id} className={`quote-style-option ${styleId===item.id?'active':''}`} aria-pressed={styleId===item.id} disabled={busy||saving} onClick={()=>setStyleId(item.id)} title={item.description}>
          <QuotePreview styleId={item.id} values={item.sample||(item.id==='modern_clean'?{text:'MINIMAL TITLES',text2:'AWESOME DESIGN'}:QUOTE_SAMPLE)} label={`${item.name} sample`}/>
          <span className="quote-style-caption"><strong>{item.name}</strong><small>{String(index+1).padStart(2,'0')}</small></span>
        </button>)}</div>
      </div>
    </div>
    <div className="quote-edit-columns">
      <section className="quote-design-fields">
        <div><h4>{style.name}</h4><p>{style.description}</p></div>
        {style.colorControl&&<div className="quote-color-row">{colorControls.map(([key,label,fallback])=><label className="quote-color-control" key={key}><span>{label}</span><input type="color" title={`${label} color`} aria-label={`${label} color`} value={composedValues[key]||fallback} disabled={busy||saving} onChange={e=>setScoped(key,e.target.value)}/></label>)}</div>}
        {style.fields.map(field=><label key={field.key}>{field.label}<span className="quote-field-count">{(values[field.key]||'').length}/{field.maxLength}</span>
          {field.maxLength>100?<textarea rows={3} maxLength={field.maxLength} placeholder={field.placeholder} value={values[field.key]||''} disabled={busy||saving} onChange={e=>setValues({...values,[field.key]:e.target.value})}/>:<input type="text" maxLength={field.maxLength} placeholder={field.placeholder} value={values[field.key]||''} disabled={busy||saving} onChange={e=>setValues({...values,[field.key]:e.target.value})}/>}</label>)}
        {style.wordHighlights&&<div className="quote-highlight-controls" style={{'--quote-accent':accent,'--quote-accent-text':chipText}}><span>Tap words to highlight</span><div>{String(values.text||'').trim().split(/\s+/).filter(Boolean).map((word,index)=>{
          const selected=new Set(String(composedValues.highlightWords??style.highlightWords).split(',').filter(Boolean).map(Number));
          const active=selected.has(index+1);
          return <button type="button" key={index} aria-pressed={active} disabled={busy||saving} onClick={()=>{active?selected.delete(index+1):selected.add(index+1);setScoped('highlightWords',[...selected].sort((a,b)=>a-b).join(','));}}>{word.toUpperCase()}</button>;
        })}</div></div>}
        <div className="quote-save-row"><span role="status">{saving?'Saving…':changed?'Pending…':'Saved'}</span></div>
        {error&&<p className="error-banner" role="alert">{error}</p>}
      </section>
      <div className="quote-live-preview"><RenderedScenePreview projectId={projectId} scene={scene} draft={{quoteStyleId:styleId,quoteFields:composedValues}} disabled={busy || saving}><QuotePreview key={styleId} styleId={styleId} values={composedValues}/></RenderedScenePreview><span>Preview your draft · Changes save automatically</span></div>
    </div>
    <QuoteBackgroundPicker
      scene={scene}
      busy={busy}
      onRefreshSuggestions={onRefreshSuggestions}
      onChooseSuggestion={onChooseSuggestion}
    />
  </div>;
}
