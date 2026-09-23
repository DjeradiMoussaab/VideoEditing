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
        referenceCaptionIndex: {},
        referenceScoringIndex: {},
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

    normalizeSceneIdsIfNeeded(manifest);

    return manifest;
}

function hasBrokenSceneIds(list = []) {
    if (!Array.isArray(list) || list.length === 0) return false;
    const ids = list.map((s) => Number(s?.scene_id));
    if (ids.some((id) => !Number.isFinite(id) || id <= 0)) return true;
    const unique = new Set(ids);
    if (unique.size !== ids.length) return true;
    for (let i = 0; i < ids.length; i++) {
        if (ids[i] !== i + 1) return true;
    }
    return false;
}

function normalizeSceneIdsIfNeeded(manifest) {
    const uiScenes = Array.isArray(manifest?.scenes) ? manifest.scenes : [];
    const planScenes = Array.isArray(manifest?.plan?.scenes) ? manifest.plan.scenes : [];
    const needsFix = hasBrokenSceneIds(uiScenes) || hasBrokenSceneIds(planScenes);
    if (!needsFix) return;

    const total = Math.max(uiScenes.length, planScenes.length);
    for (let i = 0; i < total; i++) {
        const nextId = i + 1;
        if (planScenes[i]) planScenes[i].scene_id = nextId;
        if (uiScenes[i]) uiScenes[i].scene_id = nextId;
    }

    // Rebuild choices from UI scenes to keep editing functional.
    const rebuiltChoices = {};
    for (const scene of uiScenes) {
        const id = Number(scene?.scene_id);
        if (!Number.isFinite(id) || id <= 0) continue;
        const type = String(scene?.type || "").trim();
        if (type === "image" || type === "video" || type === "quote") {
            rebuiltChoices[String(id)] = type;
        }
    }
    if (Object.keys(rebuiltChoices).length > 0) {
        manifest.sceneChoices = rebuiltChoices;
    }

    if (manifest.lastInsertedSceneId !== undefined && manifest.lastInsertedSceneId !== null) {
        const n = Number(manifest.lastInsertedSceneId);
        if (Number.isFinite(n)) {
            manifest.lastInsertedSceneId = Math.max(1, Math.min(total || 1, Math.round(n)));
        }
    }
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
    manifest.voiceoverUrl = manifest.inputs?.voiceover && fs.existsSync(manifest.inputs.voiceover)
        ? mediaUrl(jobId, manifest.inputs.voiceover) : null;
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
