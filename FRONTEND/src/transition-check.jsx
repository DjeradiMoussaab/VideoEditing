import React, {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {EditorPage} from './features/workflow/pages/EditorPage';
import {normalizeTransitions} from '../../SHARED/transitions.mjs';
import './app/styles.css';
function Fixture(){
 const [scenes,setScenes]=useState(normalizeTransitions([0,1,2].map(i=>({scene_id:i+1,start_sec:i*4,end_sec:(i+1)*4,duration_sec:4,type:'image',assetUrl:`http://localhost:5173/transitions/${i===1?'smoothright':'fade'}.jpg`}))));
 const [selected,select]=useState(1), [busy,setBusy]=useState(null), [fail,setFail]=useState(false);
 return <main style={{maxWidth:1400,padding:24,margin:'auto'}}><EditorPage project={{id:'test',title:'The quiet between scenes',status:'DRAFT_READY',scenes}} scenes={scenes} selectedScene={scenes.find(s=>s.scene_id===selected)} selectedSceneId={selected} onSelectScene={select} busySceneId={busy}
 onSceneBoundaryChange={async(id,delta)=>setScenes(old=>normalizeTransitions(old.map(s=>s.scene_id===id?{...s,end_sec:s.end_sec+delta,duration_sec:s.duration_sec+delta}:s.scene_id===id+1?{...s,start_sec:s.start_sec+delta,duration_sec:s.duration_sec-delta}:s)))}
 onTransitionChange={async(id,transition)=>{setBusy(id);await new Promise(r=>setTimeout(r,200));try{if(fail)throw new Error('Test save failed');setScenes(old=>old.map(s=>s.scene_id===id?{...s,transition}:s));}finally{setBusy(null);}}}/>
 <label><input type="checkbox" checked={fail} onChange={e=>setFail(e.target.checked)}/>Simulate save failure</label></main>;
}
createRoot(document.getElementById('root')).render(<Fixture/>);
