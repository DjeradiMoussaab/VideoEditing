import { STYLE_ASSETS, missingStyleAssets } from '../BACKEND/src/services/style-assets.service.mjs';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url)));
let failures = 0;
const report = (ok, message) => { console.log(`${ok ? 'OK' : 'FAIL'} ${message}`); if (!ok) failures++; };
console.log(`Environment: ${process.platform}/${process.arch}, ${os.release()}`);
report(process.versions.node === pkg.engines.node, `Node ${process.versions.node}; baseline ${pkg.engines.node}`);
const npm = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['--version'], {encoding:'utf8',shell:process.platform === 'win32'});
report(npm.stdout?.trim() === pkg.engines.npm, `npm ${npm.stdout?.trim() || 'not found'}; baseline ${pkg.engines.npm}`);
for (const dir of ['BACKEND','FRONTEND']) {
  const manifest = JSON.parse(fs.readFileSync(new URL(`../${dir}/package.json`,import.meta.url)));
  const lock = JSON.parse(fs.readFileSync(new URL(`../${dir}/package-lock.json`,import.meta.url)));
  for (const [name,expected] of Object.entries({...manifest.dependencies,...manifest.devDependencies})) {
    let actual;
    try { actual = JSON.parse(fs.readFileSync(new URL(`../${dir}/node_modules/${name}/package.json`,import.meta.url))).version; } catch {}
    report(actual === expected && lock.packages[`node_modules/${name}`]?.version === expected, `${dir} ${name}: ${actual || 'missing'} (expected ${expected})`);
  }
}
const run = (name,args) => {
  const result=spawnSync(name,args,{encoding:'utf8',timeout:15000,maxBuffer:8*1024*1024});
  if(result.error || result.status!==0){report(false,`${name} ${args.join(' ')} unavailable: ${result.error?.message || result.stderr}`);return '';}
  return result.stdout+result.stderr;
};
const versions = ['ffmpeg','ffprobe'].map(name=>{
 const out=run(name,['-version']);const v=out.match(/version\s+(\S+)/)?.[1];
 report(!!v && /^7\.1(?:\.|$)/.test(v),`${name} ${v || 'missing'}; use the FFmpeg 7.1.x release family for reproducible rendering`);return v;
});
report(!!versions[0] && versions[0]===versions[1], 'FFmpeg and ffprobe versions match');
for (const style of Object.keys(STYLE_ASSETS)) {
  const missing = missingStyleAssets(style);
  report(!missing.length, `Animation assets ${style}${missing.length ? ': missing ' + missing.join(', ') : ': complete'}`);
}
const filters=run('ffmpeg',['-hide_banner','-filters']);
for(const name of ['drawtext','subtitles','zoompan','gblur','xfade','scale','overlay'])report(filters.split(/\s+/).includes(name),`FFmpeg filter: ${name}`);
const encoders=run('ffmpeg',['-hide_banner','-encoders']);
for(const name of ['libx264','aac'])report(encoders.split(/\s+/).includes(name),`FFmpeg encoder: ${name}`);
report(process.platform !== 'win32', 'Rendering uses Unix shell syntax: native macOS/Linux supported; on Windows run the backend in WSL2');
console.log('API credentials are machine-specific. Configure BACKEND/.env; this check never prints secrets.');
console.log('Next: npm run test:render (local synthetic media; no API calls).');
process.exitCode=failures?1:0;
