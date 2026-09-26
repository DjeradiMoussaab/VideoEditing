import {useEffect, useRef, useState} from 'react';
import {request, toAbsoluteUrl} from '../../../services/api-client';

export function RenderedScenePreview({projectId, scene, draft, children, disabled=false}) {
  const [preview,setPreview]=useState(null);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');
  const lastScene=useRef(null);
  const identity=JSON.stringify({
    projectId,sceneId:scene.scene_id,type:scene.type,assetUrl:scene.assetUrl,
    duration:scene.duration_sec,animation:scene.imageAnimationStyle,
    quote:scene.type==='quote'?(draft || {quoteStyleId:scene.quoteStyleId,quoteFields:scene.quoteFields,quoteText:scene.quoteText,quoteAuthor:scene.quoteAuthor}):null,
    draft:draft || {}
  });
  useEffect(()=>{
    const snapshot=JSON.parse(identity);
    const sceneKey=`${snapshot.projectId}:${snapshot.sceneId}:${snapshot.type}`;
    const selectedNewScene=lastScene.current!==sceneKey;
    setError('');
    if(disabled || !snapshot.projectId){setLoading(false);return;}
    lastScene.current=sceneKey;
    const controller=new AbortController();
    setLoading(true);
    // Selection starts immediately; editing is debounced to avoid rendering each keystroke.
    const timer=setTimeout(async()=>{
      try{
        const result=await request(`/projects/${snapshot.projectId}/scenes/${snapshot.sceneId}/preview`,{
          method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify(snapshot.draft),signal:controller.signal
        });
        if(!controller.signal.aborted)setPreview({identity,url:toAbsoluteUrl(result.url)});
      }catch(err){
        if(!controller.signal.aborted)setError(err.message || 'Preview could not load. Select the scene again to retry.');
      }finally{if(!controller.signal.aborted)setLoading(false);}
    },selectedNewScene?0:snapshot.type==='quote'?650:200);
    return ()=>{clearTimeout(timer);controller.abort();};
  },[identity,disabled]);
  const url=preview?.identity===identity?preview.url:'';
  return <div className="scene-render-preview">
    <div className="scene-render-stage" aria-busy={loading}>
      {url?<video key={url} src={url} controls autoPlay loop muted playsInline aria-label="Rendered scene preview" onError={()=>{setPreview(null);setError('The preview could not be played. Select the scene again to retry.');}}/>:children}
      {loading&&<span className="scene-preview-loading" role="status">Preparing animation…</span>}
    </div>
    <div className="scene-preview-actions"><small>Automatic preview · Full scene · 540p · Silent</small></div>
    {error&&<p className="scene-upload-error" role="alert">{error}</p>}
  </div>;
}
