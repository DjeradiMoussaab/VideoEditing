import assert from 'node:assert/strict';
import { execFileSync, execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { config } from '../config.mjs';
import { imageMotionCommand } from './image-motion.service.mjs';
import { imageMotionTiming } from './image-motion-timing.mjs';

test('image clock validates duration and rounds to at least one output frame', () => {
    for (const duration of [0, -1, NaN, Infinity]) {
        assert.throws(() => imageMotionTiming(duration, 30));
    }
    assert.equal(imageMotionTiming(.001, 60).frames, 1);
    assert.equal(imageMotionTiming(6.43, 60).frames, 386);
});

// Match the exact quarter/half/three-quarter positions of two different scene
// lengths. This checks actual decoded pictures, including all source overlays.
for (const [id, profile] of Object.entries(config.video.imageAnimationProfiles)) {
    test(`${id}: matching scene progress produces matching motion at different durations`, () => {
        const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'image-timing-'));
        try {
            const img = path.join(directory, 'grid.ppm');
            const pixels = Buffer.alloc(128 * 72 * 3);
            for (let y = 0; y < 72; y++) for (let x = 0; x < 128; x++) {
                const offset = (y * 128 + x) * 3;
                pixels[offset] = x * 2;
                pixels[offset + 1] = y * 3;
                pixels[offset + 2] = (Math.floor(x / 12) + Math.floor(y / 12)) % 2 ? 230 : 30;
            }
            fs.writeFileSync(img, Buffer.concat([Buffer.from('P6\n128 72\n255\n'), pixels]));
            const decoded = [];
            for (const [frames, fps] of [[61, 30], [121, 30], [121, 60], [1, 60]]) {
                const clip = path.join(directory, `${frames}-${fps}.mp4`);
                execSync(imageMotionCommand({ width: 160, height: 90, fps, codec: 'libx264', encodePreset: 'ultrafast' }, profile, {
                    img, clip, durationSec: frames === 1 ? .001 : frames / fps
                }).replace('-preset ultrafast', '-preset ultrafast -crf 0'), { stdio: 'pipe' });
                const metadata = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,nb_frames,r_frame_rate:format=duration', '-of', 'json', clip]));
                assert.equal(metadata.streams.length, 1, 'no animation soundtrack');
                assert.equal(Number(metadata.streams[0].nb_frames), frames, 'exact scene frame count');
                assert.equal(metadata.streams[0].r_frame_rate, `${fps}/1`);
                assert.ok(Math.abs(Number(metadata.format.duration) - frames / fps) < .002);
                if (frames === 1) continue;
                const step = (frames - 1) / 4;
                decoded.push(execFileSync('ffmpeg', ['-v', 'error', '-i', clip, '-vf', `select='eq(n,${step})+eq(n,${step * 2})+eq(n,${step * 3})'`, '-fps_mode', 'passthrough', '-pix_fmt', 'rgb24', '-f', 'rawvideo', '-']));
            }
            for (const comparison of decoded.slice(1)) {
                assert.equal(comparison.length, decoded[0].length);
                let error = 0;
                for (let i = 0; i < comparison.length; i++) error += Math.abs(comparison[i] - decoded[0][i]);
                // Allow rounding during footage interpolation, but catch resets,
                // mismatched fades, and cameras still using wall-clock seconds.
                assert.ok(error / comparison.length < 1, `normalized image difference ${error / comparison.length}`);
            }
        } finally {
            fs.rmSync(directory, { recursive: true, force: true });
        }
    });
}
