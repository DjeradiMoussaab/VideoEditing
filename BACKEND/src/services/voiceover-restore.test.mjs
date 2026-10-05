import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { apiConfig } from '../config/api.config.mjs';
import { createManifest, saveManifest, loadManifest } from './job-store.service.mjs';
import { saveProjectInputs } from './pipeline-backend.service.mjs';

test('restoring missing voiceover preserves scenes, references and checkpoints', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'voiceover-restore-'));
    const previous = apiConfig.jobsDir;
    apiConfig.jobsDir = directory;
    try {
        const project = createManifest('restore');
        project.status = 'FINAL_FAILED';
        project.scenes = [{ scene_id: 1, type: 'quote', duration_sec: 1 }];
        project.inputs.references = ['keep-image'];
        project.inputs.referenceClips = ['keep-clip'];
        project.draftCheckpoint = { tasks: { plan: { value: 'keep' } } };
        saveManifest(project.id, project);
        // Compare loaded scenes: loading backfills styles and reference suggestions.
        const before = JSON.parse(JSON.stringify(loadManifest(project.id)));
        const audio = path.join(directory, 'upload.wav');
        execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'anullsrc', '-t', '1', audio]);
        const result = await saveProjectInputs(project.id, { voiceover: [{ path: audio }] }, { restoreVoiceover: true });
        assert.deepEqual(result.scenes, before.scenes);
        assert.deepEqual(result.inputs.references, project.inputs.references);
        assert.deepEqual(result.inputs.referenceClips, project.inputs.referenceClips);
        assert.deepEqual(result.draftCheckpoint, project.draftCheckpoint);
        assert.ok(result.voiceoverUrl);
        assert.equal(fs.existsSync(audio), false);
        fs.writeFileSync(audio, 'replacement');
        await assert.rejects(saveProjectInputs(project.id, { voiceover: [{ path: audio }] }, { restoreVoiceover: true }), /already has a voiceover/);
        assert.equal(loadManifest(project.id).artifacts.needsRegeneration, true);
    } finally {
        apiConfig.jobsDir = previous;
        fs.rmSync(directory, { recursive: true, force: true });
    }
});
