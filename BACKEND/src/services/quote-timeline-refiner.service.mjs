import { z } from "zod";

const ScoredSceneSchema = z.object({
    scene_id: z.number().int().positive(),
    quote_score: z.number().min(0).max(1),
    quote_text: z.union([z.string(), z.null()]).optional()
});

const ScoredTimelineSchema = z.array(ScoredSceneSchema).min(1);

const DEFAULT_QUOTE_RATIO = { min: 0.10, max: 0.20, target: 0.15 };
const MIN_QUOTE_SCORE = 0.35;
const MIN_QUOTE_WORDS = 5;

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
    }).filter((s) => s.duration_sec > 0.001);
}

// Quote-worthiness is scored by the model per scene, but *how many* scenes actually
// become quotes is decided deterministically here - LLMs are unreliable at hitting an
// exact quota (especially across dozens/hundreds of scenes), so the model only ranks
// candidates and this picks the top N within the configured [min, max] share of the
// total scene count.
function clampQuoteTarget(total, ratio) {
    const target = Math.round(total * Number(ratio.target ?? DEFAULT_QUOTE_RATIO.target));
    const min = Math.floor(total * Number(ratio.min ?? DEFAULT_QUOTE_RATIO.min));
    const max = Math.ceil(total * Number(ratio.max ?? DEFAULT_QUOTE_RATIO.max));
    return Math.max(min, Math.min(max, target));
}

export function selectQuoteScenes(scoredScenes, timeline, quoteRatio = DEFAULT_QUOTE_RATIO) {
    const base = normalizeFallback(timeline);
    const scoreById = new Map(scoredScenes.map((s) => [Number(s.scene_id), s]));

    const eligible = [];
    for (const scene of base) {
        const scored = scoreById.get(scene.scene_id);
        if (!scored) continue;
        const quoteText = cleanText(scored.quote_text || "").replace(/^["“”']|["“”']$/g, "");
        const score = Number(scored.quote_score || 0);
        if (score >= MIN_QUOTE_SCORE && wordCount(quoteText) >= MIN_QUOTE_WORDS) {
            eligible.push({ scene_id: scene.scene_id, score, quoteText });
        }
    }
    eligible.sort((a, b) => b.score - a.score);

    const target = Math.min(eligible.length, clampQuoteTarget(base.length, quoteRatio));
    const chosen = new Map(eligible.slice(0, target).map((e) => [e.scene_id, e.quoteText]));

    return base.map((scene) => chosen.has(scene.scene_id)
        ? { ...scene, scene_type: "quote", quote_text: chosen.get(scene.scene_id) }
        : scene);
}

export async function refineTimelineWithQuoteScenes({
    openai,
    model,
    timeline,
    totalAudioSec,
    quoteRatio = DEFAULT_QUOTE_RATIO
}) {
    const fallback = normalizeFallback(timeline);
    if (!Array.isArray(timeline) || !timeline.length) return fallback;
    if (!openai || !model) return fallback;

    const system = `
You are scoring scenes in a narrated storytelling video for how well each would work as
an on-screen "quote card" moment - a beat where the video cuts to bold text (a short line
or quote) instead of regular footage.

Input:
A JSON array of scenes. Each scene contains:
- scene_id
- start_sec
- end_sec
- duration_sec
- narration

Task:
Score EVERY input scene for quote-worthiness. Do not decide which scenes become quotes -
another process picks the best-scoring ones afterward. Just score honestly and consistently.

Output:
Return only a valid JSON array, one object per input scene, in the same order:
{
  "scene_id": number,
  "quote_score": number,
  "quote_text": string | null
}

Score highly (close to 1) when the narration:
- Is direct spoken dialogue (quotation marks, or a clear speech-attribution verb such as
  said/told/asked/replied/whispered/admitted/explained followed by a clearly spoken sentence)
- Is a strong standalone statement, realization, or emotional turning point that reads
  powerfully as isolated text, even without surrounding context
- Centers on introducing or describing one specific person, place, or object in a way that
  would pair well with a photo of that person/place/object shown beside the text
- Is a memorable, quotable line - something worth pulling out and highlighting on its own

Score low (close to 0) when the narration is:
- Purely descriptive or transitional connective tissue with no standalone impact
- Too short or fragmentary to read well alone (under about 5 words)
- Only makes sense together with the surrounding scenes, not by itself

quote_text:
- If quote_score is 0.4 or higher, give the exact text to display:
  - for direct dialogue: only the spoken words, no attribution, no surrounding quotation marks
  - otherwise: the single most quotable exact excerpt from the narration, or a lightly
    trimmed version of it - never invent new wording or rephrase
- If quote_score is below 0.4, set quote_text to null.

Rules:
1. Score every scene given, exactly once, same scene_id as the input.
2. Do not rewrite, summarize, or invent narration text.
3. Do not merge, split, or reorder scenes.
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
                    content: `Now score this timeline:\n${JSON.stringify(timeline, null, 2)}`
                }
            ]
        });

        const parsed = JSON.parse(resp.choices?.[0]?.message?.content || "[]");
        const rawArray = Array.isArray(parsed)
            ? parsed
            : (Array.isArray(parsed?.scenes) ? parsed.scenes : null);
        if (!rawArray) return fallback;
        const validated = ScoredTimelineSchema.parse(rawArray);
        const selected = selectQuoteScenes(validated, timeline, quoteRatio);
        return selected.length ? selected : fallback;
    } catch {
        return fallback;
    }
}
