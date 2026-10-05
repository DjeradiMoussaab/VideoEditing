const TEXT_INPUT_TYPES = new Set(['text', 'search', 'email', 'password', 'tel', 'url']);

export function isTimelinePlaybackShortcut(event) {
  if ((event.code !== 'Space' && event.key !== ' ') || event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return false;
  const target = event.target;
  if (target?.isContentEditable || target?.closest?.('textarea, select, [role="textbox"], [contenteditable]:not([contenteditable="false"])')) return false;
  const input = target?.closest?.('input');
  return !input || !TEXT_INPUT_TYPES.has(input.type || 'text');
}
