import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { sameFootage, assertNoConsecutiveFootage } from './footage-continuity.service.mjs';

test('stock IDs, source paths and identical uploads prohibit adjacent reuse despite different trims or animations', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'continuity-'));
    try {
        const first = path.join(dir, 'first.jpg'), second = path.join(dir, 'renamed.jpg');
        fs.writeFileSync(first, 'identical image bytes'); fs.copyFileSync(first, second);
        assert.ok(sameFootage({ path: first }, { path: second }));
        assert.ok(sameFootage({ selectedSuggestionId: '12', assetPath: '/one.mp4' }, { selectedSuggestionId: '12', assetPath: '/two.mp4' }));
        assert.throws(() => assertNoConsecutiveFootage([
            { scene_id: 8, assetPath: first, mediaOffsetSec: 0 }, { scene_id: 9, assetPath: second, mediaOffsetSec: 5 }
        ]), /Scenes 8 and 9/);
        assert.doesNotThrow(() => assertNoConsecutiveFootage([
            { scene_id: 1, path: first }, { scene_id: 2, path: '/different.jpg' }, { scene_id: 3, path: second }
        ]));
        assert.ok(sameFootage({ source: 'stock_fallback' }, { source: 'quote_stock_fallback' }));
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
