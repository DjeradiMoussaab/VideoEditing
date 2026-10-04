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
export const DEFAULT_TRANSITION_TYPES = TRANSITIONS.filter(effect => !['wipeleft', 'wiperight'].includes(effect.id)).map(effect => effect.id);
export function randomTransition(random = Math.random) {
  return { type: DEFAULT_TRANSITION_TYPES[Math.floor(random() * DEFAULT_TRANSITION_TYPES.length)], duration_sec: DEFAULT_TRANSITION.duration_sec };
}
// Older projects may not have stored transitions. Derive a stable default so
// preview, resizing, reloads and rendering never choose different effects.
function legacyDefault(scene) {
  let hash = 2166136261;
  for (const character of `${scene?.scene_id}:${scene?.narration || ''}`) {
    hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  }
  return randomTransition(() => (hash >>> 0) / 4294967296);
}
export function initializeTransitions(scenes, random = Math.random) {
  scenes.slice(0, -1).forEach((scene, index) => {
    if (!scene.transition && transitionLimit(scene, scenes[index + 1]) >= 0.5) scene.transition = randomTransition(random);
  });
  return normalizeTransitions(scenes);
}
export function transitionLimit(left, right) {
  return Math.max(0, Math.min(2, Number(left?.duration_sec) || 0, Number(right?.duration_sec) || 0));
}
export function boundaryTransition(scenes, index) {
  const max = transitionLimit(scenes[index], scenes[index + 1]);
  if (max < 0.5) return null;
  const saved = scenes[index]?.transition || legacyDefault(scenes[index]);
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
