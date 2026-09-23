import { createHash } from "crypto";

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

function estimateTokensFromString(text) {
    return Math.max(1, Math.ceil(String(text || "").length / 4));
}

function hashObject(value) {
    return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function compactReason(value) {
    return String(value || "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 280) || null;
}

function normalizeMatches(referenceCatalog = [], matchesById = {}) {
    return referenceCatalog
        .map((ref) => ({
            ...ref,
            score: clampScore(matchesById?.[ref.id]?.score ?? 0.01),
            reason: compactReason(matchesById?.[ref.id]?.reason)
        }))
        .sort((a, b) => {
            const delta = Number(b.score || 0) - Number(a.score || 0);
            if (Math.abs(delta) > 1e-9) return delta;
            // Randomize ties so same-score matches are not always shown in the same order.
            return Math.random() < 0.5 ? -1 : 1;
        });
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
        "- Score every supplied reference image for each scene, sorted by score descending.",
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
        ...(model === "gpt-6-luna" ? { reasoning_effort: "low" } : {}),
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
        const matches = Array.isArray(entry?.matches) ? entry.matches : [];
        byScene[sceneId] = matches;
    }
    return byScene;
}

function estimateInputTokensForChunks(scenes = [], references = []) {
    let total = 0;
    const chunks = chunkScenes(scenes, 20);
    for (const chunk of chunks) {
        const prompt = buildPrompt({ scenes: chunk, references });
        total += estimateTokensFromString(prompt);
    }
    return total;
}

function estimateOutputTokensForSceneCount(sceneCount, referenceCount) {
    // Compact reference scores and short reasons for every supplied image.
    return Math.max(0, Math.round(Number(sceneCount || 0) * referenceCount * 30));
}

export async function scoreReferencesForScenesWithOpenAI({
    openai,
    model,
    scenes = [],
    referenceCatalog = [],
    cacheIndex = {},
    sceneIdsToScore = null
}) {
    if (!scenes.length || !referenceCatalog.length) return { plan: {}, index: cacheIndex || {}, stats: { fromCache: 0, rescored: 0, totalScoped: 0 } };

    const nextIndex = { ...(cacheIndex || {}) };
    const scopedIdSet = sceneIdsToScore === null
        ? null
        : new Set((sceneIdsToScore || []).map((x) => String(x)));
    const scenePayload = scenes.map((s) => ({
        scene_id: Number(s.scene_id),
        narration: String(s.narration || ""),
        visual: String(s.visual || "")
    }));
    const refPayload = referenceCatalog.map((r) => ({
        reference_id: String(r.id),
        caption: String(r.caption || "")
    }));

    const refsSignature = hashObject({
        scoringVersion: 2,
        model: String(model || ""),
        references: refPayload
    });

    const rawByScene = {};
    const toScorePayload = [];
    let fromCache = 0;
    for (const s of scenePayload) {
        const sceneId = String(s.scene_id);
        const inScope = scopedIdSet ? scopedIdSet.has(sceneId) : true;
        if (!inScope) continue;
        const sceneSignature = hashObject({ narration: s.narration, visual: s.visual });
        const cacheKey = `${model}|${refsSignature}|${sceneSignature}`;
        const cached = nextIndex[cacheKey];
        if (cached?.sceneId === Number(sceneId) && Array.isArray(cached?.matches)) {
            rawByScene[sceneId] = cached.matches;
            fromCache += 1;
        } else {
            toScorePayload.push({ ...s, __cacheKey: cacheKey });
        }
    }

    if (openai && toScorePayload.length) {
        const chunks = chunkScenes(toScorePayload, 20);
        for (const chunk of chunks) {
            const chunkScenesPayload = chunk.map(({ __cacheKey, ...scene }) => scene);
            const scored = await scoreChunk({ openai, model, scenes: chunkScenesPayload, references: refPayload });
            for (const scene of chunk) {
                const sid = String(scene.scene_id);
                const matches = Array.isArray(scored?.[scene.scene_id]) ? scored[scene.scene_id] : [];
                rawByScene[sid] = matches;
                nextIndex[scene.__cacheKey] = {
                    sceneId: Number(scene.scene_id),
                    refsSignature,
                    model: String(model || ""),
                    matches: matches.map((m) => ({
                        reference_id: String(m?.reference_id || ""),
                        score: clampScore(m?.score),
                        reason: compactReason(m?.reason)
                    }))
                };
            }
        }
    }

    const scopedScenes = scenePayload.filter((s) => (scopedIdSet ? scopedIdSet.has(String(s.scene_id)) : true));
    const rescoredScenes = toScorePayload.map(({ __cacheKey, ...scene }) => scene);
    const baselineInputTokens = estimateInputTokensForChunks(scopedScenes, refPayload);
    const actualInputTokens = estimateInputTokensForChunks(rescoredScenes, refPayload);
    const baselineOutputTokens = estimateOutputTokensForSceneCount(scopedScenes.length, refPayload.length);
    const actualOutputTokens = estimateOutputTokensForSceneCount(rescoredScenes.length, refPayload.length);
    const savedInputTokens = Math.max(0, baselineInputTokens - actualInputTokens);
    const savedOutputTokens = Math.max(0, baselineOutputTokens - actualOutputTokens);

    const plan = {};
    for (const s of scenes) {
        const sceneId = Number(s.scene_id);
        const inScope = scopedIdSet ? scopedIdSet.has(String(sceneId)) : true;
        if (!inScope) {
            const ranked = normalizeMatches(referenceCatalog, {});
            plan[sceneId] = {
                matches: ranked,
                primaryAsset: ranked[0] || null
            };
            continue;
        }
        const matches = Array.isArray(rawByScene[sceneId]) ? rawByScene[sceneId] : [];
        const scoreByRefId = {};
        for (const m of matches) {
            const refId = String(m?.reference_id || "");
            if (!refId) continue;
            scoreByRefId[refId] = {
                score: clampScore(m?.score),
                reason: compactReason(m?.reason)
            };
        }
        const ranked = normalizeMatches(referenceCatalog, scoreByRefId);
        plan[sceneId] = {
            matches: ranked,
            primaryAsset: ranked[0] || null
        };
    }

    return {
        plan,
        index: nextIndex,
        stats: {
            fromCache,
            rescored: toScorePayload.length,
            totalScoped: scopedIdSet ? scopedIdSet.size : scenes.length,
            tokenEstimates: {
                baselineInputTokens,
                actualInputTokens,
                savedInputTokens,
                baselineOutputTokens,
                actualOutputTokens,
                savedOutputTokens,
                baselineTotalTokens: baselineInputTokens + baselineOutputTokens,
                actualTotalTokens: actualInputTokens + actualOutputTokens,
                savedTotalTokens: savedInputTokens + savedOutputTokens
            }
        }
    };
}
