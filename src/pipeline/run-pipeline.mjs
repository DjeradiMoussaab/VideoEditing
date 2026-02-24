import { planScenesStep } from "../steps/01-plan-scenes.mjs";
import { generateImagesStep } from "../steps/02-generate-images.mjs";
import { fetchStockVideosStep } from "../steps/02b-fetch-stock-videos.mjs";
import { makeClipsStep } from "../steps/03-make-clips.mjs";
import { concatVisualsStep } from "../steps/04-concat-visuals.mjs";
import { addAudioStep } from "../steps/05-add-audio.mjs";
import { transcribeSrtStep } from "../steps/06-transcribe-srt.mjs";
import { burnSubtitlesStep } from "../steps/07-burn-subtitles.mjs";

export async function runPipeline(ctx) {
    const steps = [
        planScenesStep,
        generateImagesStep,
        fetchStockVideosStep,
        makeClipsStep,
        concatVisualsStep,
        addAudioStep,
        transcribeSrtStep,
        burnSubtitlesStep
    ];

    for (const step of steps) {
        ctx = await step(ctx);
    }

    return ctx;
}
