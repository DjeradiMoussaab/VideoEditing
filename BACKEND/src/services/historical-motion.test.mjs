import assert from 'node:assert/strict';
import { execFileSync, execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { HISTORICAL_CYCLE_SEC, historicalMotionCommand } from './historical-motion.service.mjs';

test('historical preset stretches the silent animation without repeating', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'historical-motion-'));
    try {
        const image = path.join(directory, "family's photo.ppm");
        const clip = path.join(directory, 'historical.mp4');
        fs.writeFileSync(image, Buffer.concat([
            Buffer.from('P6\n64 36\n255\n'),
            Buffer.alloc(64 * 36 * 3, 110)
        ]));
        execSync(historicalMotionCommand(
            { width: 160, height: 90, fps: 30, codec: 'libx264', encodePreset: 'ultrafast' },
            { img: image, clip, durationSec: HISTORICAL_CYCLE_SEC * 2 }
        ), { stdio: 'pipe' });
        const result = JSON.parse(execFileSync('ffprobe', [
            '-v', 'error', '-show_entries', 'stream=codec_type,width,height,nb_frames:format=duration',
            '-of', 'json', clip
        ]));
        assert.equal(result.streams.length, 1);
        assert.equal(result.streams[0].codec_type, 'video');
        assert.equal(result.streams[0].nb_frames, '302');
        assert.equal(result.streams[0].width, 160);
        assert.equal(result.streams[0].height, 90);
        assert.ok(Math.abs(Number(result.format.duration) - HISTORICAL_CYCLE_SEC * 2) < .01);
        const pixels = execFileSync('ffmpeg', [
            '-v', 'error', '-i', clip, '-vf', "select='eq(n,90)+eq(n,241)'",
            '-fps_mode', 'passthrough', '-pix_fmt', 'gray', '-f', 'rawvideo', '-'
        ]);
        const size = 160 * 90;
        assert.equal(pixels.length, size * 2);
        let difference = 0;
        for (let i = 0; i < size; i++) difference += Math.abs(pixels[i] - pixels[size + i]);
        assert.ok(difference / size > 2, 'motion must not repeat at the former cycle boundary');
    } finally {
        fs.rmSync(directory, { recursive: true, force: true });
    }
});
