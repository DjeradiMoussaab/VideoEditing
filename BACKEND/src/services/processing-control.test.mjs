import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { apiConfig } from '../config/api.config.mjs';
import { createManifest, loadManifest, saveManifest } from './job-store.service.mjs';
import { startJobProcess, hasJobProcess } from './job-process.service.mjs';
import { controlProcessing } from './processing-control.service.mjs';

test('pause terminates the worker, preserves checkpoints, and cancel retains inputs', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'processing-control-'));
    const previous = apiConfig.jobsDir;
    apiConfig.jobsDir = directory;
    try {
        const script = path.join(directory, 'worker.mjs');
        fs.writeFileSync(script, 'setInterval(() => {}, 1000);');
        for (const phase of ['DRAFT', 'FINAL']) {
            const id = `test-${phase}`;
            const manifest = createManifest(id);
            manifest.status = `${phase}_RUNNING`;
            manifest.inputs.voiceover = 'saved-input.mp3';
            manifest.draftCheckpoint = { tasks: { plan: { value: 'saved' } } };
            manifest.progress = { percent: 43, stats: { clipsRendered: 2 } };
            saveManifest(id, manifest);
            const done = startJobProcess(id, script, directory);
            assert.equal(hasJobProcess(id), true);
            const paused = await controlProcessing(id, 'pause');
            await done;
            assert.equal(hasJobProcess(id), false);
            assert.equal(paused.status, `${phase}_PAUSED`);
            assert.equal(paused.progress.percent, 43);
            assert.equal(paused.draftCheckpoint.tasks.plan.value, 'saved');
            await assert.rejects(controlProcessing(id, 'pause'), { statusCode: 409 });
            const cancelled = await controlProcessing(id, 'cancel');
            assert.equal(cancelled.status, `${phase}_CANCELLED`);
            assert.equal(loadManifest(id).inputs.voiceover, 'saved-input.mp3');
            await assert.rejects(controlProcessing(id, 'resume'), { statusCode: 409 });
            await assert.rejects(controlProcessing(id, 'cancel'), { statusCode: 409 });
        }
        await assert.rejects(controlProcessing('missing', 'pause'), { statusCode: 404 });
        await assert.rejects(controlProcessing('missing', 'invalid'), { statusCode: 400 });
    } finally {
        apiConfig.jobsDir = previous;
        fs.rmSync(directory, { recursive: true, force: true });
    }
});

test('HTTP API exposes paused projects and blocks scene mutations until cancellation', async () => {
    const { createApp } = await import('../app.mjs');
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'processing-api-'));
    const previous = apiConfig.jobsDir;
    apiConfig.jobsDir = directory;
    const server = createApp().listen(0, '127.0.0.1');
    try {
        await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
        const project = createManifest('paused-api');
        project.status = 'DRAFT_PAUSED';
        saveManifest(project.id, project);
        const base = `http://127.0.0.1:${server.address().port}/api/projects/${project.id}`;
        const read = await fetch(base);
        assert.equal(read.status, 200);
        assert.equal((await read.json()).project.status, 'DRAFT_PAUSED');
        const edit = await fetch(`${base}/scenes/1`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'image' }) });
        assert.equal(edit.status, 409);
        const cancel = await fetch(`${base}/processing/cancel`, { method: 'POST' });
        assert.equal(cancel.status, 200);
        assert.equal((await cancel.json()).project.status, 'DRAFT_CANCELLED');
        const invalid = await fetch(`${base}/processing/resume`, { method: 'POST' });
        assert.equal(invalid.status, 409);
    } finally {
        await new Promise(resolve => server.close(resolve));
        apiConfig.jobsDir = previous;
        fs.rmSync(directory, { recursive: true, force: true });
    }
});

test('recovers detached workers after registry loss and clears stale running projects', async () => {
    const { spawn } = await import('node:child_process');
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'processing-recovery-'));
    const previous = { jobsDir: apiConfig.jobsDir, rootDir: apiConfig.rootDir };
    apiConfig.jobsDir = path.join(directory, 'out');
    apiConfig.rootDir = directory;
    const script = path.join(directory, 'src/jobs/run-draft-job.mjs');
    fs.mkdirSync(path.dirname(script), { recursive: true });
    fs.writeFileSync(script, 'setInterval(() => {}, 1000);');
    let child;
    try {
        const project = createManifest('recovered');
        project.status = 'DRAFT_RUNNING';
        project.progress = { percent: 37 };
        saveManifest(project.id, project);
        // This worker is deliberately not in the API server's in-memory map.
        const alternateNode = path.join(directory, 'another-node-installation', 'node');
        fs.mkdirSync(path.dirname(alternateNode));
        fs.symlinkSync(process.execPath, alternateNode);
        child = spawn(alternateNode, [script, project.id], { detached: true, stdio: 'ignore' });
        const closed = new Promise(resolve => child.once('close', resolve));
        await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); });
        assert.equal(hasJobProcess(project.id), true);
        assert.equal(hasJobProcess('another-project'), false);
        const paused = await controlProcessing(project.id, 'pause');
        await closed;
        assert.equal(paused.status, 'DRAFT_PAUSED');
        assert.equal(paused.progress.percent, 37);
        assert.equal(hasJobProcess(project.id), false);
        for (const status of ['DRAFT_RUNNING', 'FINAL_RUNNING', 'DRAFT_STOPPING']) {
            const stale = createManifest(`stale-${status}`);
            stale.status = status;
            saveManifest(stale.id, stale);
            const cancelled = await controlProcessing(stale.id, 'cancel');
            assert.match(cancelled.status, /_CANCELLED$/);
        }
    } finally {
        if (child?.pid) { try { process.kill(-child.pid, 'SIGKILL'); } catch {} }
        Object.assign(apiConfig, previous);
        fs.rmSync(directory, { recursive: true, force: true });
    }
});
