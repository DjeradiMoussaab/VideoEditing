import { z } from "zod";
import { QUOTE_STYLES } from "../../../SHARED/quote-styles.mjs";

const STYLE_IDS = QUOTE_STYLES.map((s) => s.id);
const StyleIdSchema = z.enum(STYLE_IDS);

const DecisionSchema = z.array(z.object({
    scene_id: z.number().int().positive(),
    quote_style_id: z.string().min(1)
}));

function catalogText() {
    return QUOTE_STYLES.map((s) => `- ${s.id}: ${s.sceneFit}`).join("\n");
}

// One batched call for every quote scene in the project (same non-chunked pattern as
// quote-timeline-refiner.service.mjs). On any failure this returns {} - the caller's
// existing `quoteStyleId || "classic"` fallback already covers the gap, so a failed
// call here is a no-op, not a regression.
export async function decideQuoteStyles({ openai, model, quoteScenes = [] }) {
    if (!Array.isArray(quoteScenes) || !quoteScenes.length) return {};
    if (!openai || !model) return {};

    const system = `
You are picking the best-fitting quote-card visual style for scenes in a narrated
storytelling video. Each scene will render as bold on-screen text; you choose which of
the following 5 styles fits each scene's content best.

Styles:
${catalogText()}

Input: a JSON array of scenes, each with:
- scene_id
- narration
- quote_text (the exact text that will be displayed)
- hasReferenceBackground (true if a matching photo/clip is already attached to this scene)

Output: return only a valid JSON array, one object per input scene, in the same order:
{
  "scene_id": number,
  "quote_style_id": "typography_focus" | "typography_split" | "modern_clean" | "classic" | "archive"
}

Rules:
1. Only choose typography_split when hasReferenceBackground is true for that scene.
2. Vary the styles across scenes where the content supports it - do not default every
   scene to the same style.
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
                    content: `Now choose styles for these scenes:\n${JSON.stringify(quoteScenes, null, 2)}`
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
            const check = StyleIdSchema.safeParse(v.quote_style_id);
            if (check.success) out[String(v.scene_id)] = check.data;
        }
        return out;
    } catch {
        return {};
    }
}
