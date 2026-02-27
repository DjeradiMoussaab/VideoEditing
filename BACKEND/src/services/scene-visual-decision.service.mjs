function pickRandomVisualType(stockProbability) {
    return Math.random() < stockProbability ? "video" : "image";
}

export function decideSceneVisualTypes(scenes, cfg) {
    const stockProbability = Math.min(1, Math.max(0, Number(cfg.visual.decision.stockProbability ?? 0.75)));
    const out = {};

    for (const s of scenes) {
        out[s.scene_id] = pickRandomVisualType(stockProbability);
    }

    return out;
}
