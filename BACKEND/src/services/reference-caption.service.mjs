import fs from "fs";
import path from "path";

function fileSignature(absPath) {
    const st = fs.statSync(absPath);
    return `${absPath}|${st.size}|${Math.floor(st.mtimeMs)}`;
}

function mimeForPath(absPath) {
    const ext = path.extname(absPath).toLowerCase();
    if (ext === ".png") return "image/png";
    if (ext === ".webp") return "image/webp";
    return "image/jpeg";
}

function asDataUrl(absPath) {
    const mime = mimeForPath(absPath);
    const b64 = fs.readFileSync(absPath).toString("base64");
    return `data:${mime};base64,${b64}`;
}

function parseJsonSafe(txt) {
    try {
        return JSON.parse(txt);
    } catch {
        return null;
    }
}

function fallbackCaption() {
    return {
        caption: "general reference image",
        tags: ["general", "b-roll", "reference"]
    };
}

async function captionSingleImage({ openai, model, absPath }) {
    const dataUrl = asDataUrl(absPath);
    const prompt = [
        "Describe visible subjects, action, setting, objects, mood, framing, and face visibility in at most 65 words. State uncertainty. This description guides story continuity; never infer identity, relationships or unseen events.",
        "Return JSON only:",
        '{"caption":"short sentence","tags":["tag1","tag2","tag3","tag4"]}',
        "No guesses, no people names."
    ].join("\n");

    const res = await openai.chat.completions.create({
        model,
        ...(model === "gpt-6-luna" ? { reasoning_effort: "low" } : {}),
        messages: [
            { role: "system", content: "You produce concise factual image metadata." },
            {
                role: "user",
                content: [
                    { type: "text", text: prompt },
                    { type: "image_url", image_url: { url: dataUrl, detail: "low" } }
                ]
            }
        ],
        response_format: { type: "json_object" }
    });

    const content = String(res?.choices?.[0]?.message?.content || "").trim();
    const parsed = parseJsonSafe(content);
    if (!parsed || typeof parsed !== "object") return fallbackCaption();

    const caption = String(parsed.caption || "").trim() || "general reference image";
    const tags = Array.isArray(parsed.tags)
        ? parsed.tags.map((x) => String(x).trim().toLowerCase()).filter(Boolean).slice(0, 8)
        : [];
    return { caption, tags };
}

export async function buildReferenceCatalogWithCaptions({
    openai,
    model,
    referenceCatalog,
    cacheIndex = {},
    onProgress = () => {}
}) {
    const nextIndex = { ...(cacheIndex || {}) };
    const out = [];

    for (const ref of referenceCatalog || []) {
        const sig = `2|${model}|${fileSignature(ref.path)}`;
        const cached = nextIndex[ref.path];
        if (cached?.signature === sig && cached?.caption && cached.caption !== "general reference image") {
            out.push({
                ...ref,
                caption: String(cached.caption),
                tags: Array.isArray(cached.tags) ? cached.tags : []
            });
            continue;
        }

        let cap = fallbackCaption();
        if (openai) {
            try {
                cap = await captionSingleImage({ openai, model, absPath: ref.path });
            } catch {
                cap = fallbackCaption();
            }
        }

        nextIndex[ref.path] = {
            signature: sig,
            caption: cap.caption,
            tags: cap.tags
        };
        out.push({
            ...ref,
            caption: cap.caption,
            tags: cap.tags
        });
        await onProgress({ index: nextIndex });
    }

    return { catalog: out, index: nextIndex };
}
