import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {apiConfig} from '../config/api.config.mjs';

const catalogPath=()=>path.join(apiConfig.jobsDir,'.project-titles.json');
function readCatalog(){
  if(!fs.existsSync(catalogPath()))return {lastNumber:0,projects:{}};
  const data=JSON.parse(fs.readFileSync(catalogPath(),'utf8'));
  if(!Number.isSafeInteger(data.lastNumber)||!data.projects)throw Error('Project title catalog is invalid.');
  return data;
}
function updateCatalog(action){
  fs.mkdirSync(apiConfig.jobsDir,{recursive:true});
  const lock=`${catalogPath()}.lock`;
  let fd;
  for(let i=0;i<100;i++){
    try{fd=fs.openSync(lock,'wx');fs.writeFileSync(fd,String(process.pid));break;}
    catch(error){
      if(error.code!=='EEXIST')throw error;
      try{const pid=Number(fs.readFileSync(lock,'utf8'));if(pid>0)process.kill(pid,0);}
      catch(e){if(e.code==='ESRCH'){fs.rmSync(lock,{force:true});continue;}}
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,20);
    }
  }
  if(fd===undefined)throw Object.assign(Error('Project titles are busy. Please try again.'),{statusCode:409});
  try{
    const data=readCatalog();
    // Assign stable chronological numbers to projects created before titles existed.
    const legacy=fs.readdirSync(apiConfig.jobsDir,{withFileTypes:true}).filter(e=>e.isDirectory()&&!e.name.startsWith('.')).flatMap(e=>{
      const file=path.join(apiConfig.jobsDir,e.name,'manifest.json');
      if(!fs.existsSync(file)||data.projects[e.name])return [];
      const m=JSON.parse(fs.readFileSync(file,'utf8'));return [{id:e.name,createdAt:m.createdAt||''}];
    }).sort((a,b)=>a.createdAt.localeCompare(b.createdAt)||a.id.localeCompare(b.id));
    for(const m of legacy)allocate(data,m.id);
    const result=action(data);
    const temp=`${catalogPath()}.${randomUUID()}.tmp`;
    fs.writeFileSync(temp,JSON.stringify(data,null,2));fs.renameSync(temp,catalogPath());
    return result;
  }finally{fs.closeSync(fd);fs.rmSync(lock,{force:true});}
}
function allocate(data,id){
  const projectNumber=++data.lastNumber;
  return data.projects[id]={projectNumber,title:`Project ${projectNumber}`,titleIsCustom:false};
}
export function projectIdentity(id){
  return readCatalog().projects[id]||updateCatalog(data=>data.projects[id]||allocate(data,id));
}
export function renameProject(id,value){
  if(!/^[a-z0-9][a-z0-9_-]{0,100}$/i.test(id))throw Object.assign(Error('Invalid project ID.'),{statusCode:400});
  if(typeof value!=='string')throw Object.assign(Error('Enter a project title.'),{statusCode:400});
  const title=value.trim().normalize('NFC');
  if(!title||title.length>100||/[\x00-\x1f\x7f]/.test(title))throw Object.assign(Error('Use a title between 1 and 100 characters, without line breaks.'),{statusCode:400});
  if(!fs.existsSync(path.join(apiConfig.jobsDir,id,'manifest.json')))throw Object.assign(Error('Project not found.'),{statusCode:404});
  return updateCatalog(data=>{
    const identity=data.projects[id]||allocate(data,id);
    identity.title=title;identity.titleIsCustom=true;
    return {...identity};
  });
}
export function projectVideoFilename(identity,version){
  let name=String(identity.title||`Project ${identity.projectNumber}`).replace(/[<>:"/\\|?*\x00-\x1f\x7f]/g,'-').replace(/[. ]+$/g,'').trim();
  if(!name)name=`Project ${identity.projectNumber}`;
  if(/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name))name=`_${name}`;
  return `${name}${version?` - v${version}`:''}.mp4`;
}
