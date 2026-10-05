import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { STYLE_ASSETS, missingStyleAssets, assertStyleAssets } from './style-assets.service.mjs';
import { execAsync } from './ffmpeg.service.mjs';

test('all bundled style assets are present and nonempty', () => {
  for (const style of Object.keys(STYLE_ASSETS)) assert.deepEqual(missingStyleAssets(style), [], style);
});

test('missing, empty and directory assets produce an actionable diagnostic', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'style assets '));
  try {
    for (const name of STYLE_ASSETS.historical) fs.writeFileSync(path.join(directory, name), 'fixture');
    fs.unlinkSync(path.join(directory, 'damage.mp4'));
    fs.writeFileSync(path.join(directory, 'Main_Matte.mp4'), '');
    fs.unlinkSync(path.join(directory, 'Paper.jpg'));
    fs.mkdirSync(path.join(directory, 'Paper.jpg'));
    assert.deepEqual(missingStyleAssets('historical', directory), ['Paper.jpg', 'damage.mp4', 'Main_Matte.mp4']);
    assert.throws(() => assertStyleAssets('historical', directory), /Missing historical animation assets: Paper.jpg, damage.mp4, Main_Matte.mp4.*npm run doctor/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('failed render commands expose stderr instead of the filter graph', async () => {
  await assert.rejects(execAsync("printf 'Missing test input file' >&2; exit 254"), /FFmpeg failed \(exit 254\).*Missing test input file/);
});
