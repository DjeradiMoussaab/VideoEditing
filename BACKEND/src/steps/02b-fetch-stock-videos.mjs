import { sameFootage } from '../services/footage-continuity.service.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { PexelsVideoProvider } from "../providers/pexels-video-provider.mjs";
import { getStockSuggestions } from "../services/stock-suggestions.service.mjs";
import { reviewStockCandidates } from "../services/stock-review.service.mjs";

export async function fetchStockVideosStep(ctx) {
    const targets = ctx.plan.scenes.filter(scene => ctx.sceneVisualChoices[scene.scene_id] !== 'image' && !ctx.sceneVisuals[scene.scene_id]?.path);
    if (!targets.length) return ctx;
    const provider = new PexelsVideoProvider(ctx);
    const entries = [];
    for (const scene of targets) entries.push({ scene, ...await getStockSuggestions(ctx, scene, 24) });
    const cachePath = path.join(ctx.paths.outDir, 'stock-review.json');
    let cacheIndex = {};
    try { cacheIndex = JSON.parse(fs.readFileSync(cachePath, 'utf8')); } catch { /* first run */ }
    const review = await reviewStockCandidates({ openai: ctx.openai, cacheIndex,
        model: ctx.config.models.referenceScoring || ctx.config.models.planner, entries });
    fs.writeFileSync(cachePath, JSON.stringify(review.index));
    for (const entry of entries) {
        const position = ctx.plan.scenes.findIndex(scene => scene.scene_id === entry.scene.scene_id);
        const neighbors = [ctx.plan.scenes[position - 1], ctx.plan.scenes[position + 1]].filter(Boolean).map(scene => ctx.sceneVisuals[scene.scene_id]);
        const choice = review.selections[entry.scene.scene_id];
        const selected = (choice?.approvedIds || [choice?.selectedId]).map(id => entry.suggestions.find(candidate => String(candidate.id) === String(id)))
            .find(candidate => candidate && !neighbors.some(neighbor => sameFootage({ selectedSuggestionId: candidate.id }, neighbor)));
        if (!selected) throw new Error(`No reviewed stock fits scene ${entry.scene.scene_id}. Provide a relevant reference or revise the visual query.`);
        const outPath = ctx.paths.sceneStockVideo(entry.scene.scene_id);
        await provider.downloadVideoFile(selected.file.link, outPath);
        ctx.sceneVisuals[entry.scene.scene_id] = { type: 'video', path: outPath, source: 'stock', selectedSuggestionId: String(selected.id) };
    }
    return ctx;
}
