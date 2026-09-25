const invalid = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });
const ms = value => Math.round(Number(value) * 1000);

export function deleteSceneManifest(manifest, sceneId, expectedUpdatedAt) {
    if (!manifest) throw invalid('Project not found', 404);
    if (['FINAL_RUNNING', 'DRAFT_RUNNING'].includes(manifest.status)) throw invalid('Wait for rendering to finish before deleting a scene.', 409);
    if (!expectedUpdatedAt || expectedUpdatedAt !== manifest.updatedAt) throw invalid('The project changed. Reload it before deleting.', 409);
    const index = manifest.scenes?.findIndex(scene => Number(scene.scene_id) === Number(sceneId));
    if (index == null || index < 0) throw invalid('Scene not found', 404);
    if (manifest.scenes.length < 2) throw invalid('The only remaining scene cannot be deleted.');
    const plan = manifest.plan?.scenes;
    if (!Array.isArray(plan) || plan.length !== manifest.scenes.length || plan.some((scene, i) => Number(scene.scene_id) !== Number(manifest.scenes[i].scene_id))) throw invalid('Scene timing data is incomplete.');
    const next = structuredClone(manifest);
    for (const scene of next.scenes) scene.originalSceneId ??= scene.scene_id;
    const last = index === next.scenes.length - 1;
    const deleted = next.scenes[index];
    const recipientIndex = last ? index - 1 : index + 1;
    const recipient = next.scenes[recipientIndex];
    const start = ms(last ? recipient.start_sec : deleted.start_sec);
    const end = ms(last ? deleted.end_sec : recipient.end_sec);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) throw invalid('Scene timing data is invalid.');
    for (const list of [next.scenes, next.plan.scenes]) {
        const receiving = list[recipientIndex];
        receiving.start_sec = start / 1000;
        receiving.end_sec = end / 1000;
        receiving.duration_sec = (end - start) / 1000;
        list.splice(index, 1);
        list.forEach((scene, i) => { scene.scene_id = i + 1; });
    }
    next.sceneChoices = Object.fromEntries(next.scenes.map(scene => [scene.scene_id, scene.type]));
    next.artifacts = { ...next.artifacts, needsRegeneration: true };
    return { project: next, selectedSceneId: last ? index : index + 1 };
}
