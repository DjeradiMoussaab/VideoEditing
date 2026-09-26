import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { apiConfig } from '../config/api.config.mjs';
import { createManifest, ensureJobDirs, saveManifest, loadManifest } from './job-store.service.mjs';
import { selectReferenceMatch, setSceneType } from './pipeline-backend.service.mjs';

test('all scene types expose all references and can select one without changing timing', async () => {
    const original = apiConfig.jobsDir;
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'reference-suggestions-'));
    apiConfig.jobsDir = temporary;
    try {
        const manifest = createManifest('suggestions');
        const paths = ensureJobDirs(manifest.id);
        manifest.inputs.references = Array.from({ length: 12 }, (_, index) => {
            const file = path.join(paths.inputDir, `photo-${index}.jpg`);
            fs.writeFileSync(file, 'fixture');
            manifest.referenceCaptionIndex[file] = { caption: 'family at home', tags: ['family'] };
            return file;
        });
        manifest.scenes = ['image', 'video', 'quote'].map((type, index) => ({
            scene_id: index + 1, type, narration: 'family at home', duration_sec: 5,
            start_sec: index * 5, end_sec: index * 5 + 5,
            technical: { topMatches: [{ id: 'ref_1', score: .99, filename: 'photo-0.jpg', url: '/old' }] }
        }));
        saveManifest(manifest.id, manifest);
        const edited = await setSceneType(manifest.id, 3, { quoteText: 'A memorable quote', quoteAuthor: 'Author details' });
        assert.equal(edited.scenes[2].quoteAuthor, 'Author details');
        const cleared = await setSceneType(manifest.id, 3, { quoteText: '', quoteAuthor: '' });
        assert.equal(cleared.scenes[2].quoteText, '', 'cleared quote must not fall back to narration');
        assert.equal(loadManifest(manifest.id).scenes[2].quoteAuthor, '');
        const loaded = loadManifest(manifest.id);
        for (const scene of loaded.scenes) {
            assert.equal(scene.referenceMatches.length, 12);
            assert.equal(scene.referenceMatches.find(match => match.id === 'ref_1').score, .99);
            assert.ok(scene.referenceMatches.every((match, index, matches) => index === 0 || matches[index - 1].score >= match.score));
            assert.equal(scene.technical, undefined);
            const selected = await selectReferenceMatch(manifest.id, scene.scene_id, 'ref_12');
            const updated = selected.scenes.find(item => item.scene_id === scene.scene_id);
            assert.equal(updated.type, 'image');
            assert.equal(updated.assetPath, manifest.inputs.references[11]);
            assert.equal(updated.duration_sec, 5);
            assert.equal(updated.start_sec, scene.start_sec);
            assert.equal(updated.end_sec, scene.end_sec);
        }
    } finally {
        apiConfig.jobsDir = original;
        fs.rmSync(temporary, { recursive: true, force: true });
    }
});

test('scoring retains more than ten references for image, video and quote scenes', async () => {
    const { scoreReferencesForScenesWithOpenAI } = await import('./reference-ai-scoring.service.mjs');
    const scenes = ['image', 'video', 'quote'].map((scene_type, index) => ({ scene_id: index + 1, scene_type, narration: 'family' }));
    const referenceCatalog = Array.from({ length: 12 }, (_, index) => ({ id: `ref_${index + 1}`, caption: 'family' }));
    const openai = { chat: { completions: { create: async ({ messages }) => {
        assert.ok(messages[1].content.includes('Score every supplied reference'));
        return { choices: [{ message: { content: JSON.stringify({ scene_scores: scenes.map(scene => ({
            scene_id: scene.scene_id,
            matches: referenceCatalog.map((ref, index) => ({ reference_id: ref.id, score: .9 - index * .02, reason: 'Relevant' }))
        })) }) } }] };
    } } } };
    const result = await scoreReferencesForScenesWithOpenAI({ openai, model: 'test', scenes, referenceCatalog });
    for (const scene of scenes) {
        const matches = result.plan[scene.scene_id].matches;
        assert.equal(matches.length, 12);
        assert.ok(matches[11].score > .5, 'the twelfth score is retained');
        assert.equal(matches[0].id, 'ref_1');
    }
});

test('mixed matching uses cached text only, reports usage and invalidates changed scene duration', async () => {
    const { scoreReferencesForScenesWithOpenAI } = await import('./reference-ai-scoring.service.mjs');
    let calls = 0;
    const referenceCatalog = [{ id: 'ref_1', caption: 'A garden' }, { id: 'clip_1', type: 'video', caption: 'Walking in a garden', duration: 8, usableStartSec: 1, usableEndSec: 8 }];
    const scenes = [{ scene_id: 1, narration: 'Walking in nature', duration_sec: 5 }];
    const openai = { chat: { completions: { create: async ({ messages }) => {
        calls++;
        assert.equal(typeof messages[1].content, 'string');
        assert.match(messages[1].content, /Omit reason for all other matches/);
        assert.match(messages[1].content, /Walking in a garden/);
        assert.ok(!messages[1].content.includes('base64'));
        return { usage: { prompt_tokens: 450, completion_tokens: 90 }, choices: [{ message: { content: JSON.stringify({ scene_scores: [{ scene_id: 1, matches: [{ reference_id: 'ref_1', score: .6 }, { reference_id: 'clip_1', score: .9, reason: 'Visible action fits the narration' }] }] }) } }] };
    } } } };
    const first = await scoreReferencesForScenesWithOpenAI({ openai, model: 'test', scenes, referenceCatalog });
    assert.equal(first.plan[1].matches[0].type, 'video');
    assert.equal(first.stats.usage.promptTokens, 450);
    const second = await scoreReferencesForScenesWithOpenAI({ openai, model: 'test', scenes, referenceCatalog, cacheIndex: first.index });
    assert.equal(calls, 1);
    assert.equal(second.stats.usage.promptTokens, 0);
    await scoreReferencesForScenesWithOpenAI({ openai, model: 'test', scenes: [{ ...scenes[0], duration_sec: 9 }], referenceCatalog, cacheIndex: first.index });
    assert.equal(calls, 2);
});
