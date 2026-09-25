export function splitTarget(scenes, timeSec) {
  if (!Number.isFinite(timeSec)) return null;
  const cut = Math.round(timeSec * 1000);
  return scenes.find(scene => cut - Math.round(Number(scene.start_sec) * 1000) > 1000
    && Math.round(Number(scene.end_sec) * 1000) - cut > 1000) || null;
}

export function isSplitShortcut(event) {
  const target = event.target;
  return (event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey
    && !event.repeat && !event.isComposing && event.key.toLowerCase() === 'b'
    && !target?.closest?.('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="dialog"]');
}
