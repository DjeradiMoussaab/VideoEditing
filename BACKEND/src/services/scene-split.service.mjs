import { normalizeTransitions, randomTransition } from '../../../SHARED/transitions.mjs';
function invalid(message, statusCode = 400) {
    return Object.assign(new Error(message), { statusCode });
}
const ms = value => Math.round(Number(value) * 1000);

// Pure transformation: validate before touching either the manifest or its files.
export function splitSceneManifest(manifest, sceneId, timeSec, expectedUpdatedAt) {
    if (!manifest) throw invalid('Project not found', 404);
    if (['FINAL_RUNNING', 'DRAFT_RUNNING'].includes(manifest.status)) throw invalid('Wait for rendering to finish before splitting a scene.', 409);
    if (!expectedUpdatedAt || expectedUpdatedAt !== manifest.updatedAt) throw invalid('The project changed. Reload it before splitting.', 409);
    if (typeof timeSec !== 'number' || !Number.isFinite(timeSec)) throw invalid('Split time must be a finite number.');
    const index = manifest.scenes?.findIndex(scene => Number(scene.scene_id) === Number(sceneId));
    if (index == null || index < 0) throw invalid('Scene not found', 404);
    const source = manifest.scenes[index];
    const planIndex = manifest.plan?.scenes?.findIndex(scene => Number(scene.scene_id) === Number(sceneId));
    if (planIndex == null || planIndex < 0) throw invalid('Scene timing data is incomplete.');
    const cut = ms(timeSec), start = ms(source.start_sec), end = ms(source.end_sec);
    if (!Number.isFinite(start) || !Number.isFinite(end) || cut - start <= 1000 || end - cut <= 1000) {
        throw invalid('Both scenes must be longer than 1 second.');
    }
    const next = structuredClone(manifest);
    normalizeTransitions(next.scenes);
    normalizeTransitions(next.plan.scenes);
    const newTransition = randomTransition();
    for (const scene of next.scenes) scene.originalSceneId ??= scene.scene_id;
    function divide(list, position) {
        const left = list[position];
        const right = structuredClone(left);
        // The existing outgoing transition stays on the original end of the scene.
        left.transition = { ...newTransition };
        left.end_sec = cut / 1000;
        left.duration_sec = (cut - start) / 1000;
        right.start_sec = cut / 1000;
        right.end_sec = end / 1000;
        right.duration_sec = (end - cut) / 1000;
        right.mediaOffsetSec = (ms(source.mediaOffsetSec || 0) + cut - start) / 1000;
        list.splice(position + 1, 0, right);
        list.forEach((scene, i) => { scene.scene_id = i + 1; });
    }
    divide(next.scenes, index);
    divide(next.plan.scenes, planIndex);
    normalizeTransitions(next.scenes);
    normalizeTransitions(next.plan.scenes);
    next.sceneChoices = Object.fromEntries(next.scenes.map(scene => [scene.scene_id, scene.type]));
    next.artifacts = { ...next.artifacts, needsRegeneration: true };
    return { project: next, newSceneId: index + 2 };
}
