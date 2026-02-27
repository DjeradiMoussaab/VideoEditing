function randomBetween(min, max) {
    return min + Math.random() * (max - min);
}

export function allocateSceneDurationsSeconds({
    sceneCount,
    totalAudioSec,
    transitionDurationSec,
    minSceneSec,
    maxSceneSec
}) {
    const overlap = Math.max(0, sceneCount - 1) * Math.max(0, transitionDurationSec);
    const targetTotal = totalAudioSec + overlap;
    const minTotal = sceneCount * minSceneSec;
    const maxTotal = sceneCount * maxSceneSec;

    if (targetTotal < minTotal || targetTotal > maxTotal) {
        const uniform = targetTotal / sceneCount;
        return Array.from({ length: sceneCount }, () => Math.max(1, uniform));
    }

    const out = [];
    let remaining = targetTotal;

    for (let i = 0; i < sceneCount; i++) {
        const remainingSlots = sceneCount - i - 1;
        if (remainingSlots === 0) {
            out.push(remaining);
            break;
        }

        const minAllowed = Math.max(minSceneSec, remaining - remainingSlots * maxSceneSec);
        const maxAllowed = Math.min(maxSceneSec, remaining - remainingSlots * minSceneSec);
        const value = randomBetween(minAllowed, maxAllowed);
        out.push(value);
        remaining -= value;
    }

    return out.map((v) => Number(v.toFixed(3)));
}
