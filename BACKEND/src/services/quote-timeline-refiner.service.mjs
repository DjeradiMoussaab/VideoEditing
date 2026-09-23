import { z } from "zod";

const RefinedSceneSchema = z.object({
    scene_id: z.number().int().positive(),
    start_sec: z.number().nonnegative(),
    end_sec: z.number().positive(),
    duration_sec: z.number().positive(),
    narration: z.string(),
    scene_type: z.enum(["normal", "quote"]),
    quote_text: z.union([z.string(), z.null()]).optional()
});

const RefinedTimelineSchema = z.array(RefinedSceneSchema).min(1);

function round3(v) {
    return Number(Number(v || 0).toFixed(3));
}

function cleanText(v) {
    return String(v || "").replace(/\s+/g, " ").trim();
}

function wordCount(v) {
    return cleanText(v).split(" ").filter(Boolean).length;
}

function normalizeFallback(timeline) {
    return timeline.map((s, idx) => {
        const start = round3(s.start_sec);
        const end = round3(s.end_sec);
        return {
            scene_id: idx + 1,
            start_sec: start,
            end_sec: end,
            duration_sec: round3(Math.max(0.001, end - start)),
            narration: cleanText(s.narration),
            scene_type: "normal",
            quote_text: null
        };
    });
}

function validateAndNormalizeRefined(rawScenes, totalAudioSec) {
    const total = Math.max(0.001, Number(totalAudioSec || 0));
    const out = [];

    for (let i = 0; i < rawScenes.length; i++) {
        const s = rawScenes[i];
        const start = round3(Math.max(0, Number(s.start_sec || 0)));
        const endRaw = Number(s.end_sec || start);
        const end = round3(Math.min(total, Math.max(start + 0.001, endRaw)));
        const narration = cleanText(s.narration);
        const sceneType = s.scene_type === "quote" ? "quote" : "normal";
        const quoteTextRaw = sceneType === "quote"
            ? cleanText(s.quote_text || "").replace(/^["“”']|["“”']$/g, "")
            : null;
        const quoteText = sceneType === "quote" ? quoteTextRaw : null;
        const enforceQuote = sceneType === "quote" && wordCount(quoteText) >= 6;

        if (!narration) continue;
        out.push({
            scene_id: i + 1,
            start_sec: start,
            end_sec: end,
            duration_sec: round3(end - start),
            narration,
            scene_type: enforceQuote ? "quote" : "normal",
            quote_text: enforceQuote ? quoteText : null
        });
    }

    // Re-index only; keep model-provided timing unless invalid.
    out.forEach((s, i) => {
        s.scene_id = i + 1;
    });

    return out.filter((s) => s.duration_sec > 0.001);
}

export async function refineTimelineWithQuoteScenes({
    openai,
    model,
    timeline,
    totalAudioSec
}) {
    const fallback = normalizeFallback(timeline);
    if (!Array.isArray(timeline) || !timeline.length) return fallback;
    if (!openai || !model) return fallback;

    const system = `
You are a timeline refiner for narrated storytelling videos.

Input:
A JSON array of scenes. Each scene contains:
- start_sec
- end_sec
- duration_sec
- narration

Task:
Detect whether a scene contains direct spoken speech.
If it does, mark the scene as a quote scene and extract only the spoken words into quote_text.

Output:
Return only a valid JSON array.
Each output item must follow this exact schema:
{
  "scene_id": number,
  "start_sec": number,
  "end_sec": number,
  "duration_sec": number,
  "narration": string,
  "scene_type": "quote" | "normal",
  "quote_text": string | null
}

Rules:
1. Preserve the original number of scenes unless a single input scene contains multiple separate direct quotes that must be split.
2. Do not rewrite, summarize, or invent text.
3. Keep narration exactly as in the input scene.
4. If a scene has no direct spoken quote:
   - scene_type = "normal"
   - quote_text = null
5. If a scene contains direct spoken quote:
   - scene_type = "quote"
   - narration stays exactly unchanged
   - quote_text must contain only the spoken words
   - do not include speaker tags or narration outside the spoken quote in quote_text
6. Example:
   narration: "\\"I'm happy to do that,\\" Adam said."
   output:
   - narration = "\\"I'm happy to do that,\\" Adam said."
   - scene_type = "quote"
   - quote_text = "I'm happy to do that"
7. Detect only direct speech.
8. Direct speech usually appears inside quotation marks.
9. Do not extract indirect speech.
   Examples:
   - She said that she was tired. -> not a quote
   - He told her he would return later. -> not a quote
10. If quotation marks are missing, do not guess unless the text is extremely clearly a direct spoken sentence.
11. quote_text must not contain surrounding quotation marks.
12. scene_id must start at 1 and increase by 1 in output order.
13. Keep start_sec, end_sec, and duration_sec unchanged unless splitting is absolutely necessary.
14. Output valid JSON only, with no explanation.

Special rule for multiple quotes in one scene:
- If one narration contains multiple distinct direct quotes that should be treated separately, you may split that scene into multiple output scenes.
- In that case:
  - preserve original order
  - split timestamps proportionally by character length
  - each split scene must still follow the same schema

Additional direct speech detection rule:
- If narration contains a reporting clause or speech-attribution verb followed by a clearly spoken sentence, treat that sentence as direct speech even when quotation marks are missing.

Examples of speech-attribution verbs include:
said, told, asked, replied, answered, whispered, murmured, muttered, admitted, confessed, shouted, yelled, cried, called, exclaimed, added, continued, began, went on, noted, remarked, stated, announced, explained, insisted, repeated, urged, begged, pleaded, warned, reminded, suggested, offered, promised, swore, joked, laughed, teased, snapped, barked, growled, hissed, sighed, breathed, gasped, stammered, whispered, blurted, declared, observed, commented, mentioned, responded, retorted, protested, agreed, disagreed, boasted, complained, grumbled, mumbled, groaned, moaned, sobbed, wept, prayed, sang, told her, told him, told them, said to her, said to him, said to them.

Important:
- Only extract the spoken words, not the reporting clause.
- If the spoken content is fewer than 6 words, do not mark it as a quote.
- Do not extract indirect speech.
- Do not guess unless the spoken sentence is extremely clear.
`.trim();

    try {
        const resp = await openai.chat.completions.create({
            model,
            ...(model === "gpt-6-luna" ? { reasoning_effort: "low" } : {}),
            messages: [
                { role: "system", content: system },
                {
                    role: "user",
                    content: `Now refine this timeline:\n${JSON.stringify(timeline, null, 2)}`
                }
            ]
        });

        const parsed = JSON.parse(resp.choices?.[0]?.message?.content || "[]");
        const rawArray = Array.isArray(parsed)
            ? parsed
            : (Array.isArray(parsed?.scenes) ? parsed.scenes : null);
        if (!rawArray) return fallback;
        const validated = RefinedTimelineSchema.parse(rawArray);
        const normalized = validateAndNormalizeRefined(validated, totalAudioSec);
        if (!normalized.length) return fallback;
        return normalized;
    } catch {
        return fallback;
    }
}
