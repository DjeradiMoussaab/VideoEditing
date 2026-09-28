# Historical Memories

This renderer replaces the stored `archive_stack` preset with the first shot of
the user-supplied Historical Memories Premiere template. The visible shot runs
151 frames at 30 fps (5.033333 seconds) before the next template scene begins.
That complete opening cycle repeats for longer image scenes.

The paper, grunge, crumpled-paper, aged-frame, particles, damage, and
light-leak materials come from the supplied template. `Main_Matte.mp4` contains
the opening cycle of the supplied 2000-square PNG matte, losslessly positioned
to the 1920x1080 sequence and encoded at high quality for practical repository
and render size.

All title/quote layers are omitted. The decorative `letter_3.png` handwriting
asset is also deliberately omitted so the output contains no text. The preset
is silent. The original animated ink matte is included. Frame rotation is
supersampled to smooth thin diagonal edges, and animation timestamps use the
output frame rate rather than the still-image decoder's 25 fps time base. Static photo
and paper layers are composed once and then repeated before animation, avoiding
repeated high-resolution image decoding, scaling, and background blurring.
