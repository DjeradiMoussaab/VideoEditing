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
        const fromHints = ctx.sceneTypeHints && typeof ctx.sceneTypeHints === "object"
            ? Object.fromEntries(
                ctx.plan.scenes.map((s) => [
                    s.scene_id,
                    ctx.sceneTypeHints[s.scene_id] === "image" ? "image" : "video"
                ])
            )
            : null;
        ctx.sceneVisualChoices = fromHints || decideSceneVisualTypes(ctx.plan.scenes, ctx.config);
        return ctx;
    }

    throw new Error(`Unsupported visual source mode: ${mode}`);
}
