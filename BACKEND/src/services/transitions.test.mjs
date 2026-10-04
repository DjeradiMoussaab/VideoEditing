import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync, execFileSync } from 'node:child_process';
import { TRANSITIONS, boundaryTransition, normalizeTransitions, transitionPadding } from '../../../SHARED/transitions.mjs';
import { buildXfadeGraph, concatVisualsStep } from '../steps/04-concat-visuals.mjs';
import { makeClipsStep } from '../steps/03-make-clips.mjs';
import { apiConfig } from '../config/api.config.mjs';
import { createManifest, ensureJobDirs, saveManifest, loadManifest } from './job-store.service.mjs';
import { updateSceneTransition, adjustSceneBoundary, splitScene, deleteScene } from './pipeline-backend.service.mjs';

function scenesFixture() {
  return Array.from({ length: 3 }, (_, i) => ({ scene_id: i + 1, start_sec: i * 4, end_sec: (i + 1) * 4, duration_sec: 4, type: 'image' }));
}

test('limits include both neighbours; defaults, short scenes and final border are safe', () => {
  const scenes = scenesFixture();
  scenes[0].transition = { type: 'wipeleft', duration_sec: 8 };
  scenes[1].duration_sec = 1.25;
  assert.deepEqual(boundaryTransition(scenes, 0), { type: 'wipeleft', duration_sec: 1.25 });
  scenes[0].transition.duration_sec = 0.1;
  assert.equal(boundaryTransition(scenes, 0).duration_sec, 0.5);
  assert.equal(boundaryTransition(scenes, 1).duration_sec, 0.8);
  assert.equal(boundaryTransition(scenes, -1), null);
  assert.equal(boundaryTransition(scenes, 2), null);
  scenes[1].duration_sec = 0.3;
  assert.equal(boundaryTransition(scenes, 0), null);
});

test('transition edits persist, reject invalid/stale input and follow resize/split/delete', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'transitions-save-'));
  const previous = apiConfig.jobsDir;
  apiConfig.jobsDir = root;
  try {
    const manifest = createManifest('transitions');
    manifest.status = 'DRAFT_READY';
    manifest.scenes = scenesFixture();
    manifest.plan = { scenes: structuredClone(manifest.scenes) };
    manifest.sceneChoices = { 1: 'image', 2: 'image', 3: 'image' };
    saveManifest(manifest.id, manifest);
    const dirs = ensureJobDirs(manifest.id);
    fs.mkdirSync(path.join(dirs.outDir, 'clips'));
    for (let i = 1; i <= 3; i++) fs.writeFileSync(path.join(dirs.outDir, 'clips', `scene_0${i}.mp4`), 'old');
    let project = updateSceneTransition(manifest.id, 1, { type: 'circleopen', duration_sec: 2 }, manifest.updatedAt);
    assert.deepEqual(loadManifest(manifest.id).scenes[0].transition, { type: 'circleopen', duration_sec: 2 });
    assert.deepEqual(project.plan.scenes[0].transition, project.scenes[0].transition);
    assert.equal(project.artifacts.needsRegeneration, true);
    assert.equal(fs.existsSync(path.join(dirs.outDir, 'clips', 'scene_01.mp4')), false);
    assert.equal(fs.existsSync(path.join(dirs.outDir, 'clips', 'scene_02.mp4')), false);
    for (const transition of [{ type: 'bad', duration_sec: 1 }, { type: 'fade', duration_sec: 0.4 }, { type: 'fade', duration_sec: 2.01 }, { type: 'fade', duration_sec: NaN }]) {
      assert.throws(() => updateSceneTransition(manifest.id, 1, transition, project.updatedAt), { statusCode: 400 });
    }
    assert.throws(() => updateSceneTransition(manifest.id, 3, { type: 'fade', duration_sec: 1 }, project.updatedAt), { statusCode: 400 });
    assert.throws(() => updateSceneTransition(manifest.id, 1, { type: 'fade', duration_sec: 1 }, 'old'), { statusCode: 409 });
    project = await adjustSceneBoundary(manifest.id, 1, -3);
    assert.equal(project.scenes[0].end_sec, 1);
    assert.equal(project.scenes[0].transition.duration_sec, 1);
    assert.deepEqual(project.scenes[0].transition, project.plan.scenes[0].transition);
    project = updateSceneTransition(manifest.id, 2, { type: 'wipeleft', duration_sec: 2 }, project.updatedAt);
    project = splitScene(manifest.id, 2, 4, project.updatedAt).project;
    assert.equal(project.scenes[1].transition.type, 'fade');
    assert.equal(project.scenes[2].transition.type, 'wipeleft');
    project = deleteScene(manifest.id, 4, project.updatedAt).project;
    assert.equal(project.scenes.at(-1).transition, undefined);
    project.status = 'FINAL_RUNNING'; saveManifest(manifest.id, project);
    assert.throws(() => updateSceneTransition(manifest.id, 1, { type: 'fade', duration_sec: 1 }, project.updatedAt), { statusCode: 409 });
  } finally { apiConfig.jobsDir = previous; fs.rmSync(root, { recursive: true, force: true }); }
});

test('centered overlaps preserve scene borders and total timeline duration across chunks', () => {
  const scenes = normalizeTransitions(scenesFixture());
  scenes[0].transition.duration_sec = 2;
  scenes[1].transition = { type: 'wipeleft', duration_sec: 0.5 };
  const durations = scenes.map((scene, i) => {
    const { leading, trailing } = transitionPadding(scenes, i);
    return scene.duration_sec + leading + trailing;
  });
  const graph = buildXfadeGraph({ durations, ctx: { plan: { scenes } }, boundaryIndices: [0, 1, 2] });
  assert.equal(graph.compositeDuration, 12);
  assert.match(graph.filterComplex, /duration=2:offset=3/);
  assert.match(graph.filterComplex, /duration=0.5:offset=7.75/);
  const chunk = buildXfadeGraph({ durations: [8.25, 4.25], ctx: { plan: { scenes } }, boundaryIndices: [0, 2] });
  assert.match(chunk.filterComplex, /transition=wipeleft:duration=0.5:offset=7.75/);
  assert.equal(chunk.compositeDuration, 12);
});

test('real clip rendering and two-stage concatenation honour per-border durations and timeline length', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'transitions-render-'));
  try {
    const source = path.join(root, 'source.mp4');
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=96x64:rate=20:duration=2', '-c:v', 'libx264', source]);
    const scenes = Array.from({ length: 9 }, (_, i) => ({ scene_id: i + 1, duration_sec: 2.037,
      transition: { type: i === 7 ? 'wipeleft' : 'fade', duration_sec: i % 2 ? 0.5 : 2 } }));
    const filters = [];
    const duration = file => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file], { encoding: 'utf8' }).trim());
    const ctx = { config: { video: { width: 96, height: 64, fps: 20, codec: 'libx264', pixFmt: 'yuv420p', encodePreset: 'ultrafast', concatChunkSize: 8, clipRenderConcurrency: 1, clipCacheEnabled: false } },
      runOptions: {}, plan: { scenes }, sceneVisualChoices: {},
      sceneVisuals: Object.fromEntries(scenes.map(scene => [scene.scene_id, { type: 'video', path: source }])),
      fs: { exists: fs.existsSync, writeText: (file, text) => { filters.push(text); fs.writeFileSync(file, text); } },
      paths: { outDir: root, visualsMp4: path.join(root, 'visuals.mp4'), sceneClip: id => path.join(root, `scene-${id}.mp4`) },
      ffmpeg: { exec: command => execSync(command, { stdio: 'pipe' }), execAsync: async command => execSync(command, { stdio: 'pipe' }), getVideoDurationSeconds: duration }
    };
    await makeClipsStep(ctx);
    await concatVisualsStep(ctx);
    assert.match(filters.at(-1), /transition=wipeleft:duration=0.5/);
    assert.ok(Math.abs(duration(ctx.paths.visualsMp4) - 9 * 2.037) < 0.11, `Rendered duration: ${duration(ctx.paths.visualsMp4)}`);
    execFileSync('ffmpeg', ['-v', 'error', '-i', ctx.paths.visualsMp4, '-f', 'null', '-'], { stdio: 'pipe' });
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('all eight effects have playable export-engine previews and retain their saved type', () => {
  assert.equal(TRANSITIONS.length, 8);
  assert.equal(new Set(TRANSITIONS.map(effect => effect.id)).size, 8);
  for (const effect of TRANSITIONS) {
    const scenes = scenesFixture();
    scenes[0].transition = { type: effect.id, duration_sec: 0.8 };
    assert.equal(boundaryTransition(scenes, 0).type, effect.id);
    const preview = new URL(`../../../FRONTEND/public/transitions/${effect.id}.mp4`, import.meta.url);
    const info = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=codec_name,width,height', '-of', 'json', preview.pathname], { encoding: 'utf8' }));
    assert.equal(info.streams[0].codec_name, 'h264');
    assert.equal(info.streams[0].width, 640);
    assert.ok(Math.abs(Number(info.format.duration) - 2.5) < .05);
  }
});
