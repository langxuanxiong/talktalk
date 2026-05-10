from PIL import Image, ImageDraw, ImageFont
import math

def make_icon(size):
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Warm gradient circle
    cx = cy = size // 2
    r = size // 2 - size // 20

    for y in range(size):
        for x in range(size):
            dx, dy = x - cx, y - cy
            dist = math.sqrt(dx*dx + dy*dy)
            if dist <= r:
                t = dist / r
                # Warm coral to peach gradient
                r_val = int(232 - 40 * t)
                g_val = int(145 - 80 * t)
                b_val = int(122 - 60 * t)
                a = 255 if dist < r - 2 else int(255 * (r - dist) / 2)
                if a < 0: a = 0
                img.putpixel((x, y), (max(0, r_val), max(0, g_val), max(0, b_val), a))

    # Tea cup / speech bubble - simple white shapes
    draw = ImageDraw.Draw(img)
    
    # Speech bubble (to suggest conversation)
    bw = size * 0.45
    bh = size * 0.35
    bx = (size - bw) / 2
    by = size * 0.28
    
    # Rounded rect for bubble
    rad = size * 0.08
    draw.rounded_rectangle(
        [bx, by, bx + bw, by + bh],
        radius=rad,
        fill=(255, 255, 255, 230)
    )
    
    # Bubble tail
    tail_w = size * 0.12
    tail_h = size * 0.1
    draw.polygon([
        (cx - tail_w/2, by + bh),
        (cx + tail_w/2, by + bh),
        (cx, by + bh + tail_h)
    ], fill=(255, 255, 255, 230))
    
    # Three dots inside bubble
    dot_r = size * 0.025
    dot_y = by + bh * 0.55
    dot_spacing = size * 0.09
    for i in range(3):
        dx = cx + (i - 1) * dot_spacing
        draw.ellipse(
            [dx - dot_r, dot_y - dot_r, dx + dot_r, dot_y + dot_r],
            fill=(200, 150, 140, 200)
        )

    return img

for size in [192, 512]:
    icon = make_icon(size)
    icon.save(f'public/icon-{size}.png')

print('✅ Icons generated')
