import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { apiConfig } from '../config/api.config.mjs';
import { createManifest, saveManifest, loadManifest } from './job-store.service.mjs';
import { uploadSceneImage, uploadSceneVideo, selectReferenceMatch } from './pipeline-backend.service.mjs';

test('replacement images and clips remain selectable in all scenes after reload and further replacements', async () => {
  const previous = apiConfig.jobsDir;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'replacement-library-'));
  apiConfig.jobsDir = root;
  try {
    const project = createManifest('replacement-library');
    project.scenes = [1, 2, 3].map((id) => ({ scene_id: id, type: id === 3 ? 'quote' : 'image', quoteText: id === 3 ? 'Keep this quote' : null, duration_sec: 4, start_sec: (id - 1) * 4, end_sec: id * 4 }));
    project.plan = { scenes: structuredClone(project.scenes) }; project.sceneChoices = { 1: 'image', 2: 'image', 3: 'quote' };
    saveManifest(project.id, project);
    let result = await uploadSceneImage(project.id, 1, { buffer: Buffer.from('image fixture'), originalname: 'My photo.jpg' });
    const imageId = result.uploadedMedia[0].id, imageUrl = result.scenes[0].assetUrl;
    assert.ok(result.scenes.every(scene => scene.referenceMatches.some(item => item.id === imageId && item.type === 'image')));
    result = await uploadSceneVideo(project.id, 1, { buffer: Buffer.from('clip fixture'), originalname: 'My clip.mov' });
    const clipId = result.uploadedMedia[1].id, clipUrl = result.scenes[0].assetUrl;
    assert.equal(result.scenes[0].referenceMatches[0].type, 'video');
    result = loadManifest(project.id);
    assert.equal(result.scenes[1].referenceMatches.filter(item => item.source === 'upload').length, 2);
    result = await selectReferenceMatch(project.id, 2, imageId);
    assert.equal(result.scenes[1].assetUrl, imageUrl);
    result = await selectReferenceMatch(project.id, 2, clipId);
    assert.equal(result.scenes[1].assetUrl, clipUrl);
    assert.equal(result.scenes[1].type, 'video');
    assert.equal(result.scenes[1].source, 'custom_video');
    assert.equal(result.scenes[1].mediaOffsetSec, 0);
    result = await selectReferenceMatch(project.id, 3, clipId);
    assert.equal(result.scenes[2].type, 'quote');
    assert.equal(result.scenes[2].quoteText, 'Keep this quote');
    assert.equal(result.artifacts.needsRegeneration, true);
    assert.equal(loadManifest(project.id).scenes[0].referenceMatches.filter(item => item.id === clipId).length, 1);
  } finally { apiConfig.jobsDir = previous; fs.rmSync(root, { recursive: true, force: true }); }
});
