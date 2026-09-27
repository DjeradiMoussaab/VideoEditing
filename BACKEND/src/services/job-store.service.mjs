import { referenceClipCatalog } from './reference-clips.service.mjs';
import fs from "fs";
import path from "path";
import { apiConfig } from "../config/api.config.mjs";
import { config } from "../config.mjs";
import { buildReferenceCatalog, matchReferencesToScenes } from "./reference-matching.service.mjs";

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
            description: profile.description || "",
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
            references: [],
            referenceClips: []
        },
        draftOptions: null,
        progress: null,
        capabilities: {
            imageAnimationStyles: animationProfiles
        },
        referenceCaptionIndex: {},
        referenceClipIndex: {},
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
        description: profile.description || "",
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
    // Profiles are code-defined. Replacing the old list keeps existing projects in
    // sync and prevents retired presets from lingering alongside the current ten.
    manifest.capabilities.imageAnimationStyles = styles;

    const defaultStyle = String(
        (styles.some(style => style.id === manifest?.draftOptions?.imageAnimationStyle) ? manifest.draftOptions.imageAnimationStyle : null) ||
        config.video?.imageAnimationStyle ||
        styles?.[0]?.id ||
        ""
    );
    if (Array.isArray(manifest.scenes)) {
        for (const scene of manifest.scenes) {
            if (!scene || scene.type !== "image") continue;
            if (!styles.some(style => style.id === scene.imageAnimationStyle)) {
                scene.imageAnimationStyle = defaultStyle || null;
            }
        }
    }

    // Upgrade older projects without an API call or regenerating their media.
    const catalog = buildReferenceCatalog(manifest.inputs?.references || []).map(ref => ({
        ...ref,
        caption: manifest.referenceCaptionIndex?.[ref.path]?.caption || "",
        tags: manifest.referenceCaptionIndex?.[ref.path]?.tags || []
    }));
    catalog.push(...referenceClipCatalog(manifest.inputs?.referenceClips || [], manifest.referenceClipIndex || {}));
    manifest.referenceClips = catalog.filter(ref => ref.type === 'video').map(ref => ({
        id: ref.id, filename: ref.filename, duration: ref.duration, status: ref.status || 'pending', error: ref.error || null,
        url: mediaUrl(manifest.id, ref.path), thumbnailUrl: ref.thumbnailPath ? mediaUrl(manifest.id, ref.thumbnailPath) : null
    }));
    for (const scene of manifest.scenes || []) {
        const existing = new Map((scene.referenceMatches || []).map(match => [String(match.id), match]));
        for (const match of scene.technical?.topMatches || []) {
            if (!existing.has(String(match.id))) existing.set(String(match.id), match);
        }
        const missing = catalog.filter(ref => {
            const match = existing.get(String(ref.id));
            return !match || (Number(match.score) === .01 && !match.reason);
        });
        if (missing.length) {
            const ranked = matchReferencesToScenes([scene], missing, { useCaptionMatching: true });
            for (const ref of ranked[scene.scene_id]?.matches || []) {
                existing.set(String(ref.id), {
                    id: ref.id, filename: ref.filename, score: ref.score,
                    type: ref.type || 'image', duration: ref.duration,
                    usableStartSec: ref.usableStartSec, usableEndSec: ref.usableEndSec,
                    status: ref.status, error: ref.error || null, thumbnailUrl: ref.thumbnailPath ? mediaUrl(manifest.id, ref.thumbnailPath) : null,
                    url: mediaUrl(manifest.id, ref.path)
                });
            }
        }
        scene.referenceMatches = [...existing.values()].sort((a, b) => Number(b.score || 0) - Number(a.score || 0));
        delete scene.technical;
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

}

export function saveManifest(jobId, manifest) {
    const { manifestPath } = ensureJobDirs(jobId);
    manifest.updatedAt = new Date().toISOString();
    const temporary = `${manifestPath}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(manifest, null, 2));
    fs.renameSync(temporary, manifestPath);
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
