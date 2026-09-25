import "../config/env.mjs";
import { generateDraft } from '../services/pipeline-backend.service.mjs';
import { loadManifest, saveManifest } from '../services/job-store.service.mjs';

const jobId = process.argv[2];
try {
    await generateDraft(jobId, loadManifest(jobId)?.draftOptions || {});
} catch (error) {
    const manifest = loadManifest(jobId);
    if (manifest) {
        manifest.status = 'DRAFT_FAILED';
        manifest.progress = { ...manifest.progress, phase: 'draft_failed', summary: error.message };
        saveManifest(jobId, manifest);
    }
    process.exitCode = 1;
}
