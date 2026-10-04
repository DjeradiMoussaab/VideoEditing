export const TRANSITIONS = [
  { id: 'fade', label: 'Cross dissolve', category: 'Essential', description: 'A soft, seamless blend between two scenes.' },
  { id: 'fadeblack', label: 'Dip to black', category: 'Cinematic', description: 'Fade through black for a considered change of pace.' },
  { id: 'fadewhite', label: 'Dip to white', category: 'Luminous', description: 'A clean flash of light between moments.' },
  { id: 'smoothleft', label: 'Slide left', category: 'Motion', description: 'An eased horizontal movement that carries the story forward.' },
  { id: 'smoothright', label: 'Slide right', category: 'Motion', description: 'A smooth reverse movement for a fresh perspective.' },
  { id: 'wipeleft', label: 'Wipe left', category: 'Graphic', description: 'A precise edge reveals the next scene from the right.' },
  { id: 'wiperight', label: 'Wipe right', category: 'Graphic', description: 'A precise edge reveals the next scene from the left.' },
  { id: 'circleopen', label: 'Iris reveal', category: 'Focus', description: 'A soft circular opening draws attention to the next scene.' }
];
export const DEFAULT_TRANSITION = { type: 'fade', duration_sec: 0.8 };
export function transitionLimit(left, right) {
  return Math.max(0, Math.min(2, Number(left?.duration_sec) || 0, Number(right?.duration_sec) || 0));
}
export function boundaryTransition(scenes, index) {
  const max = transitionLimit(scenes[index], scenes[index + 1]);
  if (max < 0.5) return null;
  const saved = scenes[index]?.transition || DEFAULT_TRANSITION;
  return {
    type: TRANSITIONS.some(t => t.id === saved.type) ? saved.type : 'fade',
    duration_sec: Math.round(Math.min(max, Math.max(0.5, Number(saved.duration_sec) || 0.8)) * 1000) / 1000
  };
}
export function normalizeTransitions(scenes) {
  scenes.forEach((scene, index) => {
    const transition = boundaryTransition(scenes, index);
    if (transition) scene.transition = transition;
    else delete scene.transition;
  });
  return scenes;
}
// Half of each overlap belongs on each side of the shared scene border.
export function transitionPadding(scenes, index) {
  return {
    leading: (boundaryTransition(scenes, index - 1)?.duration_sec || 0) / 2,
    trailing: (boundaryTransition(scenes, index)?.duration_sec || 0) / 2
  };
}
