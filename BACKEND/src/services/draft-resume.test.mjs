import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { apiConfig } from '../config/api.config.mjs';
import { createManifest, ensureJobDirs, loadManifest, saveManifest } from './job-store.service.mjs';
import { generateDraft, startDraftJob } from './pipeline-backend.service.mjs';

test('real draft continuation keeps completed downloads and reuses plan, allocation, searches and reviews', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'draft-resume-'));
    const original = { jobsDir: apiConfig.jobsDir, fetch: globalThis.fetch, openai: process.env.OPENAI_API_KEY, pexels: process.env.PEXELS_API_KEY };
    apiConfig.jobsDir = directory;
    process.env.OPENAI_API_KEY = 'test-no-network'; process.env.PEXELS_API_KEY = 'test-no-network';
    try {
        const id = 'resume-test';
        const manifest = createManifest(id);
        const paths = ensureJobDirs(id);
        manifest.inputs.voiceover = path.join(paths.inputDir, 'voiceover.mp3');
        fs.writeFileSync(manifest.inputs.voiceover, 'cached transcript fixture');
        const scenes = [1, 2].map(scene_id => ({ scene_id, start_sec: (scene_id - 1) * 5, end_sec: scene_id * 5, duration_sec: 5, narration: `Narration ${scene_id}`, visual: 'rain window' }));
        const tasks = {};
        const saved = (key, value) => { tasks[key] = { value }; };
        saved('plan', { plan: { title: 'Resume', style_guide: '', scenes }, sceneTypeHints: { 1: 'normal', 2: 'normal' } });
        saved('reference-allocation', { referenceCatalog: [], clipResult: { catalog: [] }, allocation: {
            sceneChoices: { 1: 'video', 2: 'video' }, sceneAssetPaths: {}, sceneSourceMap: { 1: 'stock', 2: 'stock' },
            sceneReferenceMap: { 1: [], 2: [] }, sceneMediaOffsets: {}, stats: { referenceClipScenes: 0 }
        } });
        for (const scene of scenes) saved(`stock-search:${scene.scene_id}`, { query: scene.visual, suggestions: [{ id: String(scene.scene_id), file: { link: `https://fixture.invalid/${scene.scene_id}` } }] });
        saved('stock-review', { selections: { 1: { selectedId: '1' }, 2: { selectedId: '2' } }, index: {}, stats: {} });
        manifest.draftCheckpoint = { version: 1, tasks };
        manifest.referenceAnalysisUsage = {};
        saveManifest(id, manifest);
        let failSecond = true;
        const downloads = [];
        globalThis.fetch = async url => {
            const value = String(url);
            assert.match(value, /^https:\/\/fixture\.invalid\/[12]$/, 'No planner, scoring or search API calls are allowed on resume');
            downloads.push(value);
            if (value.endsWith('/2') && failSecond) throw new Error('simulated connection loss');
            return { ok: true, arrayBuffer: async () => Buffer.from(`fixture video ${value}`) };
        };
        await assert.rejects(generateDraft(id, {}, { resume: true }), /simulated connection loss/);
        const failed = loadManifest(id);
        const firstAsset = failed.draftCheckpoint.tasks['stock-asset:1'].value.path;
        assert.ok(fs.existsSync(firstAsset));
        assert.equal(failed.draftCheckpoint.tasks['stock-asset:2'], undefined);
        // A legacy completed checkpoint must not bypass the new adjacency rule.
        failed.draftCheckpoint.tasks['stock-asset:2'] = structuredClone(failed.draftCheckpoint.tasks['stock-asset:1']);
        saveManifest(id, failed);
        failSecond = false;
        const completed = await generateDraft(id, {}, { resume: true });
        assert.equal(completed.status, 'DRAFT_READY');
        assert.equal(completed.scenes[0].assetPath, firstAsset);
        assert.equal(downloads.filter(url => url.endsWith('/1')).length, 1);
        assert.equal(completed.scenes.length, 2);
        assert.ok(completed.draftCheckpoint.tasks['stock-asset:2']);
    } finally {
        globalThis.fetch = original.fetch; apiConfig.jobsDir = original.jobsDir;
        for (const [key, value] of [['OPENAI_API_KEY', original.openai], ['PEXELS_API_KEY', original.pexels]]) {
            if (value === undefined) delete process.env[key]; else process.env[key] = value;
        }
        fs.rmSync(directory, { recursive: true, force: true });
    }
});

test('continue rejects running and finished projects without changing saved options', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'draft-guard-'));
    const original = apiConfig.jobsDir; apiConfig.jobsDir = directory;
    try {
        for (const status of ['DRAFT_RUNNING', 'FINAL_RUNNING', 'DRAFT_READY']) {
            const manifest = createManifest('guard'); manifest.status = status;
            manifest.draftOptions = { useQuoteDetection: false };
            saveManifest('guard', manifest);
            await assert.rejects(startDraftJob('guard', {}, { resume: true }), error => error.statusCode === 409);
            assert.equal(loadManifest('guard').draftOptions.useQuoteDetection, false);
        }
    } finally { apiConfig.jobsDir = original; fs.rmSync(directory, { recursive: true, force: true }); }
});
