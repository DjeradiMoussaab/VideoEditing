import test from 'node:test';
import assert from 'node:assert/strict';
import { formatTimecode } from './timeline-format.mjs';

test('timecode preserves milliseconds and carries rounding across minute boundaries', () => {
  assert.equal(formatTimecode(0), '00:00:000');
  assert.equal(formatTimecode(120.268), '02:00:268');
  assert.equal(formatTimecode(59.9996), '01:00:000');
  assert.equal(formatTimecode(6002.003), '100:02:003');
  assert.equal(formatTimecode(-1), '00:00:000');
});
