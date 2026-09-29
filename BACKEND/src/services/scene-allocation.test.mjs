import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSceneAllocation } from './scene-allocation.service.mjs';
const config = { visual: { sceneDurationSec: { image: { min: 4, max: 6 }, video: { min: 2, max: 10 } } } };
const scenes = Array.from({ length: 10 }, (_, i) => ({ scene_id: i + 1, duration_sec: 5 }));
const image = { id: 'ref_1', path: '/photo.jpg' };
const clip = { id: 'clip_1', type: 'video', path: '/video.mp4', duration: 8, usableStartSec: 1, usableEndSec: 8, status: 'ready' };
function allocate(catalog, scores, extra = {}) {
    return buildSceneAllocation({ scenes, config, referenceCatalog: catalog,
        referencePlan: Object.fromEntries(scenes.map((scene, i) => [scene.scene_id, { matches: catalog.map(ref => ({ ...ref, score: scores(ref, i) })) }])),
        draftOptions: { maxImages: 0, maxReferenceReuse: 1 }, initialChoices: { 10: 'quote' }, ...extra });
}
test('uses references throughout the story despite legacy quotas, and gives quote scenes a matching background without changing their type', () => {
    const result = allocate([image, clip], (ref, i) => ref.id === image.id ? .7 : (i === 4 ? .97 : .1));
    // Scene 10 (quote) now competes for the image reference like any other scene and
    // wins it, on top of the 5 non-quote scenes from before.
    assert.equal(result.stats.referenceScenesUsed, 6);
    assert.equal(result.sceneAssetPaths[5], clip.path);
    assert.equal(result.sceneMediaOffsets[5], 1);
    assert.equal(result.sceneChoices[10], 'quote');
    assert.equal(result.sceneAssetPaths[10], image.path);
    assert.equal(result.sceneSourceMap[10], 'quote_reference');
});
test('rejects failed, short, out-of-range and weak clips; respects validated excerpt and transition padding', () => {
    for (const ref of [{ ...clip, status: 'failed' }, { ...clip, duration: 2, usableEndSec: 2 }, { ...clip, startSec: -1 }, { ...clip, startSec: 4 }]) {
        assert.equal(Object.keys(allocate([ref], () => .9).sceneAssetPaths).length, 0);
    }
    assert.equal(Object.keys(allocate([clip], () => .5).sceneAssetPaths).length, 0);
    assert.equal(allocate([{ ...clip, startSec: 2 }], () => .9).sceneMediaOffsets[1], 2);
    const padded = { ...config, video: { transitionDuration: 2 } };
    const paddedResult = allocate([{ ...clip, startSec: 2 }], () => .9, { config: padded }).sceneAssetPaths;
    // Scenes 1-9 need padding room for a following transition and correctly reject the
    // clip; scene 10 (quote, and last in the timeline) has no following transition to
    // pad for, so it legitimately gets the clip as its background.
    assert.deepEqual(Object.keys(paddedResult), ['10']);
});
test('forbids adjacent reuse but allows unlimited nonconsecutive reuse deterministically', () => {
    const run = () => allocate([image], () => .65);
    assert.equal(run().stats.finalImageCount, 5);
    assert.deepEqual(run(), run());
    assert.equal(Object.keys(allocate([], () => 0).sceneAssetPaths).length, 0);
});
test('prefers variety between equally relevant references without forcing weak matches', () => {
    const second = { ...image, id: 'ref_2', path: '/second.jpg' };
    const result = allocate([image, second], () => .8);
    assert.notEqual(result.sceneAssetPaths[1], result.sceneAssetPaths[2]);
    assert.equal(allocate([image, second], ref => ref.id === image.id ? .9 : .2).stats.finalImageCount, 5);
});
