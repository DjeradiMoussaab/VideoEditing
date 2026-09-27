import fs from 'node:fs';
import path from 'node:path';
import { buildReferenceCatalog } from '../services/reference-matching.service.mjs';
import { buildReferenceCatalogWithCaptions } from '../services/reference-caption.service.mjs';
import { scoreReferencesForScenesWithOpenAI } from '../services/reference-ai-scoring.service.mjs';
import { buildSceneAllocation } from '../services/scene-allocation.service.mjs';

// CLI uses the same reference-first decisions as the editable draft workflow.
export async function matchReferencesStep(ctx) {
    if (ctx.visualSourceMode === 'stock_video' || (ctx.runOptions.useTestImages || ctx.runOptions.mockOpenAI)) return ctx;
    const cachePath = path.join(ctx.paths.outDir, 'reference-analysis.json');
    let cache = {};
    try { cache = JSON.parse(fs.readFileSync(cachePath, 'utf8')); } catch { /* first run */ }
    const captioned = await buildReferenceCatalogWithCaptions({ openai: ctx.openai,
        model: ctx.config.models.referenceCaption || ctx.config.models.planner,
        referenceCatalog: buildReferenceCatalog(ctx.referenceImages || []), cacheIndex: cache.captions });
    const scored = await scoreReferencesForScenesWithOpenAI({ openai: ctx.openai,
        model: ctx.config.models.referenceScoring || ctx.config.models.planner,
        scenes: ctx.plan.scenes, referenceCatalog: captioned.catalog, cacheIndex: cache.scores,
        transitionPaddingSec: Number(ctx.config.video.transitionDuration || 0) });
    fs.writeFileSync(cachePath, JSON.stringify({ captions: captioned.index, scores: scored.index }));
    const allocation = buildSceneAllocation({ scenes: ctx.plan.scenes, initialChoices: ctx.sceneVisualChoices,
        referenceCatalog: captioned.catalog, referencePlan: scored.plan, config: ctx.config });
    ctx.sceneVisualChoices = allocation.sceneChoices;
    for (const [id, assetPath] of Object.entries(allocation.sceneAssetPaths)) {
        ctx.sceneVisuals[id] = { type: allocation.sceneChoices[id], path: assetPath, source: allocation.sceneSourceMap[id] };
    }
    return ctx;
}
