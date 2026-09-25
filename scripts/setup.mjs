import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url)));
if (process.versions.node !== pkg.engines.node) {
  console.error(`Use Node ${pkg.engines.node} (found ${process.versions.node}). See .nvmrc and SETUP.md.`);
  process.exit(1);
}
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const options = { cwd: root, encoding: 'utf8', shell: process.platform === 'win32' };
const version = spawnSync(npm, ['--version'], options);
if (version.stdout?.trim() !== pkg.engines.npm) {
  console.error(`Use npm ${pkg.engines.npm}: npm install --global npm@${pkg.engines.npm}`);
  process.exit(1);
}
for (const dir of ['BACKEND', 'FRONTEND']) {
  const result = spawnSync(npm, ['ci', '--prefix', dir], {...options, stdio: 'inherit'});
  if (result.error || result.status !== 0) process.exit(result.status || 1);
}
console.log('Exact locked dependencies installed. Next: npm run doctor');
