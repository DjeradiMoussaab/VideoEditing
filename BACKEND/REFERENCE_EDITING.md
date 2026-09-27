# Reference-first editing

Automatic drafts ignore legacy `maxImages` and `maxReferenceReuse` values. Suitable references can cover every non-quote scene within the configured duration ranges. The same source is strictly forbidden in consecutive scenes. Small repetition penalties only break ties for nonconsecutive reuse. If no distinct suitable reference fits, stock can fill the gap. Quote scenes retain their format.

Reference captions describe visible content, framing and face visibility without guessing identities. Clip analysis adds up to six temporal segments using the existing sampled frames. Matching receives a compact story overview plus neighboring narration in the existing batches of 20 scenes. It returns clip offsets and brief reasons; allocation validates usable bounds, scene duration and transition padding. Automatic selection rejects excerpts that require looping. Manual clip choices retain the existing looping behavior.

Stock searches favor anonymous objects, environments, hands, back views and silhouettes. Automatic selection reviews at most two candidates per remaining scene, with at most two ordered provider preview frames per candidate. Samples cannot guarantee the contents of every frame. Uncertain/rejected results use a neutral background in the draft and are flagged for review, rather than silently selecting an unreviewed stranger. All suggestions remain available for manual choice. The CLI reports an actionable error if it cannot find reviewed footage.

A local timeline check flags long consecutive runs of the same shot and neutral fallbacks. It does not make another model call. Explicit manual choices are retained during draft regeneration when narration and exact timing still match and the file exists. Older custom uploads are recognized as manual; older stock/reference selections without an explicit manual flag cannot reliably be distinguished from automatic choices.

## API budget

- No additional reference-analysis pass: enrich the existing cached image/clip descriptions.
- Reference matching stays text-only, batched at 20 scenes, with reasons limited to the top three assets. Story context is capped at 1,800 characters; each neighbor is capped at 400 characters.
- Images and clip samples use low image detail. Existing clip uncertainty handling remains limited to one denser pass.
- New stock review: at most `ceil(uncached_stock_scenes / 8)` requests, four low-detail preview images per scene, and 1,600 completion tokens per batch. No paid retries or recursive search. Reference-only drafts need zero stock-review calls.
- Stock reviews are persisted with model, policy, scene, query and candidate signatures. Unchanged reviews cost zero additional calls; failures are retryable on the next run. Repeated search queries share results during a run.
- Manual scene assignments skip reference rescoring and stock search/review.
- Actual stock-review calls, frame count and API token usage are recorded in `referenceAnalysisUsage.stockReview`. Reference scoring and clip usage remain recorded alongside it.
- Policy-version changes invalidate old analysis once. Unchanged later runs reuse it.

An offline fixture of 40 scenes and eight references used two matching requests before and after this change, with zero requests on cached reruns. Serialized matching request size increased from 12,312 to 29,157 characters (~2.37x), reflecting narrative context and stricter rules. This is a request-size comparison, not a measured token bill or a whole-pipeline cost multiplier. Real spend depends on model usage, reference coverage and remaining stock scenes; no live paid API benchmark was run.

## Validation

`npm test` covers unlimited reference reuse, weak/failed/short references, offset bounds, context cache invalidation, preservation of manual choices, timeline review, stock call/frame budgets, invalid review results and cache reuse. `npm run build:frontend` checks the UI build. `npm run test:render` exercises local image motion, quote layouts, transitions and final audio/video export without external APIs.

## Continue after a draft error

The setup page offers **Continue scene plan** for a failed saved project, including projects reopened from History. The dedicated `/projects/:id/draft/continue` endpoint retains the original inputs and settings, prevents concurrent generation, and starts the worker in resume mode.

Successful transcription, quote refinement, planner chunks, reference allocation, stock searches/review and each prepared stock scene are checkpointed on disk. Image captions, clip analysis and matching/review batches also persist incremental caches. Continuing skips completed work and retries the first incomplete units; completed stock media are reused after checking that their files still exist and are nonempty. Missing media are regenerated individually. Manifest writes use an atomic rename so polling and worker restarts do not read partially written checkpoints. An interrupted in-flight request may need to be repeated because only completed, saved results can be reused.

Failures from before this update can reuse their existing cached plan and analysis. Earlier downloads whose scene assignments were never saved cannot reliably be recovered; full per-scene continuation applies to checkpoints written by this version. No inputs need to be uploaded again.

## Strict consecutive-footage rule

Images, reference clips and stock footage cannot repeat in neighboring scenes. Changing animation, crop or clip offset does not count as new footage. Reference allocation enforces the rule against both neighbors. Stock selection chooses a distinct already-approved alternative from the same bounded review pass. Resumed media checkpoints are checked against neighboring assets before reuse. Local source paths, stock IDs and byte-identical uploaded/downloaded files identify duplicates, even under different filenames; this is not perceptual matching of separately re-encoded files.

A final check rejects consecutive duplicates before final rendering, including in older or manually edited projects. If no distinct suitable footage exists, generation reports the conflict rather than silently repeating footage. The rule adds no separate AI call.
