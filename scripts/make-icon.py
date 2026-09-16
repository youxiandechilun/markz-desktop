from PIL import Image, ImageDraw
from pathlib import Path
out = Path(__file__).resolve().parent.parent / 'build'
size = 1024
im = Image.new('RGBA', (size, size), (0, 0, 0, 0))
d = ImageDraw.Draw(im)
d.rounded_rectangle((16, 16, 1008, 1008), radius=220, fill='#192a27')
d.polygon([(240, 740), (240, 285), (355, 285), (512, 504), (669, 285), (784, 285), (784, 740), (669, 740), (669, 473), (512, 677), (355, 473), (355, 740)], fill='#a4e4c8')
im = im.resize((256, 256), Image.Resampling.LANCZOS)
im.save(out / 'icon.png')
im.save(out / 'icon.ico', sizes=[(16,16),(24,24),(32,32),(48,48),(64,64),(128,128),(256,256)])
