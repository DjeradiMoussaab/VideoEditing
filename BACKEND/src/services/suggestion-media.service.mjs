import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ensureJobDirs, loadManifest, registerUploadedMedia, saveManifest } from './job-store.service.mjs';

const run = promisify(execFile);
const imageExtensions = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif', '.bmp', '.tif', '.tiff', '.heic', '.heif']);
const videoExtensions = new Set(['.mp4', '.mov', '.webm', '.m4v', '.mkv', '.avi', '.mpeg', '.mpg', '.ogv']);
const invalid = message => Object.assign(new Error(message), { statusCode: 400 });

export async function addSuggestionMedia(jobId, file) {
    if (!loadManifest(jobId)) throw Object.assign(new Error('Project not found'), { statusCode: 404 });
    if (!file?.buffer?.length) throw invalid('Choose a nonempty image or video file.');
    if (file.buffer.length > 200 * 1024 * 1024) throw invalid('Each uploaded file must be 200 MB or smaller.');
    const extension = path.extname(file.originalname || '').toLowerCase();
    const type = imageExtensions.has(extension) ? 'image' : videoExtensions.has(extension) ? 'video' : null;
    if (!type) throw invalid('Choose a supported image or video file.');
    const target = path.join(ensureJobDirs(jobId).customDir, `suggestion_${randomUUID()}${extension}`);
    try {
        fs.writeFileSync(target, file.buffer);
        try {
            const { stdout } = await run('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'json', target], { timeout: 30000, maxBuffer: 1024 * 1024 });
            const stream = JSON.parse(stdout).streams?.[0];
            if (!stream?.width || !stream?.height) throw new Error('No visual stream');
        } catch (error) {
            if (error.code === 'ENOENT') throw new Error('FFprobe is unavailable. Install FFmpeg and retry the upload.');
            throw invalid('This file could not be read as an image or video. Try another file.');
        }
        // Reload after probing so concurrent edits are not overwritten.
        const manifest = loadManifest(jobId);
        if (!manifest) throw new Error('Project no longer exists.');
        registerUploadedMedia(manifest, target, type, file.originalname);
        saveManifest(jobId, manifest);
        return manifest;
    } catch (error) {
        fs.rmSync(target, { force: true });
        throw error;
    }
}
