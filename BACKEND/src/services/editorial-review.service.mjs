// Exact timing and narration prevent carrying a manual choice onto a different beat.
export function sceneBeatKey(scene) {
    return JSON.stringify([scene.start_sec, scene.end_sec, scene.narration]);
}
export function preservedManualScenes(previousScenes = [], scenes = [], exists = () => true) {
    const byBeat = new Map(previousScenes.filter(scene => (scene.manualMediaSelection || ['custom_image', 'custom_video'].includes(scene.source))
        && scene.assetPath && exists(scene.assetPath)).map(scene => [sceneBeatKey(scene), scene]));
    return Object.fromEntries(scenes.flatMap(scene => {
        const previous = byBeat.get(sceneBeatKey(scene));
        return previous ? [[String(scene.scene_id), previous]] : [];
    }));
}
export function reviewTimeline(scenes = []) {
    let run = 0, previous;
    return scenes.map(scene => {
        const key = `${scene.assetPath}|${scene.mediaOffsetSec || 0}`;
        run = key === previous ? run + 1 : 1;
        previous = key;
        const notes = [];
        if (run >= 4) notes.push('Same visual repeats across four or more consecutive scenes; review pacing.');
        if (String(scene.source || '').includes('fallback')) notes.push('Neutral fallback used; choose a suitable visual if needed.');
        return { scene_id: scene.scene_id, notes };
    }).filter(item => item.notes.length);
}
