# Modern Clean quote

The user-supplied Modern Clean Titles template's `01_01.mov` and `01_02.mov`
provide the original banner alpha animation. The first five seconds are stored
losslessly as FFV1 grayscale masks; the final frame is held for longer scenes.
The default background is the clean opening frame of the supplied preview.
It is a still, not the preview's original moving background footage.

Montserrat ExtraBold and Medium are bundled with their OFL license from
https://github.com/JulietaUla/Montserrat/tree/master/fonts/ttf (2026-09-29).
The template's UTF-16 text keyframes specify ExtraBold and Medium. Shared advance metrics
are generated with Pillow at 1000px and used to fit editable text to the banners.

Preview and export use the same renderer: original banner motion, reconstructed
text entrance, and a 0.6% six-second breathing hold starting after two seconds.
No audio is included. This is not a certified pixel-identical Premiere render.
