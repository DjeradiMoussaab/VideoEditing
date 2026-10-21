import {LIFESTYLE_COLOR_KEYS} from '../../../../../SHARED/modern-lifestyle.mjs';
import { RenderedScenePreview } from "./RenderedScenePreview";
import { ReferenceSuggestions } from "./ReferenceSuggestions";
import { useEffect, useMemo, useRef, useState } from 'react';
import { stylesForScene, QUOTE_SAMPLE, quoteStyle, quoteValues } from '../../../../../SHARED/quote-styles.mjs';
import { QuotePreview } from './QuotePreview';
import { QuoteBackgroundPicker } from './QuoteBackgroundPicker';

// Color pickers and highlight-word selections are per-style customizations, not shared
// content, so they're namespaced by style id in local state (`__styleId__key`). Otherwise
// switching styles mid-session (before a save round-trip resets things) would leak one
// style's color choice into another style's picker, since they use the same field names
// (accentColor, textColor, ...). Text content fields (text, author, ...) stay shared across
// styles on purpose, so re-picking a design doesn't clear what was already typed.
const STYLE_SCOPED_KEYS=['authorColor','accentColor','textColor','text2Color','banner2Color','highlightWords',...LIFESTYLE_COLOR_KEYS];
const scopedKey=(styleId,key)=>`__${styleId}__${key}`;

export function QuoteEditor({projectId,scene,busy,onSave,onRefreshSuggestions,onChooseSuggestion,onUseReferenceImage,onAddSuggestionMedia}) {
  const draftKey=`quote-draft:${projectId}:${scene.scene_id}:${scene.type}`;
  const seed=()=>{
    const base=quoteValues(scene),seeded={...base},id=quoteStyle(scene.quoteStyleId).id;
    for(const key of STYLE_SCOPED_KEYS)if(base[key]!==undefined){seeded[scopedKey(id,key)]=base[key];delete seeded[key];}
    return {styleId:id,values:seeded};
  };
  const savedIdentity=JSON.stringify([scene.quoteStyleId,quoteValues(scene)]);
  const restore=()=>{try{const cached=JSON.parse(sessionStorage.getItem(draftKey));if(cached?.baseline===savedIdentity)return cached;}catch{}return seed();};
  const [initial]=useState(restore);
  const [styleId,setStyleId]=useState(initial.styleId);
  const [values,setValues]=useState(initial.values);
  const [error,setError]=useState('');
  const [saving,setSaving]=useState(false);
  const savedStyleValues=useRef({});
  useEffect(()=>{
    savedStyleValues.current[quoteStyle(scene.quoteStyleId).id]=quoteValues(scene);
  },[savedIdentity]);
  const [collection,setCollection]=useState(quoteStyle(initial.styleId).collection||'classic');
  const allStyles=stylesForScene(scene.type);
  const styles=scene.type==='opener'?allStyles.filter(item=>(item.collection||'classic')===collection):allStyles;
  const styleHeading=scene.type==='opener'?'Opener styles':'Quote styles';
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
  const colorControls=style.colors || (styleId==='modern_clean'
    ? [['textColor','Text 1','#ffffff'],['accentColor','Banner 1',style.accent],['text2Color','Text 2','#151515'],['banner2Color','Banner 2','#ffffff']]
    : [['accentColor','Accent',style.accent],['textColor','Text',styleId==='typography_split'?'#ffef00':'#ffffff']]);
  const rgb=accent.slice(1).match(/../g).map(hex=>parseInt(hex,16));
  const chipText=rgb[0]*.299+rgb[1]*.587+rgb[2]*.114>150?'#111111':'#ffffff';
  const setScoped=(key,value)=>setValues(previous=>({...previous,[scopedKey(styleId,key)]:value}));
  const changed=styleId!==(scene.quoteStyleId||'classic') || JSON.stringify(Object.entries(composedValues).sort())!==JSON.stringify(Object.entries(quoteValues(scene)).sort());
  async function save(){setSaving(true);setError('');try{await onSave(styleId,composedValues);}catch(err){setError(err.message||'Could not save quote.');}finally{setSaving(false);}}
  async function chooseStyle(nextStyleId){
    if(nextStyleId===styleId||busy||saving)return;
    const previousStyleId=styleId;
    // Only saved content travels with a style switch. Text and color drafts stay local.
    const saved=quoteValues(scene),next={...saved};
    savedStyleValues.current[quoteStyle(scene.quoteStyleId).id]=saved;
    for(const key of STYLE_SCOPED_KEYS){
      delete next[key];
      const remembered=savedStyleValues.current[nextStyleId]?.[key];
      if(remembered!==undefined)next[key]=remembered;
    }
    setStyleId(nextStyleId);setSaving(true);setError('');
    try{await onSave(nextStyleId,next);}
    catch(err){setStyleId(previousStyleId);setError(err.message||'Could not apply style. Please try again.');}
    finally{setSaving(false);}
  }
  useEffect(()=>{
    try{if(changed)sessionStorage.setItem(draftKey,JSON.stringify({baseline:savedIdentity,styleId,values}));else sessionStorage.removeItem(draftKey);}catch{}
    if(!changed)return;
    const warn=event=>{event.preventDefault();event.returnValue='';};
    window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);
  },[changed,styleId,values,draftKey,savedIdentity]);
  function discard(){const saved=seed();setStyleId(saved.styleId);setValues(saved.values);setError('');}
  return <div className="quote-workspace">
    <div className="scene-editor-columns">
      <div className="scene-editor-settings scene-editor-settings--quote">
        <ReferenceSuggestions onAddSuggestionMedia={onAddSuggestionMedia} scene={scene} busy={busy} onUseReferenceImage={onUseReferenceImage} />
      </div>
      <div className="quote-style-picker" aria-label={styleHeading}>
        <div className="quote-picker-heading"><h4>{styleHeading}</h4><span>{styles.length} designs</span></div>
        {scene.type==='opener'&&<div className="opener-collection-tabs" role="tablist" aria-label="Opener categories">{[['classic','CLASSIC'],['presentation','PRESENTATION'],['profile','PROFILE']].map(([id,label])=><button type="button" key={id} role="tab" aria-selected={collection===id} aria-controls="opener-style-panel" id={`opener-tab-${id}`} onClick={()=>setCollection(id)}>{label}<span>{allStyles.filter(item=>(item.collection||'classic')===id).length}</span></button>)}</div>}
        <div id={scene.type==='opener'?'opener-style-panel':undefined} role={scene.type==='opener'?'tabpanel':undefined} aria-labelledby={scene.type==='opener'?`opener-tab-${collection}`:undefined} className={`quote-style-grid ${scene.type==='quote'?'quote-style-grid--quotes':''}`}>{styles.map((item,index)=><button type="button" key={item.id} className={`quote-style-option ${styleId===item.id?'active':''}`} aria-pressed={styleId===item.id} disabled={busy||saving} onClick={()=>void chooseStyle(item.id)} title={item.description}>
          <QuotePreview styleId={item.id} values={item.sample||(item.id==='modern_clean'?{text:'MINIMAL TITLES',text2:'AWESOME DESIGN'}:QUOTE_SAMPLE)} label={`${item.name} sample`}/>
          <span className="quote-style-caption"><strong>{item.name}</strong><small>{String(index+1).padStart(2,'0')}</small></span>
        </button>)}</div>
      </div>
    </div>
    <div className="quote-edit-columns">
      <section className="quote-design-fields">
        <div><h4>{style.name}</h4><p>{style.description}</p>{(style.presentation||style.profile)&&<p className="suggestion-hint">Choose an image or clip from Suggestions to fill the media windows.</p>}</div>
        {style.colorControl&&<div className="quote-color-row">{colorControls.map(([key,label,fallback])=><label className="quote-color-control" key={key}><span>{label}</span><input type="color" title={`${label} color`} aria-label={`${label} color`} value={composedValues[key]||fallback} disabled={busy||saving} onInput={e=>setScoped(key,e.target.value)} onChange={e=>setScoped(key,e.target.value)}/></label>)}</div>}
        {style.fields.map(field=><label key={field.key}>{scene.type==='opener' && !style.lifestyle && !style.presentation && !style.profile && field.key==='text' ? 'Opener text' : field.label}<span className="quote-field-count">{(values[field.key]||'').length}/{field.maxLength}</span>
          {field.maxLength>100?<textarea rows={3} maxLength={field.maxLength} placeholder={field.placeholder} value={values[field.key]||''} disabled={busy||saving} onChange={e=>setValues({...values,[field.key]:e.target.value})}/>:<input type="text" maxLength={field.maxLength} placeholder={field.placeholder} value={values[field.key]||''} disabled={busy||saving} onChange={e=>setValues({...values,[field.key]:e.target.value})}/>}</label>)}
        {style.wordHighlights&&<div className="quote-highlight-controls" style={{'--quote-accent':accent,'--quote-accent-text':chipText}}><span>Tap words to highlight</span><div>{String(values.text||'').trim().split(/\s+/).filter(Boolean).map((word,index)=>{
          const selected=new Set(String(composedValues.highlightWords??style.highlightWords).split(',').filter(Boolean).map(Number));
          const active=selected.has(index+1);
          return <button type="button" key={index} aria-pressed={active} disabled={busy||saving} onClick={()=>{active?selected.delete(index+1):selected.add(index+1);setScoped('highlightWords',[...selected].sort((a,b)=>a-b).join(','));}}>{word.toUpperCase()}</button>;
        })}</div></div>}
        <div className="quote-save-row"><button type="button" disabled={busy||saving||!changed} onClick={()=>void save()}>{saving?'Saving…':'Save changes'}</button><button type="button" disabled={busy||saving||!changed} onClick={discard}>Discard</button><span role="status">{saving?'Saving…':changed?'Unsaved changes · draft kept when switching scenes':'All changes saved'}</span></div>
        {error&&<p className="error-banner" role="alert">{error}</p>}
      </section>
      <div className="quote-live-preview"><RenderedScenePreview projectId={projectId} scene={scene} disabled={busy || saving}><QuotePreview styleId={scene.quoteStyleId} values={quoteValues(scene)}/></RenderedScenePreview><span>Styles apply automatically · Save changes to apply text and colors</span></div>
    </div>
    <QuoteBackgroundPicker
      scene={scene}
      busy={busy}
      onRefreshSuggestions={onRefreshSuggestions}
      onChooseSuggestion={onChooseSuggestion}
    />
  </div>;
}
