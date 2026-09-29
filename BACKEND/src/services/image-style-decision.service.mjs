import { z } from "zod";

const DecisionSchema = z.array(z.object({
    scene_id: z.number().int().positive(),
    style_id: z.string().min(1)
}));

function catalogText(profiles) {
    return Object.entries(profiles)
        .map(([id, profile]) => `- ${id}: ${profile.sceneFit || profile.description || ""}`)
        .join("\n");
}

// One batched call for every image scene in the project. On any failure this returns {}
// - the caller falls back to today's random-per-scene pick for any scene not covered,
// so a failed call here degrades to exactly today's behavior, never a regression.
export async function decideImageAnimationStyles({ openai, model, imageScenes = [], profiles = {} }) {
    const profileIds = Object.keys(profiles);
    if (!Array.isArray(imageScenes) || !imageScenes.length || !profileIds.length) return {};
    if (!openai || !model) return {};

    const StyleIdSchema = z.enum(profileIds);
    const system = `
You are picking the best-fitting image animation treatment for scenes in a narrated
storytelling video. Each scene shows a single photo with motion/framing applied; you
choose which of the following styles fits each scene's narration best.

Styles:
${catalogText(profiles)}

Input: a JSON array of scenes, each with scene_id and narration.

Output: return only a valid JSON array, one object per input scene, in the same order:
{
  "scene_id": number,
  "style_id": string
}
style_id must be exactly one of: ${profileIds.join(", ")}.

Rules:
1. Vary the styles across scenes where the content supports it - do not default every
   scene to the same style, and do not repeat the same style on two consecutive scenes
   unless nothing else fits.
2. Reserve the heaviest/most visually loud historical or vintage styles for genuinely
   standout period/historical beats, not neutral narration.
3. scene_id in the output must match the input exactly, one entry per input scene.
4. Output valid JSON array only, with no explanation.
`.trim();

    try {
        const resp = await openai.chat.completions.create({
            model,
            ...(model === "gpt-6-luna" ? { reasoning_effort: "low" } : {}),
            messages: [
                { role: "system", content: system },
                {
                    role: "user",
                    content: `Now choose styles for these scenes:\n${JSON.stringify(imageScenes, null, 2)}`
                }
            ]
        });

        const parsed = JSON.parse(resp.choices?.[0]?.message?.content || "[]");
        const rawArray = Array.isArray(parsed)
            ? parsed
            : (Array.isArray(parsed?.scenes) ? parsed.scenes : null);
        if (!rawArray) return {};
        const validated = DecisionSchema.parse(rawArray);
        const out = {};
        for (const v of validated) {
            const check = StyleIdSchema.safeParse(v.style_id);
            if (check.success) out[String(v.scene_id)] = check.data;
        }
        return out;
    } catch {
        return {};
    }
}
