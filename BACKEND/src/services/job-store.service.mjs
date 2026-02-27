import fs from "fs";
import path from "path";
import { apiConfig } from "../config/api.config.mjs";

function ensureDir(p) {
    fs.mkdirSync(p, { recursive: true });
}

export function ensureInfrastructure() {
    ensureDir(apiConfig.jobsDir);
    ensureDir(apiConfig.uploadsDir);
}

export function getJobPaths(jobId) {
    const jobDir = path.join(apiConfig.jobsDir, jobId);
    const inputDir = path.join(jobDir, "input");
    const outDir = path.join(jobDir, "out");
    const customDir = path.join(jobDir, "custom");
    const suggestionsDir = path.join(jobDir, "suggestions");
    const manifestPath = path.join(jobDir, "manifest.json");
    return { jobDir, inputDir, outDir, customDir, suggestionsDir, manifestPath };
}

export function ensureJobDirs(jobId) {
    const p = getJobPaths(jobId);
    ensureDir(p.inputDir);
    ensureDir(p.outDir);
    ensureDir(p.customDir);
    ensureDir(p.suggestionsDir);
    return p;
}

export function createManifest(jobId) {
    const now = new Date().toISOString();
    return {
        id: jobId,
        status: "CREATED",
        createdAt: now,
        updatedAt: now,
        inputs: {
            voiceover: null,
            story: null,
            reference: null
        },
        plan: null,
        sceneChoices: {},
        scenes: [],
        artifacts: {}
    };
}

export function saveManifest(jobId, manifest) {
    const { manifestPath } = ensureJobDirs(jobId);
    manifest.updatedAt = new Date().toISOString();
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
}

export function loadManifest(jobId) {
    const { manifestPath } = getJobPaths(jobId);
    if (!fs.existsSync(manifestPath)) return null;
    return JSON.parse(fs.readFileSync(manifestPath, "utf8"));
}

export function mediaUrl(jobId, absPath) {
    const base = getJobPaths(jobId).jobDir;
    const rel = path.relative(base, absPath).replace(/\\/g, "/");
    return `/api/media/${jobId}/${rel}`;
}

export function resolveMedia(jobId, relPath) {
    const base = getJobPaths(jobId).jobDir;
    const abs = path.resolve(base, relPath);
    if (!abs.startsWith(base) || !fs.existsSync(abs)) return null;
    return abs;
}

