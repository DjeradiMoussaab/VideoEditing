import test from 'node:test';
import assert from 'node:assert/strict';
import { createDraftCheckpoint } from './draft-checkpoint.service.mjs';

test('resume loads completed work after a process restart and retries only the failed unit', async () => {
    let disk, calls = 0;
    const first = {};
    const task = createDraftCheckpoint(first, () => { disk = JSON.stringify(first); });
    await task.run('scene:1', async () => { calls++; return { path: 'one' }; });
    await assert.rejects(task.run('scene:2', async () => { throw new Error('interrupted'); }));
    const restored = JSON.parse(disk);
    const resumed = createDraftCheckpoint(restored, () => {});
    assert.deepEqual(await resumed.run('scene:1', async () => { calls++; }), { path: 'one' });
    await resumed.run('scene:2', async () => { calls++; return { path: 'two' }; });
    assert.equal(calls, 2);
    assert.equal(restored.draftCheckpoint.activeTask, null);
});

test('missing media invalidates only that completed unit and returned values cannot mutate checkpoints', async () => {
    const manifest = {};
    const task = createDraftCheckpoint(manifest, () => {});
    const first = await task.run('asset', async () => ({ path: 'old' }));
    first.path = 'changed';
    assert.equal((await task.run('asset', () => { throw new Error('should skip'); })).path, 'old');
    assert.equal((await task.run('asset', async () => ({ path: 'new' }), () => false)).path, 'new');
});
