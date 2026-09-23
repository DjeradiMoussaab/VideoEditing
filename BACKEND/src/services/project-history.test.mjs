import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { apiConfig } from '../config/api.config.mjs';
import { createManifest, ensureJobDirs, saveManifest, loadManifest } from './job-store.service.mjs';
import { preserveGeneratedVideo, deleteProject } from './project-history.service.mjs';

test('history retains immutable renders and only deletes idle projects', () => {
    const original = apiConfig.jobsDir;
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'video-history-test-'));
    apiConfig.jobsDir = temporary;
    try {
        const id = 'test-project';
        const paths = ensureJobDirs(id);
        const manifest = createManifest(id);
        const output = path.join(paths.outDir, 'final.mp4');
        fs.writeFileSync(output, 'first video');
        manifest.status = 'FINAL_READY';
        manifest.artifacts = { finalMp4: output, finalUrl: `/api/media/${id}/out/final.mp4` };
        preserveGeneratedVideo(id, manifest);
        const firstPath = manifest.artifacts.finalMp4;
        preserveGeneratedVideo(id, manifest);
        assert.equal(manifest.generatedVideos.length, 1, 'archiving is idempotent');
        fs.writeFileSync(output, 'second video');
        manifest.artifacts = { finalMp4: output, finalUrl: `/api/media/${id}/out/final.mp4` };
        preserveGeneratedVideo(id, manifest);
        assert.equal(fs.readFileSync(firstPath, 'utf8'), 'first video');
        assert.equal(fs.readFileSync(manifest.artifacts.finalMp4, 'utf8'), 'second video');
        assert.equal(loadManifest(id).generatedVideos.length, 2);
        manifest.status = 'FINAL_RUNNING'; saveManifest(id, manifest);
        assert.throws(() => deleteProject(id), { statusCode: 409 });
        manifest.status = 'FINAL_READY'; saveManifest(id, manifest);
        deleteProject(id);
        assert.equal(loadManifest(id), null);
        assert.equal(fs.existsSync(firstPath), false, 'explicit project deletion removes saved versions');
        const draft = createManifest('draft');
        draft.status = 'DRAFT_RUNNING'; saveManifest('draft', draft);
        assert.throws(() => deleteProject('draft'), { statusCode: 409 });
        draft.status = 'DRAFT_READY'; saveManifest('draft', draft);
        deleteProject('draft');
        assert.equal(loadManifest('draft'), null);
        assert.throws(() => deleteProject('../outside'), { statusCode: 400 });
    } finally {
        apiConfig.jobsDir = original;
        fs.rmSync(temporary, { recursive: true, force: true });
    }
});
