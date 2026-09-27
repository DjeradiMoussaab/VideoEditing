import test from 'node:test';
import assert from 'node:assert/strict';
import { preservedManualScenes, reviewTimeline } from './editorial-review.service.mjs';
test('preserves explicit media only for the same narrative beat and existing file', () => {
    const scene = { scene_id: 1, start_sec: 0, end_sec: 5, narration: 'A memory', assetPath: '/a.jpg', manualMediaSelection: true };
    assert.equal(preservedManualScenes([scene], [{ ...scene, scene_id: 3 }])[3], scene);
    assert.deepEqual(preservedManualScenes([scene], [{ ...scene, narration: 'A different event' }]), {});
    assert.deepEqual(preservedManualScenes([scene], [scene], () => false), {});
    assert.deepEqual(preservedManualScenes([{ ...scene, manualMediaSelection: false }], [scene]), {});
});
test('local review flags extended repetition and fallbacks without altering choices', () => {
    const scenes = Array.from({ length: 4 }, (_, i) => ({ scene_id: i + 1, assetPath: '/a.jpg', source: 'reference' }));
    const before = structuredClone(scenes);
    assert.equal(reviewTimeline(scenes)[0].scene_id, 4);
    assert.deepEqual(scenes, before);
    assert.equal(reviewTimeline([{ source: 'stock_fallback', scene_id: 5 }])[0].notes.length, 1);
});
