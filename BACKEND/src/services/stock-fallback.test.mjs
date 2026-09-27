import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { exec, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { apiConfig } from '../config/api.config.mjs';
import { ensureJobDirs } from './job-store.service.mjs';
import { createFallbackStockClip } from './pipeline-backend.service.mjs';

const run = promisify(execFile);
const shell = promisify(exec);

test('stock fallback renders in the explicit job directory without an ambient jobId', async () => {
    const original = apiConfig.jobsDir;
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'stock-fallback-'));
    apiConfig.jobsDir = directory;
    try {
        const ctx = { config: { video: { width: 160, height: 90, fps: 10 } },
            ffmpeg: { execAsync: command => shell(command) } };
        const jobId = 'fallback-regression';
        const output = await createFallbackStockClip(ctx, jobId, 1);
        assert.equal(path.dirname(output), ensureJobDirs(jobId).customDir);
        assert.ok(fs.statSync(output).size > 0);
        const { stdout } = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type,width,height', '-of', 'json', output]);
        const media = JSON.parse(stdout);
        assert.deepEqual(media.streams.map(stream => stream.codec_type), ['video']);
        assert.equal(media.streams[0].width, 160);
        assert.equal(media.streams[0].height, 90);
        assert.ok(Math.abs(Number(media.format.duration) - 1) < .15);
    } finally {
        apiConfig.jobsDir = original;
        fs.rmSync(directory, { recursive: true, force: true });
    }
});
