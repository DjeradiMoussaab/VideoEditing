import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { apiConfig } from '../config/api.config.mjs';
import { stopJobProcess } from './job-process.service.mjs';
import { getJobPaths, loadManifest, mediaUrl, saveManifest } from './job-store.service.mjs';

export function preserveGeneratedVideo(jobId, manifest) {
    const artifacts = manifest.artifacts || {};
    if (!artifacts.finalUrl) return;
    const versions = manifest.generatedVideos || [];
    if (artifacts.versionId && versions.some(version => version.id === artifacts.versionId)) return;
    const { jobDir, outDir } = getJobPaths(jobId);
    const source = artifacts.finalMp4 || path.join(outDir, 'final.mp4');
    if (!fs.existsSync(source)) throw new Error('Cannot preserve the previous generated video: file is missing.');
    const id = randomUUID();
    const versionDir = path.join(jobDir, 'versions', id);
    fs.mkdirSync(versionDir, { recursive: true });
    const target = path.join(versionDir, 'final.mp4');
    fs.copyFileSync(source, target, fs.constants.COPYFILE_EXCL);
    const version = {
        id,
        number: versions.length + 1,
        createdAt: artifacts.generatedAt || manifest.updatedAt,
        finalUrl: mediaUrl(jobId, target),
        durationSec: (manifest.scenes || []).reduce((sum, scene) => sum + Number(scene.duration_sec || 0), 0),
        renderMetrics: artifacts.renderMetrics || {}
    };
    manifest.generatedVideos = [...versions, version];
    manifest.artifacts = { ...artifacts, versionId: id, finalMp4: target, finalUrl: version.finalUrl };
    saveManifest(jobId, manifest);
}

export function canDeleteProject(manifest) {
    return Boolean(manifest);
}

export async function deleteProject(jobId) {
    if (!/^[a-zA-Z0-9-]+$/.test(jobId)) throw Object.assign(new Error('Invalid project ID'), { statusCode: 400 });
    const manifest = loadManifest(jobId);
    if (!manifest) throw Object.assign(new Error('Project not found'), { statusCode: 404 });
    await stopJobProcess(jobId);
    // A rename removes the project atomically from history before removing its files.
    const trashDir = path.join(apiConfig.jobsDir, '.deleted');
    fs.mkdirSync(trashDir, { recursive: true });
    const target = path.join(trashDir, randomUUID());
    fs.renameSync(getJobPaths(jobId).jobDir, target);
    fs.rmSync(target, { recursive: true, force: true });
}
