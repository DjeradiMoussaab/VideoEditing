import test from 'node:test';
import assert from 'node:assert/strict';
import { selectQuoteScenes } from './quote-timeline-refiner.service.mjs';

function timelineOf(n) {
    return Array.from({ length: n }, (_, i) => ({
        start_sec: i * 5,
        end_sec: (i + 1) * 5,
        duration_sec: 5,
        narration: `Scene number ${i + 1} narration text goes here for testing purposes.`
    }));
}

test('picks roughly 10-20% of scenes as quotes, highest-scoring first', () => {
    const timeline = timelineOf(20);
    // Every scene scores well above the eligibility bar, so the quota (not the bar)
    // decides how many become quotes.
    const scored = timeline.map((_, i) => ({
        scene_id: i + 1,
        quote_score: (i + 1) / 20, // scene 20 scores highest, scene 1 lowest
        quote_text: `This is a fully quotable line for scene ${i + 1} right here.`
    }));

    const result = selectQuoteScenes(scored, timeline);
    const quoteScenes = result.filter((s) => s.scene_type === 'quote');

    assert.ok(quoteScenes.length >= 2, `expected at least 10% of 20 scenes, got ${quoteScenes.length}`);
    assert.ok(quoteScenes.length <= 4, `expected at most 20% of 20 scenes, got ${quoteScenes.length}`);
    // Highest-scoring scenes (20, 19, 18) must be the ones chosen.
    const chosenIds = quoteScenes.map((s) => s.scene_id).sort((a, b) => a - b);
    assert.deepEqual(chosenIds, Array.from({ length: quoteScenes.length }, (_, i) => 20 - quoteScenes.length + 1 + i));
});

test('never forces a quote scene below the score/word-count eligibility bar', () => {
    const timeline = timelineOf(10);
    // Only one scene is genuinely quote-worthy; the rest score low.
    const scored = timeline.map((_, i) => ({
        scene_id: i + 1,
        quote_score: i === 3 ? 0.9 : 0.1,
        quote_text: i === 3 ? 'This line is genuinely worth quoting on its own.' : null
    }));

    const result = selectQuoteScenes(scored, timeline);
    const quoteScenes = result.filter((s) => s.scene_type === 'quote');
    assert.equal(quoteScenes.length, 1);
    assert.equal(quoteScenes[0].scene_id, 4);
});

test('rejects a high-scoring quote whose text is too short to read alone', () => {
    const timeline = timelineOf(10);
    const scored = timeline.map((_, i) => ({
        scene_id: i + 1,
        quote_score: 0.9,
        quote_text: 'Too short'
    }));

    const result = selectQuoteScenes(scored, timeline);
    assert.equal(result.filter((s) => s.scene_type === 'quote').length, 0);
});

test('preserves scene count, timing and narration exactly', () => {
    const timeline = timelineOf(6);
    const scored = [{ scene_id: 2, quote_score: 0.8, quote_text: 'A perfectly quotable sentence right here.' }];
    const result = selectQuoteScenes(scored, timeline);
    assert.equal(result.length, 6);
    result.forEach((s, i) => {
        assert.equal(s.start_sec, timeline[i].start_sec);
        assert.equal(s.end_sec, timeline[i].end_sec);
        assert.equal(s.narration, timeline[i].narration);
    });
});
