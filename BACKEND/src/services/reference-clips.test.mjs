import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile, exec } from 'node:child_process';
import { promisify } from 'node:util';
import { buildReferenceClipCatalog, normalizeClipAnalysis, sampleClipTimes, validateReferenceClipFiles, probeReferenceClip } from './reference-clips.service.mjs';
import { makeClipsStep } from '../steps/03-make-clips.mjs';
const run = promisify(execFile);
const shell = promisify(exec);
const temp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'reference-clips-test-'));

function fakeAI(answer) {
    return { chat: { completions: { create: answer } } };
}
const response = data => ({ choices: [{ message: { content: JSON.stringify(data) } }], usage: { prompt_tokens: 100, completion_tokens: 40 } });

test('sampling is bounded, ordered, covers endpoints and handles tiny clips', () => {
    for (const duration of [.05, 1, 9.5, 60]) {
        const times = sampleClipTimes(duration, [1.2, 2.6, 3.5, 4.2, 6.7, 7.6]);
        assert.ok(times.length <= 6);
        assert.equal(times[0], 0);
        assert.ok(times.every((time, i) => time < duration && (i === 0 || time > times[i - 1])));
        assert.ok(sampleClipTimes(duration, [], true).length <= 10);
    }
    const normalized = normalizeClipAnalysis({ caption: 'A field', usable_start_sec: -10, usable_end_sec: 90 }, 8);
    assert.equal(normalized.usableStartSec, 0);
    assert.equal(normalized.usableEndSec, 8);
    assert.throws(() => validateReferenceClipFiles([{ originalname: 'photo.png' }]));
    assert.throws(() => validateReferenceClipFiles(Array.from({ length: 31 }, () => ({ originalname: 'clip.mp4' }))));
});

test('content cache skips API calls, changes invalidate it, and uncertain clips receive one denser pass', async () => {
    const directory = temp();
    try {
        const file = path.join(directory, 'source.mp4');
        const jpg = path.join(directory, 'frame.jpg');
        fs.writeFileSync(file, 'video bytes'); fs.writeFileSync(jpg, 'sample');
        let calls = 0;
        const modes = [];
        const options = { paths: [file], directory, model: 'test',
            probe: async () => ({ duration: 8, width: 640, height: 360 }),
            extract: async (_file, _dir, _duration, dense = false) => { modes.push(dense); return [{ time: 0, path: jpg }, { time: 7.8, path: jpg }]; },
            openai: fakeAI(async ({ messages }) => {
                calls++;
                assert.equal(messages[0].content.filter(part => part.type === 'image_url').length, 2);
                return response({ caption: 'A person walks through a garden.', needs_more_frames: calls === 1 });
            }) };
        const first = await buildReferenceClipCatalog(options);
        assert.equal(first.catalog[0].status, 'ready');
        assert.deepEqual(modes, [false, true]);
        assert.equal(first.stats.promptTokens, 200);
        const second = await buildReferenceClipCatalog({ ...options, cacheIndex: first.index });
        assert.equal(calls, 2); assert.equal(second.stats.cached, 1); assert.equal(second.stats.promptTokens, 0);
        fs.writeFileSync(file, 'changed video bytes');
        await buildReferenceClipCatalog({ ...options, cacheIndex: second.index });
        assert.equal(calls, 3);
        await buildReferenceClipCatalog({ ...options, model: 'different-model', cacheIndex: second.index });
        assert.equal(calls, 4);
        const failed = await buildReferenceClipCatalog({ ...options, openai: fakeAI(async () => { throw new Error('API unavailable'); }) });
        assert.equal(failed.catalog[0].status, 'failed');
        assert.match(failed.catalog[0].error, /unavailable/);
        const retried = await buildReferenceClipCatalog({ ...options, cacheIndex: failed.index });
        assert.equal(retried.catalog[0].status, 'ready');
    } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('real video extraction sends visual samples only and render loops beyond source duration, preserves offsets and stays muted', async () => {
    const directory = temp();
    try {
        const file = path.join(directory, 'reference.mp4');
        await run('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=12:duration=3', '-f', 'lavfi', '-i', 'sine=frequency=400:duration=3', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', file]);
        const info = await probeReferenceClip(file);
        assert.ok(info.duration >= 3);
        const result = await buildReferenceClipCatalog({ paths: [file], directory: path.join(directory, 'analysis'), model: 'test', openai: fakeAI(async ({ messages }) => {
            assert.ok(messages[0].content.every(part => ['text', 'image_url'].includes(part.type)));
            return response({ caption: 'Moving test shapes', usable_start_sec: 1, usable_end_sec: 3 });
        }) });
        assert.equal(result.catalog[0].status, 'ready', result.catalog[0].error);
        assert.ok(result.catalog[0].frameCount >= 2 && result.catalog[0].frameCount <= 6);
        assert.ok(fs.existsSync(result.catalog[0].thumbnailPath));
        const commands = [];
        const ctx = {
            config: { video: { width: 320, height: 180, fps: 12, codec: 'libx264', pixFmt: 'yuv420p', transitionDuration: .5, clipCacheEnabled: false, clipRenderConcurrency: 1 } },
            runOptions: {}, fs: { exists: fs.existsSync },
            plan: { scenes: [{ scene_id: 1, duration_sec: 7 }, { scene_id: 2, duration_sec: 1 }] },
            sceneVisualChoices: { 1: 'video', 2: 'video' },
            sceneVisuals: { 1: { type: 'video', source: 'reference_clip', path: file, mediaOffsetSec: 4 }, 2: { type: 'video', source: 'stock', path: file } },
            paths: { sceneClip: id => path.join(directory, `render-${id}.mp4`) },
            ffmpeg: { execAsync: async cmd => { commands.push(cmd); await shell(cmd); } }
        };
        await makeClipsStep(ctx);
        assert.ok(commands[0].includes('-stream_loop -1'));
        assert.ok(commands[0].includes('-ss 4'));
        assert.ok(!commands[0].includes('tpad='));
        assert.ok(commands[1].includes('-stream_loop -1'));
        const { stdout } = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type', '-of', 'json', ctx.clipFiles[0]]);
        const rendered = JSON.parse(stdout);
        assert.ok(Math.abs(Number(rendered.format.duration) - 7.5) < .15, `Duration ${rendered.format.duration}; command ${commands[0]}`);
        assert.deepEqual(rendered.streams.map(stream => stream.codec_type), ['video']);
    } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
