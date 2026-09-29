"""Prepare text-free layers from the supplied History Slideshow AE materials.

Development only: production rendering uses the generated PNGs and FFmpeg.
"""
from pathlib import Path
from PIL import Image, ImageOps, ImageChops, ImageFilter, ImageDraw

ASSETS = Path(__file__).resolve().parents[1] / 'assets/history-slideshow'
W, H = 1920, 1080


def texture(name):
    return ImageOps.fit(Image.open(ASSETS / name).convert('L'), (W, H))


paper = texture('paper-source.jpg')
grain = texture('background-source.jpg')
background = Image.blend(Image.new('L', (W, H), 237), paper, .14)
background = Image.blend(background, grain, .05)
background.convert('RGB').save(ASSETS / 'background.png')

# The source clouds have black backgrounds. Their actual luminance provides the
# opacity for the white fog, as well as the organic photographic reveal shape.
clouds = [texture(f'cloud-{i}.png') for i in range(1, 6)]
mask = Image.new('L', (W, H))
for i, cloud in enumerate(clouds):
    cloud = cloud.resize((1600, 900))
    if i % 2:
        cloud = ImageOps.mirror(cloud)
    layer = Image.new('L', (W, H))
    layer.paste(cloud, (160 + (i % 3 - 1) * 95, 90 + (i % 2) * 25))
    mask = ImageChops.lighter(mask, layer)
mask = mask.point(lambda value: min(255, value * 4)).filter(ImageFilter.GaussianBlur(2))
# Keep the subject readable through the middle; the original clouds supply the
# irregular perimeter rather than cutting holes through the photograph.
center = Image.new('L', (W, H))
ImageDraw.Draw(center).ellipse((120, -60, W - 120, H + 60), fill=255)
center = center.filter(ImageFilter.GaussianBlur(90))
mask = ImageChops.lighter(mask, center).filter(ImageFilter.GaussianBlur(8))
mask.save(ASSETS / 'photo-mask.png')

for name, placements in [
    ('clouds-front.png', [(0, -690, -360, 1850), (2, 810, 310, 1600), (4, -650, 660, 1900)]),
    ('clouds-back.png', [(1, 950, -430, 1700), (3, -750, 260, 1600)])
]:
    opacity = Image.new('L', (W, H))
    for index, x, y, width in placements:
        cloud = clouds[index].resize((width, round(width * H / W)))
        layer = Image.new('L', (W, H))
        layer.paste(cloud, (x, y))
        opacity = ImageChops.screen(opacity, layer)
    rgba = Image.new('RGBA', (W, H), (247, 247, 247, 0))
    rgba.putalpha(opacity.point(lambda value: min(210, value * .7)).filter(ImageFilter.GaussianBlur(10)))
    rgba.save(ASSETS / name)

public = ASSETS.parents[2] / 'FRONTEND/public'
public.mkdir(exist_ok=True)
background.resize((640, 360)).save(public / 'history-slideshow-background.jpg')
mask.resize((640, 360)).save(public / 'history-slideshow-mask.png')
Image.open(ASSETS / 'clouds-front.png').resize((640, 360)).save(public / 'history-slideshow-clouds.png')
