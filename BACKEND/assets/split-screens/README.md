# Split Screens

Ten image layouts extracted from the supplied `Split Screens KIT.aep`, in the preview's order:

| Name | Source composition | Images |
| --- | --- | --- |
| Diagonal In | Screen 10 | 2 |
| Diagonal Rise | Screen 09 | 2 |
| Wide Right | Screen 08 | 2 |
| Wide Bottom | Screen 07 | 2 |
| Wide Top | Screen 06 | 2 |
| Wide Left | Screen 05 | 2 |
| Center Reveal | Screen 04 | 2 |
| Side Slide | Screen 03 | 2 |
| Row Slide | Screen 02 | 2 |
| Trio | Screen 01 | 3 |

The importer extracts source composition dimensions, layer order, image slot numbers,
positions, scales, anchors, position keyframe timing, temporal speeds/influences, mask
vertices and mask inversion from the AEP. The masks are antialiased once at import time.
All runtime geometry lives in `SHARED/split-screen-motion.mjs`. Fonts, After Effects,
Python and the original Desktop folder are not runtime requirements.

The renderer scales/crops and masks each still once, loops the prepared image, and moves
it using the authored easing. Nested precompositions preserve the center and diagonal
reveal masks. Longer scenes hold the settled layout after its original entrance; scenes
shorter than two seconds compress the entrance. Preview and final rendering share this
implementation. Original source imagery is absent from the supplied kit; the preview
video contains examples, not separate replaceable image assets. This is an editable
FFmpeg reconstruction; it is not certified pixel-identical to After Effects rasterization.

Image slots persist independently per scene, including crop focus. Unassigned slots use
the existing scene image. Explicit missing images cause an actionable error rather than
silently substituting a different image. Split layouts are manual-only in automatic
single-image scene planning. Replacing a panel invalidates both preview and export caches.

Reimport (Python 3 + Pillow):

    python3 scripts/import-split-screens.py '/path/to/Split Screens KIT.aep'

Verify:

    node --test BACKEND/src/services/split-screens.test.mjs
    npm run check

The original AEP and every extracted mask are included in Git. No demo photographs or
soundtrack are embedded in exported scenes.
