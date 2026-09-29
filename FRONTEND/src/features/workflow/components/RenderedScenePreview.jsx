import {useEffect, useRef, useState} from 'react';
import {request, toAbsoluteUrl} from '../../../services/api-client';

// Renders already fetched, keyed by the exact identity that produced them. Kept at module
// scope (not component state/ref) because QuoteEditor - and this component with it - fully
// unmounts and remounts every time the selected scene changes away from and back to a
// quote scene; a component-local cache would be wiped on every such round-trip, making an
// already-rendered style look unrendered again the moment you revisit it.
const previewCache=new Map();

export function RenderedScenePreview({projectId, scene, draft, children, disabled=false}) {
  const [preview,setPreview]=useState(null);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');
  const lastScene=useRef(null);
  const lastQuoteStyle=useRef(null);
  const quote=scene.type==='quote'?(draft || {quoteStyleId:scene.quoteStyleId,quoteFields:scene.quoteFields,quoteText:scene.quoteText,quoteAuthor:scene.quoteAuthor}):null;
  const identity=JSON.stringify({
    projectId,sceneId:scene.scene_id,type:scene.type,assetUrl:scene.assetUrl,
    duration:scene.duration_sec,animation:scene.imageAnimationStyle,
    quote,
    draft:draft || {}
  });
  useEffect(()=>{
    const snapshot=JSON.parse(identity);
    const sceneKey=`${snapshot.projectId}:${snapshot.sceneId}:${snapshot.type}`;
    const quoteStyleKey=snapshot.quote?String(snapshot.quote.quoteStyleId||''):null;
    const selectedNewScene=lastScene.current!==sceneKey;
    setError('');
    const cachedUrl=previewCache.get(identity);
    if(cachedUrl){
      setPreview({identity,url:cachedUrl});
      setLoading(false);
      lastScene.current=sceneKey;
      lastQuoteStyle.current=quoteStyleKey;
      return;
    }
    // A style switch swaps to a different layout, colors and animation entirely - the
    // previous clip would be actively misleading (wrong design, still playing) if left on
    // screen while the new one renders, so drop it immediately just like a scene switch.
    // Plain field edits within the same style keep showing the last good render, since
    // it's still an accurate match while it catches up.
    const selectedNewStyle=quoteStyleKey!==null && lastQuoteStyle.current!==null && lastQuoteStyle.current!==quoteStyleKey;
    if(selectedNewScene||selectedNewStyle)setPreview(null);
    if(disabled || !snapshot.projectId){setLoading(false);return;}
    lastScene.current=sceneKey;
    lastQuoteStyle.current=quoteStyleKey;
    const controller=new AbortController();
    setLoading(true);
    // Selection starts immediately; editing is debounced to avoid rendering each keystroke.
    const immediate=selectedNewScene||selectedNewStyle;
    const timer=setTimeout(async()=>{
      try{
        const result=await request(`/projects/${snapshot.projectId}/scenes/${snapshot.sceneId}/preview`,{
          method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify(snapshot.draft),signal:controller.signal
        });
        const url=toAbsoluteUrl(result.url);
        previewCache.set(identity,url);
        if(!controller.signal.aborted)setPreview({identity,url});
      }catch(err){
        if(!controller.signal.aborted)setError(err.message || 'Preview could not load. Select the scene again to retry.');
      }finally{if(!controller.signal.aborted)setLoading(false);}
    },immediate?0:snapshot.type==='quote'?650:200);
    return ()=>{clearTimeout(timer);controller.abort();};
  },[identity,disabled]);
  // Keep the last rendered clip on screen while a newer one renders, instead of
  // flashing back to the schematic mockup on every keystroke - it stays an exact
  // match of the real render output even mid-edit, just a beat behind.
  const url=preview?.url||'';
  const stale=Boolean(url) && preview.identity!==identity;
  return <div className="scene-render-preview">
    <div className="scene-render-stage" aria-busy={loading}>
      {url?<video key={url} src={url} controls autoPlay loop={scene.type !== 'image'} muted playsInline aria-label="Rendered scene preview" onError={()=>{setPreview(null);setError('The preview could not be played. Select the scene again to retry.');}}/>:children}
      {loading&&<span className="scene-preview-loading" role="status">{stale?'Updating preview…':'Preparing animation…'}</span>}
    </div>
    <div className="scene-preview-actions"><small>Automatic preview · Full scene · 540p · Silent</small></div>
    {error&&<p className="scene-upload-error" role="alert">{error}</p>}
  </div>;
}
