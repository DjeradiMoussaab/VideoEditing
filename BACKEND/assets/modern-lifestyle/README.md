# Modern Lifestyle openers

Four editable openers imported from the user-provided Modern Lifestyle Premiere project:

| Opener | Original scene | Editable text |
| --- | --- | --- |
| Lifestyle | 1 — Modern Lifestyle | Light heading, bold accent title, description |
| Minimal | 3 — Minimal | Centered title, description |
| Spotlight | 4 — Video Tutorial | Right-aligned heading, accent title, description |
| Signature | 10 — Your Logo | Centered name/title |

`source.prproj` is the original source project. `SHARED/modern-lifestyle-motion.mjs`
contains its extracted text documents, positions, dimensions, font sizes, and image/text
position and opacity keyframes. The renderer evaluates the temporal Beziers and retains
the original staggered entrances and directional exits. Longer scenes extend the settled
middle; shorter scenes scale the complete animation. Signature includes the preview's
closing fade. A matching photo or clip can be chosen through the existing media library.

The preview's photographs are **not** included in the supplied source materials: its
image slots reference `Drop zone.jpg`, retained here as `placeholder.jpg` for provenance.
Without selected media, the runtime uses a neutral background rather than burning that
placeholder label into the output. This is a customizable FFmpeg reconstruction, not a
pixel-identical Premiere export: photographs, Adobe keyer/sharpen/compositing behavior,
and final preview grading can differ. The source master/blue curve control points and
40% sharpening are reproduced with the corresponding FFmpeg filters.

## Bundled runtime assets

- `matte-{1,3,4,10}.mkv`: original reveal mattes, converted to lossless grayscale FFV1.
- `glow-{1,3,4,10}.mkv`: original moving glows, with the green pedestal removed and the
  brightness field stored losslessly. Runtime tinting permits any glow color.
- `atmosphere.mp4`, `texture.mp4`: original bokeh/light leaks and texture, transcoded at
  CRF 18 without audio. Their combined size is substantially smaller than the source MOVs.
- `vignette.png`: original vignette.
- `Montserrat-Light.ttf`: official Montserrat font; `OFL.txt` is its license. Black uses
  the already committed `../typography-titles/Montserrat-Black.ttf`. The Premiere text
  documents specify Montserrat, despite the package's separate Raleway font-link note.
- `sources.json`: original footage filenames, SHA-256 fingerprints, and conversion data.

No runtime reads target the user's Desktop/storyblocks folder. All required assets have
Git ignore exceptions and stay below common Git hosting per-file size limits. No music
or source audio is added. Existing scene preview/final clip caches apply to these designs.
One-byte-per-frame opacity tracks avoid expensive per-pixel expression evaluation.

## Reimport and verify

```sh
python3 scripts/import-modern-lifestyle.py '/path/to/Modern Lifestyle'
node --test BACKEND/src/services/modern-lifestyle.test.mjs
npm run check
```

The importer needs Python 3 and FFmpeg, and does not fetch fonts. To replace the included
Light font use the official Montserrat repository:
https://github.com/JulietaUla/Montserrat/blob/master/fonts/ttf/Montserrat-Light.ttf
Copy the same font into `FRONTEND/public/fonts/Montserrat-Light.ttf` for SVG previews.
