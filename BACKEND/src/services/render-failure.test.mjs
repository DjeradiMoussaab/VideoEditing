import test from 'node:test';
import assert from 'node:assert/strict';
import { makeClipsStep } from '../steps/03-make-clips.mjs';

function fixture(execAsync) {
    return {
        plan: { scenes: [1, 2, 3].map(scene_id => ({ scene_id, duration_sec: 2 })) },
        config: { video: { width: 160, height: 90, fps: 10, clipRenderConcurrency: 2, clipCacheEnabled: false } },
        runOptions: {}, sceneVisualChoices: {},
        sceneVisuals: Object.fromEntries([1, 2, 3].map(id => [id, { type: 'video', path: `input-${id}` }])),
        paths: { sceneClip: id => `clip-${id}.mp4` },
        fs: { exists: file => file.startsWith('input-') }, ffmpeg: { execAsync }
    };
}

test('missing scene media fails preflight before any render starts', async () => {
    const commands = [];
    const ctx = fixture(async command => commands.push(command));
    ctx.sceneVisuals[2].path = null;
    await assert.rejects(makeClipsStep(ctx), /Scene 2 is missing its video source/);
    assert.deepEqual(commands, []);
});

test('render failure drains in-flight workers without overwriting failure with progress', async () => {
    const commands = [], progress = [];
    let finishSecond;
    const ctx = fixture(command => {
        commands.push(command);
        if (command.includes('input-1')) return Promise.reject(new Error('decoder failed'));
        return new Promise(resolve => { finishSecond = resolve; });
    });
    ctx.onSceneClipReady = info => progress.push(info.sceneId);
    let settled = false;
    const render = makeClipsStep(ctx).finally(() => { settled = true; });
    const rejected = assert.rejects(render, /Scene 1 could not render: decoder failed/);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(settled, false, 'wait for active work before reporting failure');
    finishSecond();
    await rejected;
    assert.equal(commands.length, 2, 'do not schedule scene 3 after failure');
    assert.deepEqual(progress, [], 'no progress may overwrite the error');
});
