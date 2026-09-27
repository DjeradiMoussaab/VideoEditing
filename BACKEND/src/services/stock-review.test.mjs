import test from 'node:test';
import assert from 'node:assert/strict';
import { reviewStockCandidates } from './stock-review.service.mjs';
const entries = Array.from({ length: 17 }, (_, i) => ({ scene: { scene_id: i + 1, narration: 'She waits for news.', duration_sec: 5 }, query: 'rain window',
    suggestions: Array.from({ length: 24 }, (_, j) => ({ id: String(j), duration: 8, reviewFrames: ['https://example.com/a.jpg', 'https://example.com/b.jpg', 'https://example.com/c.jpg'] })) }));
test('stock review has bounded calls/frames and cached runs cost zero; edits invalidate only affected scenes', async () => {
    let calls = 0;
    const openai = { chat: { completions: { create: async (request, options) => {
        calls++;
        assert.equal(options.maxRetries, 0);
        assert.equal(request.max_completion_tokens, 1600);
        const content = request.messages[0].content;
        assert.ok(content.filter(part => part.type === 'image_url').length <= 32);
        assert.ok(content.filter(part => part.type === 'image_url').every(part => part.image_url.detail === 'low'));
        const scenes = content.filter(part => part.type === 'text' && part.text.startsWith('{')).map(part => JSON.parse(part.text));
        return { usage: { prompt_tokens: 100, completion_tokens: 30 }, choices: [{ message: { content: JSON.stringify({ selections: scenes.map(scene => ({ scene_id: scene.scene_id, selectedId: '1', approvedIds: ['1', '0', 'invented'], reason: 'Anonymous setting supports waiting.' })) }) } }] };
    } } } };
    const first = await reviewStockCandidates({ openai, model: 'test', entries });
    assert.equal(calls, 3);
    assert.equal(first.stats.frames, 17 * 4);
    assert.equal(first.selections[1].selectedId, '1');
    assert.deepEqual(first.selections[1].approvedIds, ['1', '0']);
    assert.equal(first.stats.promptTokens, 300);
    const second = await reviewStockCandidates({ openai, model: 'test', entries, cacheIndex: first.index });
    assert.equal(calls, 3); assert.equal(second.stats.cached, 17);
    const changed = structuredClone(entries); changed[0].scene.narration = 'He left home.';
    await reviewStockCandidates({ openai, model: 'test', entries: changed, cacheIndex: first.index });
    assert.equal(calls, 4);
});
test('invalid candidate IDs and API failures never approve unreviewed footage or poison the cache', async () => {
    for (const create of [async () => { throw new Error('offline'); }, async () => ({ choices: [{ message: { content: '{"selections":[{"scene_id":1,"selectedId":"invented"}]}' } }] })]) {
        const result = await reviewStockCandidates({ openai: { chat: { completions: { create } } }, model: 'test', entries: entries.slice(0, 1) });
        assert.equal(result.selections[1].selectedId, null);
        assert.deepEqual(result.index, {});
    }
    const empty = await reviewStockCandidates({ entries: [] });
    assert.equal(empty.stats.calls, 0);
});
