import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { apiConfig } from '../config/api.config.mjs';
import { createManifest, ensureJobDirs, saveManifest, loadManifest } from './job-store.service.mjs';
import { saveProjectInputs, selectReferenceMatch, adjustSceneBoundary, splitScene, deleteScene } from './pipeline-backend.service.mjs';
const run = promisify(execFile);

test('clip upload, suggestions, manual selection, reload and timeline edits retain media type and valid trims', async () => {
    const original = apiConfig.jobsDir;
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'clip-project-test-'));
    apiConfig.jobsDir = path.join(directory, 'jobs');
    try {
        const fixture = path.join(directory, 'fixture.mp4');
        await run('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=blue:s=160x90:r=12:d=8', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', fixture]);
        const manifest = createManifest('clips');
        ensureJobDirs(manifest.id); saveManifest(manifest.id, manifest);
        const uploaded = ['first', 'second'].map(name => {
            const target = path.join(directory, `${name}.mp4`); fs.copyFileSync(fixture, target);
            return { originalname: 'same-name.mp4', path: target };
        });
        const saved = await saveProjectInputs(manifest.id, {
            voiceover: [{ buffer: Buffer.from('voiceover') }], reference: [{ originalname: 'photo.jpg', buffer: Buffer.from('image') }], referenceClip: uploaded
        });
        assert.equal(saved.inputs.referenceClips.length, 2);
        assert.notEqual(saved.inputs.referenceClips[0], saved.inputs.referenceClips[1]);
        assert.ok(uploaded.every(file => !fs.existsSync(file.path)), 'temporary uploads are removed');
        for (const file of saved.inputs.referenceClips) saved.referenceClipIndex[file] = { status: 'ready', caption: 'Blue background', duration: 8, usableStartSec: 1, usableEndSec: 8 };
        saved.scenes = [1, 2].map((id, i) => ({ scene_id: id, type: 'image', source: 'reference', start_sec: i * 6, end_sec: (i + 1) * 6, duration_sec: 6, narration: 'blue background' }));
        saved.plan = { scenes: structuredClone(saved.scenes) }; saved.status = 'DRAFT_READY';
        saveManifest(saved.id, saved);
        const loaded = loadManifest(saved.id);
        assert.equal(loaded.scenes[0].referenceMatches.length, 3);
        assert.equal(loaded.scenes[0].referenceMatches.find(ref => ref.id === 'clip_1').type, 'video');
        const selected = await selectReferenceMatch(saved.id, 1, 'clip_1');
        assert.equal(selected.scenes[0].source, 'reference_clip');
        assert.equal(selected.scenes[0].type, 'video');
        assert.equal(selected.scenes[0].mediaOffsetSec, 1);
        assert.equal(loadManifest(saved.id).scenes[0].assetPath, saved.inputs.referenceClips[0]);
        const extended = await adjustSceneBoundary(saved.id, 1, 3);
        assert.equal(extended.scenes[0].duration_sec, 9, 'reference clip loops to cover an extended scene');
        await adjustSceneBoundary(saved.id, 1, -3);
        const beforeMerge = loadManifest(saved.id);
        const merged = deleteScene(saved.id, 2, beforeMerge.updatedAt);
        assert.equal(merged.project.scenes[0].duration_sec, 12);
        assert.equal(merged.project.scenes[0].source, 'reference_clip');
        const reselected = await selectReferenceMatch(saved.id, 1, 'clip_1');
        assert.equal(reselected.scenes[0].duration_sec, 12, 'short clips remain selectable for long scenes');
        saveManifest(saved.id, beforeMerge);
        const divided = splitScene(saved.id, 1, 3, loadManifest(saved.id).updatedAt);
        assert.equal(divided.project.scenes[1].mediaOffsetSec, 4);
        assert.equal(divided.project.scenes[1].source, 'reference_clip');
        assert.equal(divided.project.scenes[1].duration_sec, 3);
        const imageAgain = await selectReferenceMatch(saved.id, 1, 'ref_1');
        assert.equal(imageAgain.scenes[0].type, 'image');
        assert.equal(imageAgain.scenes[0].mediaOffsetSec, 0);
        assert.equal(imageAgain.scenes[0].duration_sec, 3);
        const invalid = path.join(directory, 'broken.mp4'); fs.writeFileSync(invalid, 'not a video');
        await assert.rejects(saveProjectInputs(saved.id, { voiceover: [{ buffer: Buffer.from('new audio') }], referenceClip: [{ originalname: 'bad.mp4', path: invalid }] }), /bad.mp4/);
        assert.equal(fs.existsSync(invalid), false);
        assert.equal(fs.readFileSync(saved.inputs.voiceover, 'utf8'), 'voiceover', 'invalid clip does not overwrite project inputs');
        assert.equal(loadManifest(saved.id).inputs.referenceClips.length, 2);
    } finally { apiConfig.jobsDir = original; fs.rmSync(directory, { recursive: true, force: true }); }
});

test('multipart project endpoint accepts referenceClip field and cleans disk uploads', async () => {
    const { createApp } = await import('../app.mjs');
    const originalJobs = apiConfig.jobsDir, originalUploads = apiConfig.uploadsDir;
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'clip-http-test-'));
    apiConfig.jobsDir = path.join(directory, 'jobs'); apiConfig.uploadsDir = path.join(directory, 'uploads');
    let server;
    try {
        const fixture = path.join(directory, 'fixture.mp4');
        await run('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=green:s=160x90:r=12:d=1', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', fixture]);
        server = createApp().listen(0, '127.0.0.1');
        await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
        const url = `http://127.0.0.1:${server.address().port}/api/projects`;
        const created = await (await fetch(url, { method: 'POST' })).json();
        const form = new FormData();
        form.append('voiceover', new Blob(['audio'], { type: 'audio/mpeg' }), 'voiceover.mp3');
        form.append('referenceClip', new Blob([fs.readFileSync(fixture)], { type: 'video/mp4' }), 'sample.mp4');
        const result = await fetch(`${url}/${created.project.id}/inputs`, { method: 'POST', body: form });
        assert.equal(result.status, 200, await result.clone().text());
        const uploaded = await result.json();
        assert.equal(uploaded.project.inputs.referenceClips.length, 1);
        assert.equal(fs.readdirSync(apiConfig.uploadsDir).length, 0);
        const invalid = new FormData();
        invalid.append('voiceover', new Blob(['audio']), 'voiceover.mp3');
        invalid.append('referenceClip', new Blob(['wrong type']), 'not-video.txt');
        const rejected = await fetch(`${url}/${created.project.id}/inputs`, { method: 'POST', body: invalid });
        assert.equal(rejected.status, 400);
        assert.equal(fs.readdirSync(apiConfig.uploadsDir).length, 0);
    } finally {
        if (server) await new Promise(resolve => server.close(resolve));
        apiConfig.jobsDir = originalJobs; apiConfig.uploadsDir = originalUploads;
        fs.rmSync(directory, { recursive: true, force: true });
    }
});
