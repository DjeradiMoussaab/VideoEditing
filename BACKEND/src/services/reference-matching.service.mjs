import path from "path";

const STOPWORDS = new Set([
    "the", "a", "an", "and", "or", "with", "from", "into", "this", "that", "there", "their",
    "about", "after", "before", "while", "where", "when", "over", "under", "near", "very",
    "scene", "shot", "image", "photo", "video", "frame"
]);

const SEMANTIC_GROUPS = {
    person: [
        "person", "people", "man", "woman", "women", "girl", "boy", "adult", "mother", "mom", "father", "dad",
        "parent", "parents", "child", "children", "kid", "kids", "baby", "infant", "newborn", "family",
        "couple", "husband", "wife", "nanny", "caregiver"
    ],
    home: ["home", "house", "room", "bedroom", "kitchen", "living", "bed", "sofa", "couch", "apartment", "indoor", "indoors"],
    lifestyle: ["lifestyle", "daily", "everyday", "casual", "routine", "fitness", "healthy", "workout", "blogger", "influencer", "social", "followers", "parenting"],
    emotion: ["smile", "happy", "sad", "calm", "stress", "stressed", "anxious", "relaxed", "crying", "laughing", "concerned"],
    work: ["work", "office", "career", "job", "meeting", "business", "working", "law", "lawyer", "attorney"],
    nature: ["nature", "forest", "tree", "lake", "river", "ocean", "sea", "mountain", "outdoor", "outdoors", "park", "sky", "sunset", "beach"],
    city: ["city", "street", "urban", "traffic", "road", "car", "bus", "train", "subway", "building"],
    detail: ["closeup", "close", "hands", "hair", "face", "eyes", "nails", "skin", "texture"]
};

function normalizeToken(t) {
    const token = String(t || "").trim().toLowerCase();
    if (token.length <= 3) return token;
    return token
        .replace(/(ing|ed|es|s)$/g, "")
        .trim();
}

function tokenize(text) {
    return String(text || "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .split(/\s+/)
        .map(normalizeToken)
        .filter((x) => x.length >= 3 && !STOPWORDS.has(x));
}

function unique(arr) {
    return [...new Set(arr)];
}

function overlapScore(sceneTokens, refTokens) {
    if (!sceneTokens.length || !refTokens.length) return 0;
    const refSet = new Set(refTokens);
    const sceneSet = new Set(sceneTokens);
    let overlap = 0;
    for (const t of sceneTokens) {
        if (refSet.has(t)) overlap += 1;
    }
    const union = new Set([...sceneSet, ...refSet]).size;
    // Jaccard is stricter than min-length overlap and avoids inflated scores.
    return Math.max(0, Math.min(1, overlap / Math.max(1, union)));
}

function semanticGroupsFromTokens(tokens = []) {
    const tokenSet = new Set(tokens);
    const groups = new Set();
    for (const [group, words] of Object.entries(SEMANTIC_GROUPS)) {
        for (const w of words) {
            if (tokenSet.has(normalizeToken(w))) {
                groups.add(group);
                break;
            }
        }
    }
    return groups;
}

function semanticOverlapScore(sceneTokens, refTokens) {
    const sceneGroups = semanticGroupsFromTokens(sceneTokens);
    const refGroups = semanticGroupsFromTokens(refTokens);
    if (!sceneGroups.size || !refGroups.size) return 0;
    let overlap = 0;
    for (const g of sceneGroups) {
        if (refGroups.has(g)) overlap += 1;
    }
    const union = new Set([...sceneGroups, ...refGroups]).size;
    return Math.max(0, Math.min(1, overlap / Math.max(1, union)));
}

function combinedScore(sceneTokens, refTokens) {
    const lexical = overlapScore(sceneTokens, refTokens);
    const semantic = semanticOverlapScore(sceneTokens, refTokens);
    const raw = Math.max(0, Math.min(1, lexical * 0.25 + semantic * 0.75));

    // Calibrate to user-facing confidence:
    // semantic overlap should produce medium/high scores even when exact wording differs.
    if (semantic >= 0.34) return Math.max(0, Math.min(1, 0.55 + raw * 0.45));
    if (semantic > 0) return Math.max(0, Math.min(1, 0.42 + raw * 0.48));
    return Math.max(0, Math.min(1, raw * 0.4));
}

function rotateCatalog(referenceCatalog, sceneId) {
    const n = referenceCatalog.length;
    if (!n) return [];
    const offset = (Number(sceneId || 1) - 1) % n;
    return [...referenceCatalog.slice(offset), ...referenceCatalog.slice(0, offset)];
}

export function buildReferenceCatalog(referencePaths = []) {
    return referencePaths.map((absPath, index) => ({
        id: `ref_${index + 1}`,
        path: absPath,
        filename: path.basename(absPath)
    }));
}

export function matchReferencesToScenes(
    scenes = [],
    referenceCatalog = [],
    { useCaptionMatching = false } = {}
) {
    const out = {};

    for (const scene of scenes) {
        if (!referenceCatalog.length) {
            out[scene.scene_id] = { matches: [], primaryAsset: null };
            continue;
        }

        if (useCaptionMatching) {
            const sceneTokens = unique(
                tokenize(`${scene.narration || ""} ${scene.visual || ""} ${scene.image_prompt || ""}`)
            );
            const scored = referenceCatalog
                .map((ref) => {
                    const refTokens = unique(
                        tokenize(`${ref.caption || ""} ${(Array.isArray(ref.tags) ? ref.tags.join(" ") : "")}`)
                    );
                    return {
                        ...ref,
                        score: Math.min(.5, combinedScore(sceneTokens, refTokens)),
                        reason: "Text-only fallback; review relevance before selecting."
                    };
                })
                .sort((a, b) => {
                    const delta = Number(b.score || 0) - Number(a.score || 0);
                    if (Math.abs(delta) > 1e-9) return delta;
                    // Stable fallback ordering.
                    return String(a.id).localeCompare(String(b.id));
                });

            const bestScore = Number(scored[0]?.score || 0);
            if (bestScore >= 0.1) {
                out[scene.scene_id] = {
                    matches: scored,
                    primaryAsset: scored[0]
                };
                continue;
            }

            // In caption-matching mode, do not invent synthetic matches.
            // Keep scores as-is so downstream logic can reject weak/no-match references.
            out[scene.scene_id] = {
                matches: scored,
                primaryAsset: null
            };
            continue;
        }

        // Deterministic fallback not based on filenames.
        const rotated = rotateCatalog(referenceCatalog, scene.scene_id).map((ref, idx) => ({
            ...ref,
            score: 0.5,
            rank: idx + 1
        }));

        out[scene.scene_id] = {
            matches: rotated,
            primaryAsset: rotated[0] || null
        };
    }

    return out;
}
