import { RenderedScenePreview } from "./RenderedScenePreview";
import { useEffect, useState } from 'react';
import { QUOTE_STYLES, QUOTE_SAMPLE, quoteStyle, quoteValues } from '../../../../../SHARED/quote-styles.mjs';
import { QuotePreview } from './QuotePreview';

export function QuoteEditor({projectId,scene,busy,onSave}) {
  const [styleId,setStyleId]=useState(scene.quoteStyleId || 'classic');
  const [values,setValues]=useState(()=>quoteValues(scene));
  const [error,setError]=useState('');
  const [saving,setSaving]=useState(false);
  useEffect(()=>{setStyleId(scene.quoteStyleId || 'classic');setValues(quoteValues(scene));setError('');},[scene.scene_id,scene.quoteStyleId,scene.quoteFields,scene.quoteText,scene.quoteAuthor]);
  const style=quoteStyle(styleId);
  const changed=styleId!==(scene.quoteStyleId||'classic') || JSON.stringify(values)!==JSON.stringify(quoteValues(scene));
  async function save(){setSaving(true);setError('');try{await onSave(styleId,values);}catch(err){setError(err.message||'Could not save quote.');}finally{setSaving(false);}}
  return <div className="quote-workspace">
    <div className="quote-style-picker" aria-label="Quote styles">
      <div className="quote-picker-heading"><h4>Quote styles</h4><span>8 designs · Choose a starting point</span></div>
      <div className="quote-style-grid">{QUOTE_STYLES.map((item,index)=><button type="button" key={item.id} className={`quote-style-option ${styleId===item.id?'active':''}`} aria-pressed={styleId===item.id} disabled={busy||saving} onClick={()=>setStyleId(item.id)} title={item.description}>
        <QuotePreview styleId={item.id} values={QUOTE_SAMPLE} label={`${item.name} sample`}/>
        <span className="quote-style-caption"><strong>{item.name}</strong><small>{String(index+1).padStart(2,'0')}</small></span>
      </button>)}</div>
    </div>
    <div className="quote-edit-columns">
      <section className="quote-design-fields">
        <div><h4>{style.name}</h4><p>{style.description}</p></div>
        {style.fields.map(field=><label key={field.key}>{field.label}<span className="quote-field-count">{(values[field.key]||'').length}/{field.maxLength}</span>
          {field.maxLength>100?<textarea rows={3} maxLength={field.maxLength} placeholder={field.placeholder} value={values[field.key]||''} disabled={busy||saving} onChange={e=>setValues({...values,[field.key]:e.target.value})}/>:<input type="text" maxLength={field.maxLength} placeholder={field.placeholder} value={values[field.key]||''} disabled={busy||saving} onChange={e=>setValues({...values,[field.key]:e.target.value})}/>}</label>)}
        <div className="quote-save-row"><button type="button" onClick={()=>void save()} disabled={busy||saving||!changed}>{saving?'Saving…':'Apply changes'}</button><span role="status">{changed?'Unsaved changes':'Saved'}</span></div>
        {error&&<p className="error-banner" role="alert">{error}</p>}
      </section>
      <div className="quote-live-preview"><RenderedScenePreview projectId={projectId} scene={scene} draft={{quoteStyleId:styleId,quoteFields:values}} disabled={busy || saving}><QuotePreview key={styleId} styleId={styleId} values={values}/></RenderedScenePreview><span>Preview your draft · Apply changes to save it</span></div>
    </div>
  </div>;
}
