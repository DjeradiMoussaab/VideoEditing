function cleanQuery(txt) {
    return String(txt ?? "")
        .replace(/[^\w\s,-]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

export function buildStockQuery(scene) {
    const primary = cleanQuery(scene.visual);
    // Keep stock query driven by planner visual only to preserve generic/reusable intent.
    return cleanQuery(primary) || "people close up";
}

function chooseBestFile(videoFiles, { preferredWidth, preferredHeight }) {
    if (!Array.isArray(videoFiles) || !videoFiles.length) return null;

    const targetRatio = preferredWidth / preferredHeight;
    let best = null;
    let bestScore = Number.POSITIVE_INFINITY;

    for (const f of videoFiles) {
        if (!f?.link || !f?.width || !f?.height) continue;
        const ratio = f.width / f.height;
        const ratioPenalty = Math.abs(ratio - targetRatio) * 1000;
        const sizePenalty =
            Math.abs((f.width ?? preferredWidth) - preferredWidth) +
            Math.abs((f.height ?? preferredHeight) - preferredHeight);
        const score = ratioPenalty + sizePenalty;
        if (score < bestScore) {
            best = f;
            bestScore = score;
        }
    }

    return best;
}

export function pickStockVideo(videos, stockCfg) {
    const filtered = videos.filter((v) => {
        const d = Number(v.duration ?? 0);
        return d >= stockCfg.minDurationSec && d <= stockCfg.maxDurationSec;
    });

    const pool = filtered.length ? filtered : videos;
    if (!pool.length) return null;

    const ranked = pool
        .map((v) => ({
            video: v,
            file: chooseBestFile(v.video_files, stockCfg)
        }))
        .filter((x) => x.file);

    if (!ranked.length) return null;
    return ranked[0];
}
