import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const shell=value=>`'${String(value).replace(/'/g, `'\\''`)}'`;
const renderer=fileURLToPath(new URL('./presentation-render.mjs',import.meta.url));
export function presentationCommand(ctx,video,options){
 if(!Number.isFinite(options.durationSec)||options.durationSec<=0)throw new Error('Invalid presentation duration.');
 fs.mkdirSync(ctx.paths.clipCacheDir,{recursive:true});
 const spec=JSON.stringify({video,...options}),file=path.join(ctx.paths.clipCacheDir,`presentation-${crypto.createHash('sha256').update(spec).digest('hex')}.json`);
 fs.writeFileSync(file,spec);return `${shell(process.execPath)} ${shell(renderer)} ${shell(file)}`;
}
