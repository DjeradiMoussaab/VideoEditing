import { loadManifest, saveManifest } from './job-store.service.mjs';
import { stopJobProcess } from './job-process.service.mjs';
import { startDraftJob, startFinalVideoJob } from './pipeline-backend.service.mjs';

const pending = new Set();
export function processingControlPending(id) { return pending.has(id); }
const conflict = message => Object.assign(new Error(message), { statusCode: 409 });

export async function controlProcessing(id, action) {
    if (!['pause', 'resume', 'cancel', 'regenerate'].includes(action)) {
        throw Object.assign(new Error('Unknown processing action'), { statusCode: 400 });
    }
    if (pending.has(id)) throw conflict('A processing action is already in progress.');
    pending.add(id);
    try {
        let project = loadManifest(id);
        if (!project) throw Object.assign(new Error('Project not found'), { statusCode: 404 });
        const running = /^(DRAFT|FINAL)_(RUNNING|STOPPING)$/.test(project.status);
        const paused = /^(DRAFT|FINAL)_PAUSED$/.test(project.status);
        const phase = project.status.startsWith('FINAL_') ? 'FINAL' : 'DRAFT';
        if (action === 'pause' && !running) throw conflict('Only running processing can be paused.');
        if (action === 'resume' && !paused) throw conflict('Only paused processing can be resumed.');
        if (action === 'cancel' && !running && !paused) throw conflict('No active processing to cancel.');
        if (running) {
            // Mark before killing so completion handlers cannot turn this into a failure.
            project.status = `${phase}_STOPPING`;
            saveManifest(id, project);
            await stopJobProcess(id);
            project = loadManifest(id);
        }
        if (action === 'pause' || action === 'cancel') {
            project.status = `${phase}_${action === 'pause' ? 'PAUSED' : 'CANCELLED'}`;
            project.progress = { ...project.progress, summary: action === 'pause'
                ? (phase === 'DRAFT' ? 'Paused. Completed steps are saved.' : 'Paused. Resume will restart the final render.')
                : 'Cancelled. Your inputs and saved project are retained.' };
            saveManifest(id, project);
            return project;
        }
        project.status = phase === 'DRAFT' ? 'DRAFT_FAILED' : 'FINAL_FAILED';
        saveManifest(id, project);
        return phase === 'DRAFT'
            ? await startDraftJob(id, project.draftOptions || {}, { resume: action === 'resume', background: true })
            : startFinalVideoJob(id);
    } finally { pending.delete(id); }
}
