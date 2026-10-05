import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { createApp } from '../app.mjs';
import { apiConfig } from '../config/api.config.mjs';
import { createManifest, saveManifest, loadManifest, getJobPaths } from './job-store.service.mjs';
import { selectReferenceMatch } from './pipeline-backend.service.mjs';

test('ADD uploads persist as suggestions without replacing scenes, and rejects invalid media', async () => {
  const previous = { jobsDir: apiConfig.jobsDir, uploadsDir: apiConfig.uploadsDir };
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'suggestion media '));
  apiConfig.jobsDir = path.join(root, 'jobs');
  apiConfig.uploadsDir = path.join(root, 'uploads');
  let server;
  try {
    const image = path.join(root, 'photo.png');
    const clip = path.join(root, 'clip.mp4');
    execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=blue:s=64x36', '-frames:v', '1', image]);
    execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=red:s=64x36:d=0.2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', clip]);
    const project = createManifest('add-suggestion-test');
    project.scenes = [1, 2].map(id => ({ scene_id: id, type: id === 2 ? 'quote' : 'image', quoteText: 'Keep this', assetUrl: '/existing.png', duration_sec: 4, start_sec: (id - 1) * 4, end_sec: id * 4 }));
    project.plan = { scenes: structuredClone(project.scenes) };
    project.artifacts = { needsRegeneration: false };
    saveManifest(project.id, project);
    const before = loadManifest(project.id);
    server = createApp().listen(0, '127.0.0.1');
    await once(server, 'listening');
    const url = `http://127.0.0.1:${server.address().port}/api/projects/${project.id}/suggestions/media`;
    async function upload(buffer, filename, type) {
      const body = new FormData();
      if (buffer) body.append('media', new Blob([buffer], { type }), filename);
      const response = await fetch(url, { method: 'POST', body });
      return { status: response.status, body: await response.json() };
    }
    for (const [file, type] of [[image, 'image/png'], [clip, 'video/mp4']]) {
      const result = await upload(fs.readFileSync(file), path.basename(file), type);
      assert.equal(result.status, 200, JSON.stringify(result.body));
      assert.equal(result.body.project.artifacts.needsRegeneration, false);
      for (const [index, scene] of result.body.project.scenes.entries()) {
        const { referenceMatches, ...rest } = scene;
        const { referenceMatches: ignored, ...original } = before.scenes[index];
        assert.deepEqual(rest, original);
      }
    }
    let saved = loadManifest(project.id);
    assert.equal(saved.uploadedMedia.length, 2);
    assert.ok(saved.scenes.every(scene => scene.referenceMatches.some(match => match.type === 'image') && scene.referenceMatches.some(match => match.type === 'video')));
    const filesBeforeFailure = fs.readdirSync(getJobPaths(project.id).customDir);
    for (const args of [[null], [Buffer.from('bad'), 'bad.png', 'image/png'], [Buffer.from('bad'), 'notes.txt', 'text/plain']]) {
      const result = await upload(...args);
      assert.equal(result.status, 400);
      assert.ok(result.body.error);
    }
    assert.deepEqual(fs.readdirSync(getJobPaths(project.id).customDir), filesBeforeFailure);
    assert.equal(loadManifest(project.id).uploadedMedia.length, 2);
    saved = await selectReferenceMatch(project.id, 1, saved.uploadedMedia[1].id);
    assert.equal(saved.scenes[0].type, 'video');
    assert.equal(saved.scenes[0].source, 'custom_video');
    saved = await selectReferenceMatch(project.id, 2, saved.uploadedMedia[0].id);
    assert.equal(saved.scenes[1].type, 'quote');
    assert.equal(saved.scenes[1].quoteText, 'Keep this');
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    Object.assign(apiConfig, previous);
    fs.rmSync(root, { recursive: true, force: true });
  }
});
