import { PexelsVideoProvider } from "../providers/pexels-video-provider.mjs";

function chooseBestFile(videoFiles, { preferredWidth, preferredHeight }) {
    if (!Array.isArray(videoFiles) || !videoFiles.length) return null;
    const targetRatio = preferredWidth / preferredHeight;
    let best = null;
    let bestScore = Number.POSITIVE_INFINITY;

    for (const f of videoFiles) {
        if (!f?.link || !f?.width || !f?.height) continue;
        const ratioPenalty = Math.abs(f.width / f.height - targetRatio) * 1000;
        const sizePenalty = Math.abs(f.width - preferredWidth) + Math.abs(f.height - preferredHeight);
        const score = ratioPenalty + sizePenalty;
        if (score < bestScore) {
            best = f;
            bestScore = score;
        }
    }

    return best;
}

function cleanQuery(text) {
    const value = String(text || "").trim();
    return value || null;
}

function scoreStockCandidate(video, { preferredDurationSec = null } = {}) {
    const duration = Number(video?.duration ?? 0);
    let score = 0;
    if (Number.isFinite(preferredDurationSec)) {
        score -= Math.abs(duration - preferredDurationSec) * 2;
    }
    return score;
}

export async function getStockSuggestions(ctx, scene, count = 24, { customQuery = null, forceRefresh = false } = {}) {
    ctx.__stockSuggestionsCache = ctx.__stockSuggestionsCache || new Map();
    const sceneKey = String(scene?.scene_id ?? "");
    const query = cleanQuery(customQuery) || cleanQuery(scene?.stockSearchQuery) || cleanQuery(scene?.visual) || "rain window";
    const cacheKey = `${sceneKey}::${query}::${count}`;
    if (!forceRefresh && ctx.__stockSuggestionsCache.has(cacheKey)) {
        return ctx.__stockSuggestionsCache.get(cacheKey);
    }

    const provider = new PexelsVideoProvider(ctx);
    ctx.__stockSearchCache = ctx.__stockSearchCache || new Map();
    const perPage = Math.max(count * 2, ctx.config.stock.perPage);
    const searchKey = `${query}::${perPage}`;
    if (!ctx.__stockSearchCache.has(searchKey)) {
        ctx.__stockSearchCache.set(searchKey, provider.searchVideos({ query, perPage }));
    }
    let videos;
    try { videos = await ctx.__stockSearchCache.get(searchKey); }
    catch (error) { ctx.__stockSearchCache.delete(searchKey); throw error; }

    const filtered = videos
        .filter((v) => {
            const d = Number(v.duration ?? 0);
            return d >= ctx.config.stock.minDurationSec && d <= ctx.config.stock.maxDurationSec;
        })
        .map((v) => {
            const file = chooseBestFile(v.video_files, ctx.config.stock);
            if (!file) return null;
            const score = scoreStockCandidate(v, {
                preferredDurationSec: Number(scene?.duration_sec || 0)
            });
            return {
                id: String(v.id),
                duration: v.duration,
                width: v.width,
                height: v.height,
                pexelsUrl: v.url,
                thumbnail: v.image,
                reviewFrames: (v.video_pictures?.length
                    ? [v.video_pictures[0]?.picture, v.video_pictures[Math.floor(v.video_pictures.length / 2)]?.picture]
                    : [v.image]).filter(Boolean),
                file,
                score
            };
        })
        .filter(Boolean)
        .sort((a, b) => Number(b.score || 0) - Number(a.score || 0))
        .slice(0, count);

    const payload = {
        query,
        suggestions: filtered
    };
    ctx.__stockSuggestionsCache.set(cacheKey, payload);
    return payload;
}
