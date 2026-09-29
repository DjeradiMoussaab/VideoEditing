import test from 'node:test';
import assert from 'node:assert/strict';
import { decideQuoteStyles } from './quote-style-decision.service.mjs';

function fakeOpenAI(content) {
    return { chat: { completions: { create: async () => ({ choices: [{ message: { content } }] }) } } };
}

test('returns empty map with no scenes, no openai, or no model', async () => {
    assert.deepEqual(await decideQuoteStyles({ openai: fakeOpenAI('[]'), model: 'x', quoteScenes: [] }), {});
    assert.deepEqual(await decideQuoteStyles({ openai: null, model: 'x', quoteScenes: [{ scene_id: 1 }] }), {});
    assert.deepEqual(await decideQuoteStyles({ openai: fakeOpenAI('[]'), model: null, quoteScenes: [{ scene_id: 1 }] }), {});
});

test('parses a valid response into a scene_id -> style map', async () => {
    const response = JSON.stringify([
        { scene_id: 1, quote_style_id: 'typography_split' },
        { scene_id: 2, quote_style_id: 'archive' }
    ]);
    const result = await decideQuoteStyles({
        openai: fakeOpenAI(response), model: 'gpt-6-luna',
        quoteScenes: [{ scene_id: 1, narration: 'a', quote_text: 'a', hasReferenceBackground: true },
            { scene_id: 2, narration: 'b', quote_text: 'b', hasReferenceBackground: false }]
    });
    assert.deepEqual(result, { '1': 'typography_split', '2': 'archive' });
});

test('falls back to an empty map on an invalid style id or malformed response', async () => {
    assert.deepEqual(await decideQuoteStyles({
        openai: fakeOpenAI(JSON.stringify([{ scene_id: 1, quote_style_id: 'not_a_real_style' }])),
        model: 'x', quoteScenes: [{ scene_id: 1 }]
    }), {});
    assert.deepEqual(await decideQuoteStyles({
        openai: fakeOpenAI('not json'), model: 'x', quoteScenes: [{ scene_id: 1 }]
    }), {});
});

test('keeps valid entries and drops only the invalid one from a mixed response', async () => {
    const response = JSON.stringify([
        { scene_id: 1, quote_style_id: 'classic' },
        { scene_id: 2, quote_style_id: 'not_a_real_style' }
    ]);
    const result = await decideQuoteStyles({
        openai: fakeOpenAI(response), model: 'x',
        quoteScenes: [{ scene_id: 1 }, { scene_id: 2 }]
    });
    assert.deepEqual(result, { '1': 'classic' });
});
