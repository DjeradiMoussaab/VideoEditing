import {isTextScene} from '../../../SHARED/quote-styles.mjs';
import { decideSceneVisualTypes } from "../services/scene-visual-decision.service.mjs";

export async function decideSceneVisualsStep(ctx) {
    const mode = ctx.visualSourceMode;
    const isQuote = (sceneId) => isTextScene(ctx.sceneTypeHints?.[sceneId]);

    if (mode === "image_frame") {
        for (const s of ctx.plan.scenes) {
            ctx.sceneVisualChoices[s.scene_id] = isQuote(s.scene_id) ? ctx.sceneTypeHints[s.scene_id] : "image";
        }
        return ctx;
    }

    if (mode === "stock_video") {
        for (const s of ctx.plan.scenes) {
            ctx.sceneVisualChoices[s.scene_id] = isQuote(s.scene_id) ? ctx.sceneTypeHints[s.scene_id] : "video";
        }
        return ctx;
    }

    if (mode === "hybrid" || mode === "mixed_random") {
        const decided = decideSceneVisualTypes(ctx.plan.scenes, ctx.config);
        for (const s of ctx.plan.scenes) {
            if (isQuote(s.scene_id)) {
                decided[s.scene_id] = ctx.sceneTypeHints[s.scene_id];
            }
        }
        ctx.sceneVisualChoices = decided;
        return ctx;
    }

    throw new Error(`Unsupported visual source mode: ${mode}`);
}
