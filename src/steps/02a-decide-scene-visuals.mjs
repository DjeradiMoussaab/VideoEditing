import { decideSceneVisualTypes } from "../services/scene-visual-decision.service.mjs";

export async function decideSceneVisualsStep(ctx) {
    const mode = ctx.visualSourceMode;

    if (mode === "image_frame") {
        for (const s of ctx.plan.scenes) ctx.sceneVisualChoices[s.scene_id] = "image";
        return ctx;
    }

    if (mode === "stock_video") {
        for (const s of ctx.plan.scenes) ctx.sceneVisualChoices[s.scene_id] = "video";
        return ctx;
    }

    if (mode === "hybrid" || mode === "mixed_random") {
        ctx.sceneVisualChoices = decideSceneVisualTypes(ctx.plan.scenes, ctx.config);
        return ctx;
    }

    throw new Error(`Unsupported visual source mode: ${mode}`);
}
