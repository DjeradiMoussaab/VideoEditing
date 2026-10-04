// Original procedural landscapes; no external imagery or font dependencies.
// Run with: node scripts/generate-transition-previews.mjs (requires FFmpeg).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { TRANSITIONS } from '../SHARED/transitions.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'FRONTEND/public/transitions');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'transition-previews-'));
fs.mkdirSync(output, { recursive: true });
const width = 640, height = 360;
function landscape(second) {
  const pixels = Buffer.alloc(width * height * 3);
  const sky = second ? [[38, 62, 94], [172, 204, 204]] : [[215, 165, 107], [248, 218, 165]];
  const layers = second ? [[97, 142, 158], [54, 105, 126], [26, 71, 95], [16, 43, 62]] : [[190, 139, 92], [141, 111, 77], [83, 95, 68], [36, 60, 50]];
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const u = x / width, v = y / height;
    let color = sky[0].map((c, i) => c + (sky[1][i] - c) * v);
    const dx = u - (second ? .73 : .27), dy = (v - .29) * height / width;
    if (dx * dx + dy * dy < .065 ** 2) color = second ? [230, 235, 216] : [255, 238, 189];
    for (let layer = 0; layer < 4; layer++) {
      const ridge = .53 + layer * .12 + .10 * Math.sin(u * (5.8 + layer * 1.6) + layer * 2 + (second ? 3 : 0)) + .024 * Math.sin(u * 19 + layer);
      if (v > ridge) color = layers[layer].map(c => c + (v - ridge) * 10);
    }
    const noise = ((x * 13 + y * 7) % 11 - 5) * .22;
    const i = (y * width + x) * 3;
    color.forEach((c, channel) => pixels[i + channel] = Math.max(0, Math.min(255, Math.round(c + noise))));
  }
  return Buffer.concat([Buffer.from(`P6\n${width} ${height}\n255\n`), pixels]);
}
const ffmpeg = args => execFileSync('ffmpeg', ['-v', 'error', '-y', ...args], { stdio: 'pipe' });
try {
  const a = path.join(temp, 'a.ppm'), b = path.join(temp, 'b.ppm');
  fs.writeFileSync(a, landscape(false)); fs.writeFileSync(b, landscape(true));
  for (const effect of TRANSITIONS) {
    const video = path.join(output, `${effect.id}.mp4`);
    ffmpeg(['-loop', '1', '-framerate', '30', '-t', '1.75', '-i', a,
      '-loop', '1', '-framerate', '30', '-t', '1.75', '-i', b,
      '-filter_complex', `[0:v]format=yuv444p,settb=AVTB[a];[1:v]format=yuv444p,settb=AVTB[b];[a][b]xfade=transition=${effect.id}:duration=1:offset=0.75,format=yuv420p[v]`,
      '-map', '[v]', '-an', '-t', '2.5', '-c:v', 'libx264', '-crf', '22', '-preset', 'medium', '-movflags', '+faststart', video]);
    ffmpeg(['-ss', '1.05', '-i', video, '-frames:v', '1', '-q:v', '3', path.join(output, `${effect.id}.jpg`)]);
  }
  console.log(`Rendered ${TRANSITIONS.length} transition previews in ${output}`);
} finally { fs.rmSync(temp, { recursive: true, force: true }); }
