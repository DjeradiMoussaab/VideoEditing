import fs from "fs";
import path from "path";
import { apiConfig } from "../config/api.config.mjs";
import { config } from "../config.mjs";

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
    const animationProfiles = Object.entries(config.video?.imageAnimationProfiles || {}).map(
        ([id, profile]) => ({
            id,
            label: profile.label || id,
            estimatedM1SecPer1SecClip: Number(
                profile.estimatedM1SecPer1SecClip ??
                (Number(profile.estimatedM1SecPer10SecClip || 0) / 10)
            )
        })
    );
    return {
        id: jobId,
        status: "CREATED",
        createdAt: now,
        updatedAt: now,
        inputs: {
            voiceover: null,
            references: []
        },
        draftOptions: null,
        progress: null,
        capabilities: {
            imageAnimationStyles: animationProfiles
        },
        plan: null,
        sceneChoices: {},
        scenes: [],
        artifacts: {}
    };
}

function animationStylesFromConfig() {
    return Object.entries(config.video?.imageAnimationProfiles || {}).map(([id, profile]) => ({
        id,
        label: profile.label || id,
        estimatedM1SecPer1SecClip: Number(
            profile.estimatedM1SecPer1SecClip ??
            (Number(profile.estimatedM1SecPer10SecClip || 0) / 10)
        )
    }));
}

function withManifestBackfill(manifest) {
    if (!manifest || typeof manifest !== "object") return manifest;
    const styles = animationStylesFromConfig();

    manifest.capabilities = manifest.capabilities || {};
    if (
        !Array.isArray(manifest.capabilities.imageAnimationStyles) ||
        manifest.capabilities.imageAnimationStyles.length === 0
    ) {
        manifest.capabilities.imageAnimationStyles = styles;
    } else {
        const configById = new Map(styles.map((s) => [String(s.id), s]));
        const normalizedExisting = manifest.capabilities.imageAnimationStyles.map((style) => {
            const id = String(style.id);
            const fromConfig = configById.get(id) || {};
            return {
                ...fromConfig,
                ...style,
                id,
                estimatedM1SecPer1SecClip: Number(
                    style.estimatedM1SecPer1SecClip ??
                    fromConfig.estimatedM1SecPer1SecClip ??
                    (Number(style.estimatedM1SecPer10SecClip || 0) / 10)
                )
            };
        });
        const existingIds = new Set(normalizedExisting.map((s) => String(s.id)));
        const missingFromManifest = styles.filter((s) => !existingIds.has(String(s.id)));
        manifest.capabilities.imageAnimationStyles = [...normalizedExisting, ...missingFromManifest];
    }

    const defaultStyle = String(
        manifest?.draftOptions?.imageAnimationStyle ||
        config.video?.imageAnimationStyle ||
        styles?.[0]?.id ||
        ""
    );
    if (Array.isArray(manifest.scenes)) {
        for (const scene of manifest.scenes) {
            if (!scene || scene.type !== "image") continue;
            if (!scene.imageAnimationStyle) {
                scene.imageAnimationStyle = defaultStyle || null;
            }
        }
    }

    return manifest;
}

export function saveManifest(jobId, manifest) {
    const { manifestPath } = ensureJobDirs(jobId);
    manifest.updatedAt = new Date().toISOString();
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
}

export function loadManifest(jobId) {
    const { manifestPath } = getJobPaths(jobId);
    if (!fs.existsSync(manifestPath)) return null;
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    return withManifestBackfill(manifest);
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
