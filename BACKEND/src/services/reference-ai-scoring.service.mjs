function parseJsonSafe(text) {
    try {
        return JSON.parse(text);
    } catch {
        return null;
    }
}

function clampScore(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0.01;
    return Math.max(0.01, Math.min(0.99, n));
}

function chunkScenes(scenes = [], size = 20) {
    const out = [];
    for (let i = 0; i < scenes.length; i += size) {
        out.push(scenes.slice(i, i + size));
    }
    return out;
}

function normalizeMatches(referenceCatalog = [], matchesById = {}) {
    return referenceCatalog
        .map((ref) => ({
            ...ref,
            score: clampScore(matchesById?.[ref.id]?.score ?? 0.01),
            reason: String(matchesById?.[ref.id]?.reason || "").trim() || null
        }))
        .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}

function buildPrompt({ scenes, references }) {
    return [
        "You score how well each reference image caption matches each scene narration for storytelling video editing.",
        "Return JSON only with this exact schema:",
        '{"scene_scores":[{"scene_id":1,"matches":[{"reference_id":"ref_1","score":0.65,"reason":"short 1-3 sentence justification"}]}]}',
        "",
        "Scoring rules:",
        "- Score range must be from 0.01 to 0.99.",
        "- 0.99 means caption describes narration almost perfectly for visual storytelling.",
        "- Score > 0.50 means this reference can be used for that narration.",
        "- Score <= 0.50 means avoid using that reference for that narration.",
        "- Be pragmatic for storytelling: broad lifestyle/context matches can still score above 0.50.",
        "- No random scoring. Use semantic relevance.",
        "- For every match, include `reason` in 1-3 short sentences explaining why it is a good/bad fit.",
        "- Return only the top 3 best matches per scene in `matches`, sorted by score descending.",
        "",
        "Output requirements:",
        "- Include every scene_id provided.",
        "- Provide only JSON, no markdown, no extra keys.",
        "",
        `Scenes JSON:\n${JSON.stringify(scenes)}`,
        `References JSON:\n${JSON.stringify(references)}`
    ].join("\n");
}

async function scoreChunk({ openai, model, scenes, references }) {
    const prompt = buildPrompt({ scenes, references });
    const res = await openai.chat.completions.create({
        model,
        messages: [
            {
                role: "system",
                content: "You are a strict JSON scorer for scene-to-reference matching."
            },
            {
                role: "user",
                content: prompt
            }
        ],
        response_format: { type: "json_object" }
    });

    const raw = String(res?.choices?.[0]?.message?.content || "").trim();
    const parsed = parseJsonSafe(raw);
    if (!parsed || !Array.isArray(parsed.scene_scores)) {
        throw new Error("Invalid scene scoring response");
    }

    const byScene = {};
    for (const entry of parsed.scene_scores) {
        const sceneId = Number(entry?.scene_id);
        if (!Number.isFinite(sceneId)) continue;
        const matches = Array.isArray(entry?.matches) ? entry.matches.slice(0, 3) : [];
        byScene[sceneId] = matches;
    }
    return byScene;
}

export async function scoreReferencesForScenesWithOpenAI({
    openai,
    model,
    scenes = [],
    referenceCatalog = []
}) {
    if (!openai || !scenes.length || !referenceCatalog.length) return {};

    const scenePayload = scenes.map((s) => ({
        scene_id: Number(s.scene_id),
        narration: String(s.narration || ""),
        visual: String(s.visual || ""),
        image_prompt: String(s.image_prompt || "")
    }));
    const refPayload = referenceCatalog.map((r) => ({
        reference_id: String(r.id),
        filename: String(r.filename || ""),
        caption: String(r.caption || ""),
        tags: Array.isArray(r.tags) ? r.tags.slice(0, 8) : []
    }));

    const chunks = chunkScenes(scenePayload, 20);
    const rawByScene = {};
    for (const chunk of chunks) {
        const scored = await scoreChunk({ openai, model, scenes: chunk, references: refPayload });
        Object.assign(rawByScene, scored);
    }

    const out = {};
    for (const s of scenes) {
        const sceneId = Number(s.scene_id);
        const matches = Array.isArray(rawByScene[sceneId]) ? rawByScene[sceneId] : [];
        const scoreByRefId = {};
        for (const m of matches) {
            const refId = String(m?.reference_id || "");
            if (!refId) continue;
            scoreByRefId[refId] = {
                score: clampScore(m?.score),
                reason: String(m?.reason || "").trim() || null
            };
        }
        const ranked = normalizeMatches(referenceCatalog, scoreByRefId);
        out[sceneId] = {
            matches: ranked,
            primaryAsset: ranked[0] || null
        };
    }

    return out;
}
