# Vintage Paper

Replaces the displayed Documentary • Echo preset; `documentary_echo` remains its
stored ID so existing projects select the replacement without losing settings.

Source: user-provided `Vintage Presentation/01. Project file/(Footage)` and
`animation perfect.mp4`. The source animation is 386 frames at 60 fps:
6.433333333 seconds. The complete source motion, overlays and opening fade
are retimed together to play once across the image scene duration, without looping.

Original source assets are retained for provenance. The animation is silent and
omits the complete torn-paper caption, its text, and its shadow. The final export
retains the project's normal narration and other independently configured audio.
The retained source soundtrack and torn-paper asset are not used by the renderer.

`motion.json` contains the opening anchor-point positions and spatial Bezier
handles extracted from the supplied Premiere project. `build-vintage-assets.py`
builds fixed plates with Pillow from the original materials and typography.
Pillow is a development-only dependency; production rendering uses FFmpeg.

Fonts follow the template's links:
- https://www.dafont.com/moms-typewriter.font
- https://www.dafont.com/signatura-monoline-script.font

The renderer reconstructs Premiere's compositing, paper roughness, and fade;
it does not execute Adobe's native effect engine. It is not certified as a
pixel-identical reproduction. The historic demonstration photograph is replaced
by the selected project image; it is never baked into the background.
