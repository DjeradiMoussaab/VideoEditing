import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const shell=value=>`'${String(value).replace(/'/g, `'\\''`)}'`;
const renderer=fileURLToPath(new URL('./text-quotes-render.mjs',import.meta.url));

// Keep the existing clip-command contract; the worker streams frames without a
// browser, temporary image sequences, or an After Effects installation.
export function textQuotesCommand(ctx,video,options){
  if(!Number.isFinite(options.durationSec)||options.durationSec<=0)throw new Error('Invalid quote duration.');
  fs.mkdirSync(ctx.paths.clipCacheDir,{recursive:true});
  const spec=JSON.stringify({video,...options});
  const file=path.join(ctx.paths.clipCacheDir,`text-quotes-${crypto.createHash('sha256').update(spec).digest('hex')}.json`);
  fs.writeFileSync(file,spec);
  return `${shell(process.execPath)} ${shell(renderer)} ${shell(file)}`;
}
