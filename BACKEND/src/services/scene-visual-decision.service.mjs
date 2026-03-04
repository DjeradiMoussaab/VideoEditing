function durationRangeFor(type, cfg) {
    const defaults = { min: 6, max: 15 };
    const fromConfig = cfg?.visual?.sceneDurationSec?.[type];
    const min = Math.max(1, Number(fromConfig?.min ?? defaults.min));
    const max = Math.max(min, Number(fromConfig?.max ?? defaults.max));
    return { min, max };
}

function sceneDurationSec(scene) {
    return Number(scene?.duration_sec ?? 0);
}

function fitsRange(durationSec, range) {
    return durationSec >= range.min && durationSec <= range.max;
}

export function decideSceneVisualTypes(scenes, cfg) {
    const imageRatio = Math.min(1, Math.max(0, Number(cfg.visual?.decision?.imageRatio ?? 0.6)));
    const out = {};
    const imageRange = durationRangeFor("image", cfg);
    const videoRange = durationRangeFor("video", cfg);
    let imageCount = 0;

    for (const s of scenes) {
        const targetImagesAtIndex = Math.round((Object.keys(out).length + 1) * imageRatio);
        const preferred = imageCount < targetImagesAtIndex ? "image" : "video";
        const other = preferred === "video" ? "image" : "video";
        const durationSec = sceneDurationSec(s);
        const preferredRange = preferred === "video" ? videoRange : imageRange;
        const otherRange = other === "video" ? videoRange : imageRange;

        if (fitsRange(durationSec, preferredRange)) {
            out[s.scene_id] = preferred;
            if (preferred === "image") imageCount += 1;
            continue;
        }

        if (fitsRange(durationSec, otherRange)) {
            out[s.scene_id] = other;
            if (other === "image") imageCount += 1;
            continue;
        }

        // If neither type range matches, preserve deterministic target balancing.
        out[s.scene_id] = preferred;
        if (preferred === "image") imageCount += 1;
    }

    return out;
}
