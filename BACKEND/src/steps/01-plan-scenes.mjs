import { PlanSchema } from "../schemas/plan.schema.mjs";
import {
    buildBalancedSceneWindowsFromSegments,
    transcribeWithTimestamps
} from "../services/voiceover-timeline.service.mjs";
import { refineTimelineWithQuoteScenes } from "../services/quote-timeline-refiner.service.mjs";

const LOW_QUALITY_CAMERA_STYLE_GUIDE = `
Keeping the same subject, composition, and scene, but make it look like a real photo taken with a very low-quality camera. The image should appear authentic and unedited, as if it was found online. Apply heavy compression artifacts, low resolution (around 480p quality), slight blur, digital noise, grain, washed colors, and reduced sharpness. Add uneven lighting, minor motion blur, and subtle pixelation. The photo should feel casual, imperfect, and realistic, like it was taken quickly with an old smartphone or cheap camera and uploaded to the internet.
`.trim();

function normalizeVisualQuery(value, fallback = "story detail") {
    const raw = String(value || "").toLowerCase().trim();
    if (!raw) return fallback;

    // Keep only one concept by cutting at common joiners.
    const oneConcept = raw
        .split(/\b(?:and|with|while|then|plus|also|as)\b|[,;/|]/i)[0]
        .trim();

    const cleaned = oneConcept
        .replace(/[^a-z0-9\s-]/g, " ")
        .replace(/\s+/g, " ")
        .trim();

    const words = cleaned.split(" ").filter(Boolean).slice(0, 4);
    if (!words.length) return fallback;
    return words.join(" ");
}

function alignPlannerOutputToTimeline(sceneWindows, plannerScenes) {
    const aligned = [];

    for (let i = 0; i < sceneWindows.length; i++) {
        const w = sceneWindows[i];
        const fromModel = plannerScenes?.[i] ?? {};
        const sceneId = Number(w?.scene_id ?? i + 1);
        aligned.push({
            scene_id: sceneId,
            start_sec: w.start_sec,
            end_sec: w.end_sec,
            duration_sec: w.duration_sec,
            narration: w.narration,
            visual: normalizeVisualQuery(String(fromModel.visual ?? "").trim(), `scene ${sceneId}`),
            image_prompt: w.scene_type === "quote" ? "" : String(fromModel.image_prompt ?? "").trim(),
            scene_type: w.scene_type === "quote" ? "quote" : undefined,
            quote_text: w.scene_type === "quote" ? String(w.quote_text || w.narration || "").trim() : null
        });
    }

    return aligned;
}

async function generatePlannerChunk({ ctx, systemPrompt, timelineChunk }) {
    const resp = await ctx.openai.chat.completions.create({
        model: ctx.config.models.planner,
        messages: [
            { role: "system", content: systemPrompt },
            {
                role: "user",
                content: JSON.stringify(
                    {
                        scene_timeline: timelineChunk
                    },
                    null,
                    2
                )
            }
        ],
        response_format: { type: "json_object" }
    });

    const raw = JSON.parse(resp.choices[0].message.content);
    return {
        title: String(raw?.title || "Untitled"),
        styleGuide: String(raw?.style_guide || ""),
        scenes: Array.isArray(raw?.scenes) ? raw.scenes : []
    };
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
        videoMaxSec: videoMaxSceneSec
    });

    if (!sceneWindows.length) {
        throw new Error("Could not build scene timeline from voiceover transcript.");
    }

    if (sceneWindows.length > ctx.config.scenes.max) {
        throw new Error(
            `Timeline produced ${sceneWindows.length} scenes, exceeds configured max ${ctx.config.scenes.max}. Increase config.scenes.max.`
        );
    }
    const initialTimeline = sceneWindows.map((w, i) => ({
        scene_id: i + 1,
        start_sec: w.start_sec,
        end_sec: w.end_sec,
        duration_sec: w.duration_sec,
        narration: w.narration
    }));
    const quoteDetectionEnabled = ctx.runOptions?.useQuoteDetection !== false;
    const boundedWindows = quoteDetectionEnabled
        ? await refineTimelineWithQuoteScenes({
            openai: ctx.openai,
            model: ctx.config.models?.quoteRefiner || ctx.config.models?.planner,
            timeline: initialTimeline,
            totalAudioSec
        })
        : initialTimeline.map((w) => ({
            ...w,
            scene_type: "normal",
            quote_text: null
        }));
    ctx.sceneTypeHints = Object.fromEntries(
        boundedWindows.map((w) => [Number(w.scene_id), w.scene_type === "quote" ? "quote" : "normal"])
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
- "visual" is NOT a sentence. It is a stock-video search query of 2-4 words only.
- "visual" must describe ONE strongest visible idea from the narration chunk.
- Never combine two ideas in one query. Pick one.
- If narration has multiple ideas, choose the single most filmable visual moment.
- Always prefer generic, reusable storytelling b-roll that can fit many edits.
- Avoid highly specific identity details (exact faces, names, famous places, unique events).
- Favor broad context shots, actions, objects, and moods over literal one-off reenactments.
- Choose safe, non-misleading visuals: suggestive context, not over-precise claims.
- No style/filler words (cinematic, aesthetic, beautiful, professional, broll, shot).
- Prefer concrete nouns/actions that help stock search relevance.
- Output lowercase only for "visual".
- Strong preference order for stock query style:
  1) close-up detail shots (eyes, hands, face, phone, steering wheel)
  2) generic human actions (walking, driving, typing, hugging, crying)
  3) broad environment/context (hospital corridor, classroom, street night)
  4) neutral object/context shots (photo album, envelope, document, window)
- Avoid specific story claims in query (no accusations/events that are too literal).
- Do not include character names, exact places, or unique identifiers.
- Good generic forms you should often use:
  - "close up man eye"
  - "close up woman face"
  - "man driving"
  - "kids playing"
  - "woman crying"
  - "hands close up"
  - "phone chat"
  - "child by window"
  - "hospital corridor"
  - "document office"
- Examples:
  - narration: "she stared at the family photo and realized everything had changed"
    valid visual: "photo album"
  - narration: "the detective opened the old drawer and found a bloodstained letter"
    valid visual: "document office"
  - narration: "he drove through the rain at midnight, replaying her last message"
    valid visual: "driving night" or "rain night"
  - narration: "the child waited alone by the window for her mother to come home"
    valid visual: "child by window"
  - narration: "they signed the contract with smiles, hiding their fear"
    valid visual: "signing contract" or "document contract"
  - narration: "at sunrise, the fisherman pushed his boat into the foggy lake"
    valid visual: "boat sunrise"
  - narration: "she deleted every photo of him, but kept one in a hidden folder"
    valid visual: "folder office"
  - narration: "the nurse rushed down the hospital corridor as alarms rang"
    valid visual: "nurse hospital"
  - narration: "he watched the empty classroom where they first met"
    valid visual: "empty classroom"
  - narration: "the court went silent when the witness said his name"
    valid visual: "courtroom witness"
  - narration: "she packed a suitcase in silence while the baby slept"
    valid visual: "packing suitcase"
  - narration: "the brothers stood at their father’s grave under gray skies"
    valid visual: "cemetery brothers"
  - narration: "he scrolled through old chats, searching for one clue"
    valid visual: "phone chat"
  - narration: "the couple held hands in the car before entering the clinic"
    valid visual: "couple hands car"
  - narration: "she opened the envelope and her face went pale"
    valid visual: "opening envelope"
  - narration: "police lights reflected on wet pavement outside the apartment"
    valid visual: "police lights night"
  - narration: "he sat on the rooftop at night, questioning every decision"
    valid visual: "man thinking night"
  - narration: "the teacher noticed bruises and gently asked if she was okay"
    valid visual: "teacher conversation"
  - narration: "she locked the door, turned off the lights, and finally cried"
    valid visual: "woman crying"
  - narration: "at the airport gate, they hugged like it was the last time"
    valid visual: "airport goodbye hug"
  - narration: "mom with her kid in backseat is driving"
    valid visual: "car driving" OR "woman face closeup"
    invalid visual: "woman driving with kid"
  - narration: "she installed a hidden camera and called police"
    valid visual: "hidden camera" or "police"
    invalid visual: "hidden camera police call"
- style_guide must include this exact directive:
${LOW_QUALITY_CAMERA_STYLE_GUIDE}
`.trim();

    const timelineInput = boundedWindows.map((w, i) => ({
        scene_id: i + 1,
        start_sec: w.start_sec,
        end_sec: w.end_sec,
        duration_sec: w.duration_sec,
        narration: w.narration,
        scene_type: w.scene_type === "quote" ? "quote" : "normal",
        quote_text: w.scene_type === "quote" ? String(w.quote_text || w.narration || "").trim() : null
    }));

    const CHUNK_SIZE = 40;
    const alignedScenes = [];
    const chunkTitles = [];
    const chunkStyleGuides = [];

    for (let start = 0; start < timelineInput.length; start += CHUNK_SIZE) {
        const end = Math.min(timelineInput.length, start + CHUNK_SIZE);
        const timelineChunk = timelineInput.slice(start, end);
        const windowChunk = boundedWindows.slice(start, end);

        const chunk = await generatePlannerChunk({
            ctx,
            systemPrompt: system,
            timelineChunk
        });
        chunkTitles.push(chunk.title);
        chunkStyleGuides.push(chunk.styleGuide);

        const alignedChunk = alignPlannerOutputToTimeline(windowChunk, chunk.scenes);
        alignedScenes.push(...alignedChunk);
    }

    const mergedStyleGuide = [chunkStyleGuides.find(Boolean) ?? "", LOW_QUALITY_CAMERA_STYLE_GUIDE]
        .map((v) => String(v).trim())
        .filter(Boolean)
        .join("\n\n");
    const json = {
        title: chunkTitles.find(Boolean) ?? "Untitled",
        style_guide: mergedStyleGuide,
        scenes: alignedScenes
    };
    ctx.plan = PlanSchema.parse(json);
    ctx.fs.writeJson(ctx.paths.planJson, ctx.plan);

    return ctx;
}
