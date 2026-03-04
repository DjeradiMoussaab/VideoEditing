function cleanText(txt) {
    return String(txt ?? "")
        .toLowerCase()
        .replace(/[^\w\s-]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

const HUMAN_TOKENS = [
    "girl", "boy", "woman", "man", "couple", "husband", "wife", "mother", "father",
    "teen", "child", "baby", "person", "people", "she", "he", "her", "him"
];

const FACE_RISK_TOKENS = [
    "face", "portrait", "selfie", "beauty", "model", "headshot", "smile", "interview",
    "talking", "vlog", "influencer", "lip"
];

const CLOSEUP_ALLOW_TOKENS = [
    "smile", "smiling", "nail", "nails", "hair", "hairstyle",
    "baby", "infant", "newborn", "face", "skin", "makeup", "eyes", "lips"
];

const HUMAN_SAFE_QUERIES = [
    "couple holding hands close up cinematic",
    "silhouette couple walking sunset",
    "back view person walking street",
    "close up hands emotional cinematic",
    "feet walking road moody cinematic"
];

const HUMAN_CLOSEUP_QUERIES = [
    "close up smiling face cinematic",
    "close up hands and nails detail",
    "close up hair movement soft light",
    "baby face close up gentle light",
    "macro beauty detail cinematic"
];

const GENERIC_SAFE_QUERIES = [
    "cinematic nature landscape wide shot",
    "city night b roll moody",
    "rain window abstract cinematic",
    "ocean waves dramatic light",
    "forest path atmospheric",
    "sunlight dust particles indoors",
    "empty road evening cinematic"
];

function includesAny(text, tokens) {
    return tokens.some((t) => text.includes(t));
}

function pickFrom(list, seedText) {
    if (!list.length) return "";
    let h = 0;
    const s = String(seedText || "seed");
    for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
    const idx = Math.abs(h) % list.length;
    return list[idx];
}

export function buildStockSearchPlan(scene) {
    const base = cleanText(`${scene?.visual || ""} ${scene?.narration || ""} ${scene?.image_prompt || ""}`);
    const humanNarrative = includesAny(base, HUMAN_TOKENS);
    const allowCloseup = includesAny(base, CLOSEUP_ALLOW_TOKENS);
    const primaryQuery = humanNarrative
        ? pickFrom(
            allowCloseup ? HUMAN_CLOSEUP_QUERIES : HUMAN_SAFE_QUERIES,
            `${scene?.scene_id || ""}:${base}`
        )
        : pickFrom(GENERIC_SAFE_QUERIES, `${scene?.scene_id || ""}:${base}`);

    return {
        query: primaryQuery || "cinematic nature b roll",
        avoidTokens: allowCloseup
            ? FACE_RISK_TOKENS.filter((t) => !["face", "portrait", "smile", "lip"].includes(t))
            : FACE_RISK_TOKENS
    };
}

export function scoreStockCandidate(video, { preferredDurationSec = null, avoidTokens = [] } = {}) {
    const blob = cleanText(`${video?.url || ""} ${video?.image || ""}`);
    const duration = Number(video?.duration ?? 0);
    let score = 0;

    if (Number.isFinite(preferredDurationSec)) {
        score -= Math.abs(duration - preferredDurationSec) * 2;
    }

    if (includesAny(blob, avoidTokens)) {
        score -= 120;
    }

    if (includesAny(blob, ["hands", "silhouette", "back", "nature", "city", "road", "rain", "ocean", "forest"])) {
        score += 20;
    }

    return score;
}
