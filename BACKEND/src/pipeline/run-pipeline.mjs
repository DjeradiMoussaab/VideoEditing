import { assertNoConsecutiveFootage } from '../services/footage-continuity.service.mjs';
import { matchReferencesStep } from '../steps/02c-match-references.mjs';
import { planScenesStep } from "../steps/01-plan-scenes.mjs";
import { prepareReferenceImagesStep } from "../steps/02-prepare-reference-images.mjs";
import { decideSceneVisualsStep } from "../steps/02a-decide-scene-visuals.mjs";
import { fetchStockVideosStep } from "../steps/02b-fetch-stock-videos.mjs";
import { makeClipsStep } from "../steps/03-make-clips.mjs";
import { concatVisualsStep } from "../steps/04-concat-visuals.mjs";
import { addAudioStep } from "../steps/05-add-audio.mjs";

export async function runPipeline(ctx) {
    const steps = [
        planScenesStep,
        decideSceneVisualsStep,
        matchReferencesStep,
        fetchStockVideosStep,
        prepareReferenceImagesStep,
        async ctx => {
            assertNoConsecutiveFootage(ctx.plan.scenes.map(scene => ({ ...scene, ...ctx.sceneVisuals[scene.scene_id] })));
            return ctx;
        },
        makeClipsStep,
        concatVisualsStep,
        addAudioStep
    ];

    for (const step of steps) {
        ctx = await step(ctx);
    }

    return ctx;
}
