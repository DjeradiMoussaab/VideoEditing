import path from "path";

const STOPWORDS = new Set([
    "the", "a", "an", "and", "or", "with", "from", "into", "this", "that", "there", "their",
    "about", "after", "before", "while", "where", "when", "over", "under", "near", "very",
    "scene", "shot", "image", "photo", "video", "frame"
]);

function tokenize(text) {
    return String(text || "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .split(/\s+/)
        .filter((x) => x.length >= 3 && !STOPWORDS.has(x));
}

function unique(arr) {
    return [...new Set(arr)];
}

function score(sceneTokens, refTokens) {
    if (!sceneTokens.length || !refTokens.length) return 0;
    const refSet = new Set(refTokens);
    let overlap = 0;
    for (const t of sceneTokens) {
        if (refSet.has(t)) overlap += 1;
    }
    return overlap;
}

export function buildReferenceCatalog(referencePaths = []) {
    return referencePaths.map((absPath, index) => {
        const filename = path.basename(absPath);
        const stem = filename.replace(/\.[^.]+$/, "");
        const tokens = unique(tokenize(stem));
        return {
            id: `ref_${index + 1}`,
            path: absPath,
            filename,
            tokens
        };
    });
}

export function matchReferencesToScenes(scenes = [], referenceCatalog = []) {
    const out = {};

    for (const scene of scenes) {
        const sceneTokens = unique(
            tokenize(`${scene.narration || ""} ${scene.visual || ""} ${scene.image_prompt || ""}`)
        );

        const matches = referenceCatalog
            .map((ref) => ({ ...ref, score: score(sceneTokens, ref.tokens) }))
            .filter((x) => x.score > 0)
            .sort((a, b) => b.score - a.score || a.filename.localeCompare(b.filename));

        const primaryAsset = matches.find((x) => x.score >= 2) || null;

        out[scene.scene_id] = {
            matches,
            primaryAsset
        };
    }

    return out;
}
