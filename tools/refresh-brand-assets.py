"""Generate Monee's geometric M icon consistently for web and install surfaces."""
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public' / 'icons'
INK = '#253D32'
PAPER = '#F6F7F3'
# One continuous M, its rounded shoulders echo the paired arches of the name.
PATH = 'M66 176V105C66 83 78 70 96 70C111 70 123 80 128 95C133 80 145 70 160 70C178 70 190 83 190 105V176'
svg = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><title>Monee</title><rect width="256" height="256" rx="56" fill="{INK}"/><path d="{PATH}" fill="none" stroke="{PAPER}" stroke-width="24" stroke-linecap="round" stroke-linejoin="round"/></svg>\n'
(OUT / 'monee.svg').write_text(svg, encoding='utf-8')

def bezier(a,b,c,d,steps=40):
    return [((1-t)**3*a[0]+3*(1-t)**2*t*b[0]+3*(1-t)*t*t*c[0]+t**3*d[0], (1-t)**3*a[1]+3*(1-t)**2*t*b[1]+3*(1-t)*t*t*c[1]+t**3*d[1]) for t in [i/steps for i in range(steps+1)]]

def icon(size, maskable=False):
    scale=4
    canvas=Image.new('RGB',(size*scale,size*scale),INK)
    draw=ImageDraw.Draw(canvas)
    pts=[(66,176),(66,105)]+bezier((66,105),(66,83),(78,70),(96,70))+bezier((96,70),(111,70),(123,80),(128,95))+bezier((128,95),(133,80),(145,70),(160,70))+bezier((160,70),(178,70),(190,83),(190,105))+[(190,176)]
    # Maskable artwork fits inside the central 80% safe zone.
    factor=.88 if maskable else 1
    s=size*scale/256
    points=[((128+(x-128)*factor)*s,(128+(y-128)*factor)*s) for x,y in pts]
    width=round(24*s*factor)
    draw.line(points,fill=PAPER,width=width,joint='curve')
    for x,y in points:
        r=width/2
        draw.ellipse((x-r,y-r,x+r,y+r),fill=PAPER)
    return canvas.resize((size,size),Image.Resampling.LANCZOS)

for size in (32,180,192,512):
    icon(size).save(OUT / f'icon-{size}.png')
icon(512,True).save(OUT / 'icon-maskable-512.png')
icon(64).save(ROOT / 'public' / 'favicon.ico',sizes=[(16,16),(32,32),(48,48),(64,64)])
print('Generated SVG, PNG 32/180/192/512, maskable and ICO assets.')
