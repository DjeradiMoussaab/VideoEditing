export function sceneLabel(scene) {
  const start = Number(scene.start_sec || 0).toFixed(1);
  const end = Number(scene.end_sec || 0).toFixed(1);
  return `Scene ${scene.scene_id} (${start}s-${end}s)`;
}
