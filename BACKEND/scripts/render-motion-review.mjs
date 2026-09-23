import fs from 'node:fs';
import path from 'node:path';
import { execSync, execFileSync } from 'node:child_process';
import { config } from '../src/config.mjs';
import { imageMotionCommand } from '../src/services/image-motion.service.mjs';

const source = path.resolve(process.argv[2] || '../input/reference.jpg');
const output = path.resolve(process.argv[3] || 'out/motion-review');
const width = Number(process.env.REVIEW_WIDTH || 1280);
const duration = Number(process.env.REVIEW_DURATION || 3);
fs.mkdirSync(output, { recursive: true });
const metrics = [];
for (const [id, profile] of Object.entries(config.video.imageAnimationProfiles)) {
    const clip = path.join(output, `${id}.mp4`);
    const started = performance.now();
    execSync(imageMotionCommand({ ...config.video, width, height: width * 9 / 16, fps: 60, codec: process.env.REVIEW_CODEC || 'libx264' }, profile, { img: source, clip, durationSec: duration }), { stdio: 'inherit' });
    const elapsed = (performance.now() - started) / 1000;
    const info = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=width,height,nb_frames,r_frame_rate', '-of', 'json', clip], { encoding: 'utf8' })).streams[0];
    if (Number(info.nb_frames) !== Math.round(duration * 60) || info.r_frame_rate !== '60/1') throw new Error(`Invalid frames: ${id}`);
    metrics.push({ id, elapsedSec: elapsed, renderSecondsPerVideoSecond: elapsed / duration, ...info });
    console.log(`${id}: ${elapsed.toFixed(2)}s render, ${info.nb_frames} frames @ ${info.r_frame_rate}`);
}
fs.writeFileSync(path.join(output, 'metrics.json'), JSON.stringify(metrics, null, 2));
const cards = Object.entries(config.video.imageAnimationProfiles).map(([id, profile]) => `<article><video controls muted loop playsinline preload="metadata" src="${id}.mp4"></video><h2>${profile.label}</h2><p>${profile.description}</p></article>`).join('');
fs.writeFileSync(path.join(output, 'index.html'), `<!doctype html><html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Motion review</title><style>body{background:#0a111b;color:#eff2f6;font:15px system-ui;margin:32px}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:24px}article{background:#151e2a;padding:12px;border-radius:16px}video{width:100%;border-radius:8px}h2{font-size:18px}p{color:#aebaca;line-height:1.5}</style><h1>Storytelling motion · 60 fps</h1><p>Rendered with the production animation engine. Play a sample to review its motion.</p><main>${cards}</main></html>`);
