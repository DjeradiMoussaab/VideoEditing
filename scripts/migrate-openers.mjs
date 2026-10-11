import fs from 'node:fs';
import path from 'node:path';
import {apiConfig} from '../BACKEND/src/config/api.config.mjs';
import {migrateLegacyOpeners} from '../BACKEND/src/services/job-store.service.mjs';

// Dry-run by default. --write retains an exact backup before each atomic update.
const write=process.argv.includes('--write');
let projects=0, scenes=0, inspected=0;
for(const entry of fs.readdirSync(apiConfig.jobsDir,{withFileTypes:true})){
  if(!entry.isDirectory())continue;
  const file=path.join(apiConfig.jobsDir,entry.name,'manifest.json');
  if(!fs.existsSync(file))continue;
  inspected++;
  const original=fs.readFileSync(file,'utf8'), manifest=JSON.parse(original);
  const changed=migrateLegacyOpeners(manifest);
  if(!changed)continue;
  if(/_(RUNNING|PAUSED|STOPPING)$/.test(manifest.status||''))throw new Error(`Stop processing ${entry.name} before migrating it.`);
  if(write){
    fs.writeFileSync(`${file}.before-openers.bak`,original,{flag:'wx'});
    const temporary=`${file}.openers.tmp`;
    fs.writeFileSync(temporary,JSON.stringify(manifest,null,2));
    fs.renameSync(temporary,file);
  }
  projects++; scenes+=changed;
}
console.log(JSON.stringify({mode:write?'updated':'dry-run',inspected,projects,scenes}));
