import test from 'node:test';
import assert from 'node:assert/strict';
import { decideImageAnimationStyles } from './image-style-decision.service.mjs';

const profiles = {
    fullscreen_zoom_in: { sceneFit: 'neutral' },
    documentary_echo: { sceneFit: 'vintage' }
};

function fakeOpenAI(content) {
    return { chat: { completions: { create: async () => ({ choices: [{ message: { content } }] }) } } };
}

test('returns empty map with no scenes, no profiles, no openai, or no model', async () => {
    assert.deepEqual(await decideImageAnimationStyles({ openai: fakeOpenAI('[]'), model: 'x', imageScenes: [], profiles }), {});
    assert.deepEqual(await decideImageAnimationStyles({ openai: fakeOpenAI('[]'), model: 'x', imageScenes: [{ scene_id: 1 }], profiles: {} }), {});
    assert.deepEqual(await decideImageAnimationStyles({ openai: null, model: 'x', imageScenes: [{ scene_id: 1 }], profiles }), {});
});

test('parses a valid response into a scene_id -> style map', async () => {
    const response = JSON.stringify([
        { scene_id: 1, style_id: 'documentary_echo' },
        { scene_id: 2, style_id: 'fullscreen_zoom_in' }
    ]);
    const result = await decideImageAnimationStyles({
        openai: fakeOpenAI(response), model: 'gpt-6-luna',
        imageScenes: [{ scene_id: 1, narration: 'a' }, { scene_id: 2, narration: 'b' }],
        profiles
    });
    assert.deepEqual(result, { '1': 'documentary_echo', '2': 'fullscreen_zoom_in' });
});

test('drops only entries with an unknown style id, keeps the rest', async () => {
    const response = JSON.stringify([
        { scene_id: 1, style_id: 'fullscreen_zoom_in' },
        { scene_id: 2, style_id: 'not_a_real_profile' }
    ]);
    const result = await decideImageAnimationStyles({
        openai: fakeOpenAI(response), model: 'x',
        imageScenes: [{ scene_id: 1 }, { scene_id: 2 }], profiles
    });
    assert.deepEqual(result, { '1': 'fullscreen_zoom_in' });
});
