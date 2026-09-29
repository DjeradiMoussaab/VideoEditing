# History Slideshow

Materials are extracted from the user-supplied `The History.aegraphic` package
inside `History Slideshow/Premiere Pro/(Footage)/Motion Graphics Template Media`.
The original five cloud images, background texture and paper are retained.
The noise, particles and light-leak videos are copied without re-encoding for
the opening 6.5 seconds; their audio is excluded.

The opening photograph is supplied by the selected image scene. No template
quote, author, logo, placeholder photo or caption card is included. The style
is silent. Its camera, clouds, footage and fades are retimed together to play
once across the image scene duration, without looping.

`BACKEND/scripts/build-history-slideshow-assets.py` prepares static PNG layers
from the original materials. It requires Pillow only when rebuilding assets;
runtime rendering uses the same FFmpeg service, encoder selection and cache
version as the other image styles. The static masked photograph is prepared
once, then animated with zoompan; clouds and supplied footage move above it.

This is a reconstruction from the original materials and preview. The binary
After Effects project is not executed, and Adobe's 3D camera, blur, levels and
blend implementation have not been verified pixel-for-pixel. The photo mask,
cloud placements and camera timing are reconstructed, not extracted keyframes.
