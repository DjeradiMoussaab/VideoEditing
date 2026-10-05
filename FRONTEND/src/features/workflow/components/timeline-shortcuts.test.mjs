import test from 'node:test';
import assert from 'node:assert/strict';
import { isTimelinePlaybackShortcut } from './timeline-shortcuts.mjs';
const space = { code: 'Space', key: ' ' };
const input = type => ({ closest: selector => selector === 'input' ? { type } : null });
test('Space works with buttons, transition controls, sliders and numeric duration focused', () => {
  for (const tag of ['button', 'transition-editor', 'radio', 'timeline']) {
    assert.equal(isTimelinePlaybackShortcut({ ...space, target: { closest: selector => selector.includes(tag) ? {} : null } }), true, tag);
  }
  for (const type of ['range', 'number', 'checkbox', 'radio', 'button']) assert.equal(isTimelinePlaybackShortcut({ ...space, target: input(type) }), true, type);
  // Repeats must still be consumed; the handler toggles only on the initial press.
  assert.equal(isTimelinePlaybackShortcut({ ...space, repeat: true }), true);
  assert.equal(isTimelinePlaybackShortcut({ key: ' ' }), true);
});
test('typing, native selects, composition and system shortcuts keep their normal keys', () => {
  for (const type of ['text', 'search', 'email', 'password', 'tel', 'url', '']) assert.equal(isTimelinePlaybackShortcut({ ...space, target: input(type) }), false, type);
  for (const props of [{ ctrlKey: true }, { metaKey: true }, { altKey: true }, { isComposing: true }, { target: { isContentEditable: true } }, { target: { closest: selector => selector.startsWith('textarea') ? {} : null } }]) assert.equal(isTimelinePlaybackShortcut({ ...space, ...props }), false);
  assert.equal(isTimelinePlaybackShortcut({ code: 'Enter', key: 'Enter' }), false);
});
