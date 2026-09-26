import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSceneAllocation } from './scene-allocation.service.mjs';

const config = { visual: { sceneDurationSec: { image: { min: 4, max: 6 }, video: { min: 2, max: 10 } } } };
const scenes = Array.from({ length: 10 }, (_, i) => ({ scene_id: i + 1, duration_sec: 5 }));
const image = { id: 'ref_1', path: '/photo.jpg' };
const clip = { id: 'clip_1', type: 'video', path: '/video.mp4', duration: 8, usableStartSec: 1, usableEndSec: 8, status: 'ready' };
function allocate(catalog, scores, options = {}) {
    return buildSceneAllocation({ scenes, config, referenceCatalog: catalog,
        referencePlan: Object.fromEntries(scenes.map((scene, i) => [scene.scene_id, { matches: catalog.map(ref => ({ ...ref, score: scores(ref, i) })) }])),
        draftOptions: { maxImages: 10, maxReferenceReuse: 1, ...options }, initialChoices: { 10: 'quote' } });
}

test('reserves references for their strongest matches across the timeline and preserves quotes', () => {
    const result = allocate([image, clip], (ref, i) => ref.id === image.id ? (i === 7 ? .98 : .6) : (i === 4 ? .97 : .1));
    assert.equal(result.sceneAssetPaths[8], image.path);
    assert.equal(result.sceneAssetPaths[5], clip.path);
    assert.equal(result.sceneMediaOffsets[5], 1);
    assert.equal(result.sceneSourceMap[5], 'reference_clip');
    assert.equal(result.sceneChoices[10], 'quote');
    assert.equal(result.sceneSourceMap[1], 'stock');
});

test('allows short clips to loop, rejects failed and weak clips, and respects the image cap', () => {
    const short = { ...clip, id: 'short', duration: 2, usableEndSec: 2 };
    const failed = { ...clip, id: 'failed', status: 'failed' };
    const result = allocate([image, clip, short, failed], ref => ref.id === 'short' ? .95 : .9, { maxImages: 0 });
    assert.equal(Object.values(result.sceneSourceMap).filter(source => source === 'reference_clip').length, 2);
    assert.equal(Object.values(result.sceneChoices).includes('image'), false);
    assert.ok(Object.values(result.sceneAssetPaths).every(file => file === clip.path));
    assert.equal(Object.keys(allocate([clip], () => .5).sceneAssetPaths).length, 0);
});

test('spreads moderate image matches, respects reuse gaps and produces deterministic allocations', () => {
    const run = () => allocate([image], () => .65, { maxReferenceReuse: 10 });
    const result = run();
    const ids = Object.keys(result.sceneAssetPaths).map(Number).sort((a,b) => a-b);
    assert.ok(ids.length > 1 && ids.length < 9);
    assert.ok(ids.every((id, i) => i === 0 || id - ids[i - 1] >= 3));
    assert.deepEqual(result, run());
    assert.equal(Object.keys(allocate([], () => 0).sceneAssetPaths).length, 0);
});
