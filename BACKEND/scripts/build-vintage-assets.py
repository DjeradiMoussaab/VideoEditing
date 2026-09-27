"""Build the fixed Scene 1 layers from the user-supplied Premiere template assets.
Run only when changing the template. Runtime rendering needs FFmpeg, not Pillow.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageChops, ImageOps
import random, math
A = Path(__file__).resolve().parents[1] / 'assets/vintage'
W,H=2300,1294

def centered(canvas,img,cx,cy):
    canvas.alpha_composite(img,(round(cx-img.width/2),round(cy-img.height/2)))

def scaled(name,scale):
    im=Image.open(A/name).convert('RGBA')
    return im.resize((round(im.width*scale),round(im.height*scale)),Image.Resampling.LANCZOS)

paper=Image.open(A/'Papers.JPG').convert('RGB').resize((W,H),Image.Resampling.LANCZOS)
pencil=Image.open(A/'Pencil texture.jpg').convert('RGB').resize((W,H),Image.Resampling.LANCZOS)
base=Image.new('RGB',(W,H),(227,228,225))
base=Image.blend(base,paper,.12)
base=ImageChops.soft_light(base,pencil)
base.save(A/'background.png')
# Decorations below the principal photograph; normalized locations from Scene 1.
below=Image.new('RGBA',(W,H))
for scale,rotation,cx,cy in [(.519,17.769,.139257,.773614),(.3888586,0,.744032,.25985)]:
    im=scaled('Stamp.png',scale);im.putalpha(im.getchannel('A').point(lambda v:round(v*.5)))
    centered(below,im.rotate(-rotation,resample=Image.Resampling.BICUBIC,expand=True),cx*W,cy*H)
below.save(A/'decorations.png')
# Fixed, repeatable torn print matte. Adobe Roughen Edges is reconstructed here.
w,h=1344,756;r=random.Random(72)
def edge(length):
    coarse=[r.uniform(1,9) for _ in range(length//8+2)]
    return [coarse[i//8]*(1-(i%8)/8)+coarse[i//8+1]*(i%8)/8+r.uniform(0,2) for i in range(length)]
u,b,l,rt=edge(w),edge(w),edge(h),edge(h)
points=[(x,u[x]) for x in range(w)]+[(w-1-rt[y],y) for y in range(h)]+[(x,h-1-b[x]) for x in range(w-1,-1,-1)]+[(l[y],y) for y in range(h-1,-1,-1)]
mask=Image.new('L',(w,h));ImageDraw.Draw(mask).polygon(points,fill=255);mask=mask.filter(ImageFilter.GaussianBlur(.45));mask.save(A/'photo-mask.png')
# A faint paper overlay applied over the entire still composition.
texture=Image.new('RGBA',(W,H),(255,255,255,0))
p=ImageOps.grayscale(paper)
texture.putalpha(p.point(lambda v:round(abs(v-150)*.22)))
noise=Image.new('L',(W,H)); original=ImageOps.grayscale(Image.open(A/'Noise.jpg')).rotate(90,expand=True); original=original.resize((round(original.width*1.857),round(original.height*1.857)),Image.Resampling.LANCZOS); noise.paste(original,((W-original.width)//2,(H-original.height)//2)); texture.putalpha(ImageChops.screen(texture.getchannel('A'),noise)); texture.save(A/'surface.png')
