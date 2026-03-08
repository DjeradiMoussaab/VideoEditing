import fs from "fs";

function cleanText(t) {
    return String(t ?? "").replace(/\s+/g, " ").trim();
}

function proportionalSliceText({ text, segStart, segEnd, winStart, winEnd }) {
    const normalized = cleanText(text);
    if (!normalized) return "";

    const overlapStart = Math.max(Number(segStart || 0), Number(winStart || 0));
    const overlapEnd = Math.min(Number(segEnd || 0), Number(winEnd || 0));
    if (!(overlapEnd > overlapStart)) return "";

    const words = normalized.split(" ").filter(Boolean);
    if (!words.length) return "";

    const segDur = Math.max(0.001, Number(segEnd || 0) - Number(segStart || 0));
    const overlapDur = overlapEnd - overlapStart;
    const overlapRatio = overlapDur / segDur;

    // Nearly full overlap: keep entire segment text verbatim.
    if (overlapRatio >= 0.96 || words.length <= 2) {
        return normalized;
    }

    const relStart = Math.max(0, Math.min(1, (overlapStart - Number(segStart || 0)) / segDur));
    const relEnd = Math.max(0, Math.min(1, (overlapEnd - Number(segStart || 0)) / segDur));

    let startIdx = Math.floor(relStart * words.length);
    let endIdx = Math.ceil(relEnd * words.length);

    startIdx = Math.max(0, Math.min(words.length - 1, startIdx));
    endIdx = Math.max(startIdx + 1, Math.min(words.length, endIdx));

    return words.slice(startIdx, endIdx).join(" ");
}

function narrationForWindowProportional(segments, winStart, winEnd) {
    const parts = segments
        .filter((s) => Number(s.end) > Number(winStart) && Number(s.start) < Number(winEnd))
        .map((s) =>
            proportionalSliceText({
                text: s.text,
                segStart: s.start,
                segEnd: s.end,
                winStart,
                winEnd
            })
        )
        .filter(Boolean);
    return cleanText(parts.join(" "));
}

function ensureMonotonicSegments(segments) {
    const out = [];
    let lastEnd = 0;

    for (const seg of segments) {
        const text = cleanText(seg.text);
        if (!text) continue;
        const start = Math.max(0, Number(seg.start ?? lastEnd));
        const endRaw = Number(seg.end ?? start);
        const end = Math.max(start + 0.01, endRaw);
        if (end <= lastEnd) continue;
        out.push({ start, end, text });
        lastEnd = end;
    }

    return out;
}

function compactSegments(segments, minChunkSec = 1.25) {
    if (!segments.length) return [];
    const out = [];
    let cur = { ...segments[0] };

    for (let i = 1; i < segments.length; i++) {
        const next = segments[i];
        const curDur = cur.end - cur.start;
        if (curDur < minChunkSec) {
            cur.end = next.end;
            cur.text = cleanText(`${cur.text} ${next.text}`);
            continue;
        }
        out.push(cur);
        cur = { ...next };
    }

    out.push(cur);
    return out;
}

export function buildSceneWindowsFromSegments({
    segments,
    totalAudioSec,
    minSceneSec,
    maxSceneSec
}) {
    const safe = compactSegments(ensureMonotonicSegments(segments));
    if (!safe.length) return [];

    const target = (minSceneSec + maxSceneSec) / 2;
    const total = Math.max(
        Number(totalAudioSec || 0),
        Number(safe[safe.length - 1].end || 0)
    );
    const boundaries = safe.map((s) => Number(s.end));
    const windows = [];
    let cursor = 0;

    while (cursor < total - 0.001) {
        const remaining = total - cursor;
        if (remaining <= maxSceneSec) {
            windows.push({
                start_sec: Number(cursor.toFixed(3)),
                end_sec: Number(total.toFixed(3))
            });
            break;
        }

        const minEnd = cursor + minSceneSec;
        const maxEnd = cursor + maxSceneSec;
        const desiredEnd = cursor + target;

        const candidates = boundaries.filter((b) => b >= minEnd && b <= maxEnd);
        let end = maxEnd;
        if (candidates.length) {
            end = candidates.reduce((best, cur) =>
                Math.abs(cur - desiredEnd) < Math.abs(best - desiredEnd) ? cur : best
            );
        }

        windows.push({
            start_sec: Number(cursor.toFixed(3)),
            end_sec: Number(end.toFixed(3))
        });
        cursor = end;
    }

    for (const w of windows) {
        w.narration = narrationForWindowProportional(safe, w.start_sec, w.end_sec);
        w.duration_sec = Number((w.end_sec - w.start_sec).toFixed(3));
    }

    return windows.filter((w) => w.duration_sec > 0.1);
}

function pickBoundaryEnd(boundaries, minEnd, maxEnd, desiredEnd) {
    const candidates = boundaries.filter((b) => b >= minEnd && b <= maxEnd);
    if (candidates.length) {
        return candidates.reduce((best, cur) =>
            Math.abs(cur - desiredEnd) < Math.abs(best - desiredEnd) ? cur : best
        );
    }
    return null;
}

function clampWindowEnd({ start, desired, minDur, maxDur, total }) {
    const minEnd = start + Math.max(0.6, Number(minDur || 0.6));
    const maxEnd = Math.min(total, start + Math.max(minDur || 0.6, Number(maxDur || minDur || 0.6)));
    if (minEnd >= total) return total;
    const raw = Math.min(total, Math.max(minEnd, Number(desired || minEnd)));
    return Math.max(minEnd, Math.min(maxEnd, raw));
}

export function buildBalancedSceneWindowsFromSegments({
    segments,
    totalAudioSec,
    imageMinSec,
    imageMaxSec,
    videoMinSec,
    videoMaxSec
}) {
    const safe = compactSegments(ensureMonotonicSegments(segments));
    if (!safe.length) return [];

    const total = Math.max(
        Number(totalAudioSec || 0),
        Number(safe[safe.length - 1].end || 0)
    );
    const boundaries = safe.map((s) => Number(s.end));

    const minSceneSec = Math.max(0.8, Math.min(Number(imageMinSec || 0), Number(videoMinSec || 0)));
    const maxSceneSec = Math.max(minSceneSec, Math.max(Number(imageMaxSec || 0), Number(videoMaxSec || 0)));
    const blendedAvg = Math.max(0.8, (minSceneSec + maxSceneSec) / 2);
    const estimatedScenes = Math.max(1, Math.round(total / blendedAvg));

    const windows = [];
    let cursor = 0;

    while (cursor < total - 0.001) {
        const remaining = total - cursor;
        if (remaining <= maxSceneSec && remaining >= minSceneSec) {
            windows.push({
                start_sec: Number(cursor.toFixed(3)),
                end_sec: Number(total.toFixed(3))
            });
            break;
        }

        let end = pickBoundaryEnd(
            boundaries,
            cursor + minSceneSec,
            cursor + maxSceneSec,
            cursor + blendedAvg
        );

        if (end === null) {
            end = clampWindowEnd({
                start: cursor,
                desired: cursor + blendedAvg,
                minDur: minSceneSec,
                maxDur: maxSceneSec,
                total
            });
        }

        if (end <= cursor + 0.001 || !Number.isFinite(end)) {
            end = clampWindowEnd({
                start: cursor,
                desired: cursor + blendedAvg,
                minDur: minSceneSec,
                maxDur: maxSceneSec,
                total
            });
        }

        windows.push({
            start_sec: Number(cursor.toFixed(3)),
            end_sec: Number(end.toFixed(3))
        });
        cursor = end;
    }

    for (const w of windows) {
        w.narration = narrationForWindowProportional(safe, w.start_sec, w.end_sec);
        w.duration_sec = Number((w.end_sec - w.start_sec).toFixed(3));
    }

    return windows.filter((w) => w.duration_sec > 0.1);
}

export async function transcribeWithTimestamps({ openai, model, audioPath }) {
    const file = fs.createReadStream(audioPath);

    try {
        const verbose = await openai.audio.transcriptions.create({
            file,
            model,
            response_format: "verbose_json"
        });
        if (Array.isArray(verbose?.segments) && verbose.segments.length) {
            return verbose.segments;
        }
    } catch (e) {
        // fall through to json attempt
    }

    const file2 = fs.createReadStream(audioPath);
    const json = await openai.audio.transcriptions.create({
        file: file2,
        model,
        response_format: "json"
    });

    if (Array.isArray(json?.segments) && json.segments.length) {
        return json.segments;
    }

    throw new Error(
        `Model "${model}" did not return timestamped segments. Use a transcription model with segment timestamps.`
    );
}
