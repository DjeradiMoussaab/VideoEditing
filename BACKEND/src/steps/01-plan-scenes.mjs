import { PlanSchema } from "../schemas/plan.schema.mjs";
import {
    buildBalancedSceneWindowsFromSegments,
    transcribeWithTimestamps
} from "../services/voiceover-timeline.service.mjs";

const LOW_QUALITY_CAMERA_STYLE_GUIDE = `
Keeping the same subject, composition, and scene, but make it look like a real photo taken with a very low-quality camera. The image should appear authentic and unedited, as if it was found online. Apply heavy compression artifacts, low resolution (around 480p quality), slight blur, digital noise, grain, washed colors, and reduced sharpness. Add uneven lighting, minor motion blur, and subtle pixelation. The photo should feel casual, imperfect, and realistic, like it was taken quickly with an old smartphone or cheap camera and uploaded to the internet.
`.trim();

function alignPlannerOutputToTimeline(sceneWindows, plannerScenes) {
    const aligned = [];

    for (let i = 0; i < sceneWindows.length; i++) {
        const w = sceneWindows[i];
        const fromModel = plannerScenes?.[i] ?? {};
        aligned.push({
            scene_id: i + 1,
            start_sec: w.start_sec,
            end_sec: w.end_sec,
            duration_sec: w.duration_sec,
            narration: w.narration,
            visual: String(fromModel.visual ?? "").trim() || `Scene ${i + 1}`,
            image_prompt: String(fromModel.image_prompt ?? "").trim()
        });
    }

    return aligned;
}

export async function planScenesStep(ctx) {
    if (ctx.fs.exists(ctx.paths.planJson)) {
        try {
            const json = ctx.fs.readJson(ctx.paths.planJson);
            const mergedStyleGuide = [json?.style_guide ?? "", LOW_QUALITY_CAMERA_STYLE_GUIDE]
                .map((v) => String(v).trim())
                .filter(Boolean)
                .join("\n\n");
            ctx.plan = PlanSchema.parse({
                ...json,
                style_guide: mergedStyleGuide
            });
            ctx.fs.writeJson(ctx.paths.planJson, ctx.plan);
            return ctx;
        } catch {
            // cached plan is from older schema, regenerate
        }
    }

    if (ctx.runOptions.mockOpenAI) {
        if (!ctx.fs.exists(ctx.paths.mockPlanJson)) {
            throw new Error(
                `Mock mode enabled but missing mock plan file: ${ctx.paths.mockPlanJson}`
            );
        }

        const json = ctx.fs.readJson(ctx.paths.mockPlanJson);
        ctx.plan = PlanSchema.parse(json);
        ctx.fs.writeJson(ctx.paths.planJson, ctx.plan);
        return ctx;
    }

    const imageMinSceneSec = Math.max(1, Number(ctx.config.visual?.sceneDurationSec?.image?.min ?? 6));
    const imageMaxSceneSec = Math.max(imageMinSceneSec, Number(ctx.config.visual?.sceneDurationSec?.image?.max ?? 15));
    const videoMinSceneSec = Math.max(1, Number(ctx.config.visual?.sceneDurationSec?.video?.min ?? 6));
    const videoMaxSceneSec = Math.max(videoMinSceneSec, Number(ctx.config.visual?.sceneDurationSec?.video?.max ?? 15));
    const imageRatio = Math.max(0, Math.min(1, Number(ctx.config.visual?.decision?.imageRatio ?? 0.6)));
    const totalAudioSec = ctx.ffmpeg.getAudioDurationSeconds(ctx.paths.voiceMp3);
    const segments = await transcribeWithTimestamps({
        openai: ctx.openai,
        model: ctx.config.models.transcribe,
        audioPath: ctx.paths.voiceMp3
    });
    const sceneWindows = buildBalancedSceneWindowsFromSegments({
        segments,
        totalAudioSec,
        imageMinSec: imageMinSceneSec,
        imageMaxSec: imageMaxSceneSec,
        videoMinSec: videoMinSceneSec,
        videoMaxSec: videoMaxSceneSec,
        imageRatio
    });

    if (!sceneWindows.length) {
        throw new Error("Could not build scene timeline from voiceover transcript.");
    }

    if (sceneWindows.length > ctx.config.scenes.max) {
        throw new Error(
            `Timeline produced ${sceneWindows.length} scenes, exceeds configured max ${ctx.config.scenes.max}. Increase config.scenes.max.`
        );
    }
    const boundedWindows = sceneWindows;
    ctx.sceneTypeHints = Object.fromEntries(
        boundedWindows.map((w, i) => [i + 1, w.preferred_type === "image" ? "image" : "video"])
    );
    ctx.fs.writeJson(ctx.paths.sceneTimelineJson, boundedWindows);

    const system = `
You are a video producer for narrated videos.
You will receive voiceover chunks with exact timestamps.
Keep each chunk's narration as-is and provide top-tier visual direction + highly specific image prompt for each scene.
Each image prompt must maximize character consistency across scenes and include:
- Character identity details (age, face, hair, skin tone, clothing)
- Environment details (place, objects, weather, time of day)
- Camera/lens/framing details
- Lighting/color/texture details
- Action/body language/emotion
- Continuity constraints (same person, same outfit unless narration implies change)
- Negative constraints (no text, no watermark, no logo, no deformations)

Return JSON only with:
{
  "title": string,
  "style_guide": string,
  "scenes": [
    { "scene_id": number, "visual": string, "image_prompt": string }
  ]
}

Rules:
- Keep scene count exactly equal to the provided timeline length.
- scene_id must match provided ids.
- Visuals must strictly align with each scene narration chunk.
- style_guide must include this exact directive:
${LOW_QUALITY_CAMERA_STYLE_GUIDE}
`.trim();

    const timelineInput = boundedWindows.map((w, i) => ({
        scene_id: i + 1,
        start_sec: w.start_sec,
        end_sec: w.end_sec,
        duration_sec: w.duration_sec,
        narration: w.narration
    }));

    const resp = await ctx.openai.chat.completions.create({
        model: ctx.config.models.planner,
        messages: [
            { role: "system", content: system },
            {
                role: "user",
                content: JSON.stringify(
                    {
                        scene_timeline: timelineInput
                    },
                    null,
                    2
                )
            }
        ],
        response_format: { type: "json_object" }
    });

    const raw = JSON.parse(resp.choices[0].message.content);
    const alignedScenes = alignPlannerOutputToTimeline(boundedWindows, raw.scenes);
    const mergedStyleGuide = [raw.style_guide ?? "", LOW_QUALITY_CAMERA_STYLE_GUIDE]
        .map((v) => String(v).trim())
        .filter(Boolean)
        .join("\n\n");
    const json = {
        title: raw.title ?? "Untitled",
        style_guide: mergedStyleGuide,
        scenes: alignedScenes
    };
    ctx.plan = PlanSchema.parse(json);
    ctx.fs.writeJson(ctx.paths.planJson, ctx.plan);

    return ctx;
}
