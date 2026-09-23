import test from 'node:test';
import assert from 'node:assert/strict';
import { quoteLayout } from './quote-motion.service.mjs';

test('quote divider requires both text fields, including whitespace-only input', () => {
    for (const [text, author, expected] of [['Quote', 'Author', true], ['Quote', '', false], ['', 'Author', false], [' ', ' ', false]]) {
        assert.equal(quoteLayout(text, author, 1920, 1080).showDivider, expected);
    }
});
test('long quotes wrap and shrink to the safe text area without truncation', () => {
    const text = 'A thoughtful sentence about life and courage. '.repeat(12).trim();
    const layout = quoteLayout(text, '', 1920, 1080);
    assert.equal(layout.text.replace(/\n/g, ' '), text);
    assert.ok(layout.textHeight <= 1080 * .43 + .001);
    assert.ok(layout.top > 0);
});
