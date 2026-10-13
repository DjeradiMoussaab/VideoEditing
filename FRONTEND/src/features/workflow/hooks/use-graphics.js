import {useEffect,useRef,useState} from 'react';
import {validateGraphics} from '../../../../../SHARED/graphics.mjs';
export function useGraphics(project,duration,onSave) {
  const draftKey=`graphics-draft:${project?.id}`;
  const [recovered]=useState(()=>{try{const value=JSON.parse(sessionStorage.getItem(draftKey));if(JSON.stringify(value?.items)===JSON.stringify(project?.graphics||[]))return null;return value?.items?validateGraphics(value.items,duration,project?.graphicsFps||30):null;}catch{return null;}});
  const [items,setItems]=useState(recovered||project?.graphics||[]),[selected,setSelected]=useState(null),[saving,setSaving]=useState(false),[error,setError]=useState(recovered?'Recovered unsaved graphics. Review them, then save or discard the draft.':'');
  const current=useRef(items),persisted=useRef(project?.graphics||[]),past=useRef([]),future=useRef([]),inflight=useRef(false);
  const [revision,setRevision]=useState(0);
  const fingerprint=JSON.stringify(project?.graphics||[]);
  const set=next=>{current.current=next;setItems(next);};
  useEffect(()=>{if(!inflight.current&&JSON.stringify(current.current)===JSON.stringify(persisted.current)){const next=project?.graphics||[];persisted.current=next;set(next);}},[fingerprint]);
  useEffect(()=>{
    const dirty=JSON.stringify(items)!==JSON.stringify(persisted.current);
    const store=()=>{try{if(dirty)sessionStorage.setItem(draftKey,JSON.stringify({items:current.current}));else sessionStorage.removeItem(draftKey);}catch{}};
    if(!dirty){store();return;}
    const timer=setTimeout(store,150);
    const warn=e=>{store();e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',warn);return()=>{clearTimeout(timer);store();window.removeEventListener('beforeunload',warn);};
  },[items,saving]);
  async function commit(next=current.current,history=true) {
    if(inflight.current)return false;
    let normalized;try{normalized=validateGraphics(next,duration,project?.graphicsFps||30);}catch(e){setError(e.message);return false;}
    if(JSON.stringify(normalized)===JSON.stringify(persisted.current)){set(normalized);setError('');return true;}
    const previous=persisted.current;set(normalized);inflight.current=true;setSaving(true);setError('');
    try{
      const saved=await onSave(normalized);
      if(history){past.current=[...past.current,previous].slice(-60);future.current=[];}
      persisted.current=saved?.graphics||normalized;set(persisted.current);setRevision(v=>v+1);return true;
    }catch(e){setError(e.message||'Could not save graphics. Your edits are kept.');return false;}
    finally{inflight.current=false;setSaving(false);}
  }
  async function undo(){if(!past.current.length||inflight.current)return;const next=past.current.at(-1),old=persisted.current;if(await commit(next,false)){past.current.pop();future.current.push(old);setRevision(v=>v+1);}}
  async function redo(){if(!future.current.length||inflight.current)return;const next=future.current.at(-1),old=persisted.current;if(await commit(next,false)){future.current.pop();past.current.push(old);setRevision(v=>v+1);}}
  return {items,selected,select:setSelected,set,commit,undo,redo,saving,error,revision,current,canUndo:past.current.length>0,canRedo:future.current.length>0,dirty:JSON.stringify(items)!==JSON.stringify(persisted.current),discard:()=>{set(persisted.current);setError('');}};
}
