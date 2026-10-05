import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { relocateProjectPaths } from './project-paths.service.mjs';
import { apiConfig } from '../config/api.config.mjs';
import { createManifest, ensureJobDirs, loadManifest, saveManifest } from './job-store.service.mjs';
import { selectReferenceMatch } from './pipeline-backend.service.mjs';

test('relocation handles nested paths, cache keys and Windows paths without changing unrelated text', () => {
  const base = '/destination/jobs/job-1';
  const old = 'C:\\Users\\Friend\\video editor\\BACKEND\\out\\jobs\\job-1\\';
  const manifest = {
    inputs: { voiceover: old + 'input\\voiceover.mp3' },
    referenceCaptionIndex: { [old + 'input\\references\\photo.jpg']: { caption: 'Keep this caption' } },
    draftCheckpoint: { tasks: { asset: { value: { path: old + 'custom\\clip.mp4' } } } },
    remote: 'https://example.com/job-1/input/clip.mp4',
    unrelated: '/other/jobs/job-2/input/voiceover.mp3',
    unsafe: '/source/job-1/input/../../outside.mp3',
    narration: 'A story mentions /source/job-1/input/photo.jpg',
    brokenUrl: '/api/media/job-1/../../../../old/jobs/job-1/input/photo.jpg'
  };
  const fixed = relocateProjectPaths(manifest, 'job-1', base);
  assert.equal(fixed.inputs.voiceover, base + '/input/voiceover.mp3');
  assert.equal(fixed.referenceCaptionIndex[base + '/input/references/photo.jpg'].caption, 'Keep this caption');
  assert.equal(fixed.draftCheckpoint.tasks.asset.value.path, base + '/custom/clip.mp4');
  for (const key of ['remote', 'unrelated', 'unsafe', 'narration']) assert.equal(fixed[key], manifest[key]);
  assert.equal(fixed.brokenUrl, '/api/media/job-1/input/photo.jpg');
  assert.deepEqual(relocateProjectPaths(fixed, 'job-1', base), fixed);
});

test('a moved project resolves audio, references, uploads and artifacts on load and selection', async () => {
  const previous = apiConfig.jobsDir;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'transferred project '));
  apiConfig.jobsDir = path.join(root, 'destination');
  try {
    const id = 'moved-project';
    const project = createManifest(id);
    const source = path.join(root, 'original', id);
    const destination = ensureJobDirs(id).jobDir;
    const files = ['input/voiceover.mp3', 'input/references/photo.jpg', 'input/reference-clips/clip.mp4', 'custom/upload.png', 'out/thumb.jpg', 'versions/version-1/final.mp4'];
    for (const directory of [source, destination]) for (const relative of files) {
      const file = path.join(directory, relative);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, 'fixture');
    }
    const old = relative => path.join(source, relative);
    project.inputs = { voiceover: old(files[0]), references: [old(files[1])], referenceClips: [old(files[2])] };
    project.referenceCaptionIndex = { [old(files[1])]: { caption: 'A photo', tags: [] } };
    project.referenceClipIndex = { [old(files[2])]: { status: 'ready', duration: 3, thumbnailPath: old(files[4]) } };
    project.uploadedMedia = [{ id: 'upload_1', path: old(files[3]), type: 'image', filename: 'upload.png' }];
    project.scenes = [{ scene_id: 1, type: 'image', duration_sec: 4, start_sec: 0, end_sec: 4, assetPath: old(files[1]), assetUrl: `/api/media/${id}/${files[1]}` }];
    project.plan = { scenes: structuredClone(project.scenes) };
    project.artifacts = { finalMp4: old(files[5]), finalUrl: `/api/media/${id}/${files[5]}` };
    saveManifest(id, project);
    let loaded = loadManifest(id);
    assert.equal(loaded.inputs.voiceover, path.join(destination, files[0]));
    assert.equal(loaded.voiceoverUrl, `/api/media/${id}/${files[0]}`);
    assert.equal(loaded.scenes[0].assetPath, path.join(destination, files[1]));
    assert.equal(loaded.referenceClipIndex[path.join(destination, files[2])].thumbnailPath, path.join(destination, files[4]));
    assert.equal(loaded.artifacts.finalMp4, path.join(destination, files[5]));
    for (const [matchId, relative] of [['ref_1', files[1]], ['clip_1', files[2]], ['upload_1', files[3]]]) {
      loaded = await selectReferenceMatch(id, 1, matchId);
      assert.equal(loaded.scenes[0].assetPath, path.join(destination, relative));
    }
    assert.equal(loadManifest(id).scenes[0].source, 'custom_image');
    // An incomplete transfer must not silently use the old computer's copy,
    // even when that location still happens to exist locally.
    fs.unlinkSync(path.join(destination, files[0]));
    fs.unlinkSync(path.join(destination, files[1]));
    assert.equal(loadManifest(id).voiceoverUrl, null);
    await assert.rejects(selectReferenceMatch(id, 1, 'ref_1'), /copy the complete BACKEND\/out\/jobs\/moved-project/);
  } finally {
    apiConfig.jobsDir = previous;
    fs.rmSync(root, { recursive: true, force: true });
  }
});
