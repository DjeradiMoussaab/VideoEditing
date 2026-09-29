import {useEffect,useId,useRef,useState} from 'react';

function ProjectNameDialog({project,onRename,onClose,downloadUrl}){
  const dialog=useRef(null),input=useRef(null),heading=useId();
  const [title,setTitle]=useState(project.title||''),[busy,setBusy]=useState(false),[error,setError]=useState('');
  useEffect(()=>{dialog.current.showModal();input.current?.select();},[]);
  return <dialog ref={dialog} className="project-name-dialog" aria-labelledby={heading} onCancel={event=>{event.preventDefault();if(!busy)onClose();}}>
    <form onSubmit={async event=>{
      event.preventDefault();if(busy||!title.trim())return;
      setBusy(true);setError('');
      try{await onRename(project.id,title.trim());if(downloadUrl){const link=document.createElement('a');link.href=downloadUrl;document.body.appendChild(link);link.click();link.remove();}onClose();}
      catch(e){setError(e.message||'Could not save the project title.');setBusy(false);}
    }}>
      <h3 id={heading}>{downloadUrl?'Name your video':'Project title'}</h3>
      <p>{downloadUrl?'Choose a name for your download, or keep the default.':'Give this project a name that is easy to recognize.'}</p>
      <label>Title<input ref={input} autoFocus value={title} onChange={e=>setTitle(e.target.value)} maxLength={100} required disabled={busy}/></label>
      <div className="project-name-hint">{title.trim()||project.title}.mp4</div>
      {error&&<p role="alert" className="error-banner">{error}</p>}
      <div className="project-name-actions"><button type="button" disabled={busy} onClick={onClose}>Cancel</button><button className="project-name-save" type="submit" disabled={busy||!title.trim()}>{busy?'Saving…':downloadUrl?'Save & download':'Save title'}</button></div>
    </form>
  </dialog>;
}

export function ProjectTitle({project,onRename}){
  const [editing,setEditing]=useState(false);
  if(!project)return null;
  return <><button className="project-title-button" type="button" title="Rename project" aria-label={`Rename ${project.title||'project'}`} onClick={()=>setEditing(true)}><span>{project.title||'Project'}</span><span aria-hidden="true">✎</span></button>{editing&&<ProjectNameDialog key={project.id} project={project} onRename={onRename} onClose={()=>setEditing(false)}/>}</>;
}

export function ProjectDownload({project,onRename,href,className,children}){
  const [naming,setNaming]=useState(false);
  return <><a className={className} href={href} onClick={event=>{if(!project.titleIsCustom){event.preventDefault();setNaming(true);}}}>{children||'Download video'}</a>{naming&&<ProjectNameDialog project={project} onRename={onRename} downloadUrl={href} onClose={()=>setNaming(false)}/>}</>;
}
