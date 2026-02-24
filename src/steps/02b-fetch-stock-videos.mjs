import { PexelsVideoProvider } from "../providers/pexels-video-provider.mjs";
import { buildStockQuery, pickStockVideo } from "../services/stock-selection.service.mjs";

function wantsStock(mode) {
    return mode === "stock_video" || mode === "hybrid";
}

export async function fetchStockVideosStep(ctx) {
    if (!wantsStock(ctx.visualSourceMode)) return ctx;

    const provider = new PexelsVideoProvider(ctx);

    for (const scene of ctx.plan.scenes) {
        const outPath = ctx.paths.sceneStockVideo(scene.scene_id);
        if (ctx.fs.exists(outPath)) {
            ctx.sceneVisuals[scene.scene_id] = { type: "video", path: outPath };
            continue;
        }

        const query = buildStockQuery(scene);
        const videos = await provider.searchVideos({
            query,
            perPage: ctx.config.stock.perPage
        });

        const selected = pickStockVideo(videos, ctx.config.stock);
        if (!selected) continue;

        await provider.downloadVideoFile(selected.file.link, outPath);
        ctx.sceneVisuals[scene.scene_id] = { type: "video", path: outPath };
    }

    return ctx;
}
