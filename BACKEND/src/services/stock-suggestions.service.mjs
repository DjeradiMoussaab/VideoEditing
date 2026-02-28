import { PexelsVideoProvider } from "../providers/pexels-video-provider.mjs";
import { buildStockQuery } from "./stock-selection.service.mjs";

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

export async function getStockSuggestions(ctx, scene, count = 8) {
    const provider = new PexelsVideoProvider(ctx);
    const query = buildStockQuery(scene);
    const videos = await provider.searchVideos({
        query,
        perPage: Math.max(count * 2, ctx.config.stock.perPage)
    });

    const filtered = videos
        .filter((v) => {
            const d = Number(v.duration ?? 0);
            return d >= ctx.config.stock.minDurationSec && d <= ctx.config.stock.maxDurationSec;
        })
        .map((v) => {
            const file = chooseBestFile(v.video_files, ctx.config.stock);
            if (!file) return null;
            return {
                id: String(v.id),
                duration: v.duration,
                width: v.width,
                height: v.height,
                pexelsUrl: v.url,
                thumbnail: v.image,
                file
            };
        })
        .filter(Boolean)
        .slice(0, count);

    return filtered;
}
