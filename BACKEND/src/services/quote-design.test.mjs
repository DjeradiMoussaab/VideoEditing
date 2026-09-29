import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { QUOTE_STYLES, QUOTE_SAMPLE, quoteComposition, validateQuoteDesign } from '../../../SHARED/quote-styles.mjs';
import { apiConfig } from '../config/api.config.mjs';
import { createManifest, ensureJobDirs, saveManifest, loadManifest } from './job-store.service.mjs';
import { setSceneType } from './pipeline-backend.service.mjs';

test('available layouts keep sample and maximum-length fields inside the canvas', () => {
  assert.deepEqual(QUOTE_STYLES.map(s => s.id), ['typography_focus', 'typography_split', 'modern_clean', 'classic', 'archive']);
  for (const style of QUOTE_STYLES) {
    for (const values of [QUOTE_SAMPLE, Object.fromEntries(style.fields.map(f => [f.key, 'A thoughtful sentence. '.repeat(40).slice(0, f.maxLength)]))]) {
      const design = quoteComposition(style.id, values);
      for (const b of design.blocks) {
        assert.ok(b.x >= 0 && b.x + b.w <= 1920, `${style.id}: horizontal bounds`);
        assert.ok(b.y >= 0 && b.y + b.lines.length * b.lineHeight <= 1080, `${style.id}: vertical bounds`);
      }
    }
    assert.ok(!quoteComposition(style.id, {}).blocks.some(b => style.fields.some(f => f.key === b.key)), 'Empty fields must not become sample text');
  }
});

test('quote validation rejects unknown styles, fields and oversized text', () => {
  assert.throws(() => validateQuoteDesign('unknown', {}));
  for (const id of ['dossier', 'broadcast', 'redacted', 'chronicle', 'monument', 'timeline']) {
    assert.throws(() => validateQuoteDesign(id, {}));
    assert.equal(quoteComposition(id, QUOTE_SAMPLE).id, 'classic');
  }
  for (const fields of [{text: 'x'.repeat(601)}, {author: 10}, {constructor: 'bad'}, {unknown: 'bad'}, []]) assert.throws(() => validateQuoteDesign('classic', fields));
  assert.deepEqual(validateQuoteDesign('classic', {text: '100%: “yes”', text2: 'Second thought'}), {text: '100%: “yes”', text2: 'Second thought'});
});

test('quote designs persist, invalidate clips and stay compatible with legacy text edits', async () => {
  const old = apiConfig.jobsDir;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'quote-design-test-'));
  apiConfig.jobsDir = dir;
  try {
    const manifest = createManifest('quote-test');
    const dirs = ensureJobDirs(manifest.id);
    manifest.scenes = [{scene_id: 1, type: 'image', narration: 'Original', duration_sec: 5}];
    saveManifest(manifest.id, manifest);
    await setSceneType(manifest.id, 1, {type: 'quote'});
    const clips = path.join(dirs.outDir, 'clips');
    fs.mkdirSync(clips, {recursive: true});
    const clip = path.join(clips, 'scene_01.mp4');
    fs.writeFileSync(clip, 'stale');
    await setSceneType(manifest.id, 1, {quoteStyleId: 'archive', quoteFields: {...QUOTE_SAMPLE}});
    let loaded = loadManifest(manifest.id);
    assert.equal(loaded.scenes[0].quoteStyleId, 'archive');
    assert.deepEqual(loaded.scenes[0].quoteFields, QUOTE_SAMPLE);
    assert.equal(loaded.artifacts.needsRegeneration, true);
    assert.equal(fs.existsSync(clip), false);
    await setSceneType(manifest.id, 1, {quoteText: 'Updated', quoteAuthor: ''});
    loaded = loadManifest(manifest.id);
    assert.equal(loaded.scenes[0].quoteFields.text, 'Updated');
    assert.equal(loaded.scenes[0].quoteFields.author, '');
    await assert.rejects(setSceneType(manifest.id, 1, {quoteStyleId: 'invalid'}), {statusCode: 400});
    assert.equal(loadManifest(manifest.id).scenes[0].quoteStyleId, 'archive');
    loaded = loadManifest(manifest.id);
    loaded.scenes[0].quoteStyleId = 'dossier';
    saveManifest(manifest.id, loaded);
    loaded = loadManifest(manifest.id);
    assert.equal(loaded.scenes[0].quoteStyleId, 'classic');
    assert.equal(loaded.scenes[0].quoteFields.text, 'Updated');
    await setSceneType(manifest.id, 1, {quoteFields: {text: 'Still editable'}});
    assert.equal(loadManifest(manifest.id).scenes[0].quoteFields.text, 'Still editable');
  } finally { apiConfig.jobsDir = old; fs.rmSync(dir, {recursive: true, force: true}); }
});
