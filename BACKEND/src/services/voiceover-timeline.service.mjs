import fs from "fs";

function cleanText(t) {
    return String(t ?? "").replace(/\s+/g, " ").trim();
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
        const text = safe
            .filter((s) => s.end > w.start_sec && s.start < w.end_sec)
            .map((s) => s.text)
            .join(" ");
        w.narration = cleanText(text);
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

function normalizedImageRatio(raw) {
    const n = Number(raw);
    if (!Number.isFinite(n)) return 0.6;
    return Math.max(0, Math.min(1, n));
}

export function buildBalancedSceneWindowsFromSegments({
    segments,
    totalAudioSec,
    imageMinSec,
    imageMaxSec,
    videoMinSec,
    videoMaxSec,
    imageRatio = 0.6
}) {
    const safe = compactSegments(ensureMonotonicSegments(segments));
    if (!safe.length) return [];

    const ratio = normalizedImageRatio(imageRatio);
    const total = Math.max(
        Number(totalAudioSec || 0),
        Number(safe[safe.length - 1].end || 0)
    );
    const boundaries = safe.map((s) => Number(s.end));

    const imageAvg = (imageMinSec + imageMaxSec) / 2;
    const videoAvg = (videoMinSec + videoMaxSec) / 2;
    const blendedAvg = Math.max(0.8, imageAvg * ratio + videoAvg * (1 - ratio));
    const estimatedScenes = Math.max(1, Math.round(total / blendedAvg));
    const targetImages = Math.max(0, Math.min(estimatedScenes, Math.round(estimatedScenes * ratio)));

    const windows = [];
    let cursor = 0;
    let imageCount = 0;

    while (cursor < total - 0.001) {
        const idx = windows.length;
        const remaining = total - cursor;
        const remainingScenesEstimate = Math.max(1, estimatedScenes - idx);
        const remainingImageTarget = Math.max(0, targetImages - imageCount);
        const desiredType = remainingImageTarget / remainingScenesEstimate >= 0.5 ? "image" : "video";

        const preferredRange = desiredType === "image"
            ? { min: imageMinSec, max: imageMaxSec, target: imageAvg }
            : { min: videoMinSec, max: videoMaxSec, target: videoAvg };
        const otherRange = desiredType === "image"
            ? { min: videoMinSec, max: videoMaxSec, target: videoAvg }
            : { min: imageMinSec, max: imageMaxSec, target: imageAvg };

        if (remaining <= preferredRange.max && remaining >= preferredRange.min) {
            windows.push({
                start_sec: Number(cursor.toFixed(3)),
                end_sec: Number(total.toFixed(3)),
                preferred_type: desiredType
            });
            break;
        }

        let selectedType = desiredType;
        let end = pickBoundaryEnd(
            boundaries,
            cursor + preferredRange.min,
            cursor + preferredRange.max,
            cursor + preferredRange.target
        );

        // Enforce preferred-type duration even when no transcript boundary exists in range.
        if (end === null) {
            end = clampWindowEnd({
                start: cursor,
                desired: cursor + preferredRange.target,
                minDur: preferredRange.min,
                maxDur: preferredRange.max,
                total
            });
        }

        // Last-resort switch only if preferred duration cannot fit remaining timeline at all.
        if (end <= cursor + 0.001 || !Number.isFinite(end)) {
            const altEnd = pickBoundaryEnd(
                boundaries,
                cursor + otherRange.min,
                cursor + otherRange.max,
                cursor + otherRange.target
            ) ?? clampWindowEnd({
                start: cursor,
                desired: cursor + otherRange.target,
                minDur: otherRange.min,
                maxDur: otherRange.max,
                total
            });
            end = altEnd;
            selectedType = desiredType === "image" ? "video" : "image";
        }

        windows.push({
            start_sec: Number(cursor.toFixed(3)),
            end_sec: Number(end.toFixed(3)),
            preferred_type: selectedType
        });
        if (selectedType === "image") imageCount += 1;
        cursor = end;
    }

    for (const w of windows) {
        const text = safe
            .filter((s) => s.end > w.start_sec && s.start < w.end_sec)
            .map((s) => s.text)
            .join(" ");
        w.narration = cleanText(text);
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
