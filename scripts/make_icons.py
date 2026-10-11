"""아이콘 · 링크 미리보기 그림을 만든다 (python3 scripts/make_icons.py). Pillow 필요."""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

OUT = Path(__file__).resolve().parent.parent / "icons"
CORAL = (255, 122, 89)
CREAM = (255, 247, 242)
INK = (29, 34, 48)
RED = (240, 72, 62)
FONT = "/System/Library/Fonts/AppleSDGothicNeo.ttc"


def mark(size: int, pad: float, rounded: bool) -> Image.Image:
    """코랄 바탕에 흰 체온계와 작은 하트."""
    s = size * 4
    im = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    if rounded:
        d.rounded_rectangle([0, 0, s - 1, s - 1], radius=int(s * 0.22), fill=CORAL)
    else:
        d.rectangle([0, 0, s, s], fill=CORAL)
    c = s / 2
    k = s * (1 - 2 * pad)          # 그림이 들어갈 폭
    # 체온계 몸통
    w = k * 0.2
    top = c - k * 0.38
    bulb_r = k * 0.17
    bulb_c = c + k * 0.22
    x = c - k * 0.06
    d.rounded_rectangle([x - w / 2, top, x + w / 2, bulb_c], radius=w / 2, fill=CREAM)
    d.ellipse([x - bulb_r, bulb_c - bulb_r, x + bulb_r, bulb_c + bulb_r], fill=CREAM)
    # 수은
    iw = w * 0.42
    d.rounded_rectangle([x - iw / 2, top + k * 0.2, x + iw / 2, bulb_c], radius=iw / 2, fill=RED)
    ir = bulb_r * 0.62
    d.ellipse([x - ir, bulb_c - ir, x + ir, bulb_c + ir], fill=RED)
    # 눈금
    for i in range(3):
        y = top + k * (0.1 + i * 0.09)
        d.rounded_rectangle([x + w / 2 + k * 0.03, y - k * 0.012, x + w / 2 + k * 0.08, y + k * 0.012], radius=k * 0.012, fill=CREAM)
    # 하트
    hx, hy, hr = c + k * 0.3, c - k * 0.28, k * 0.075
    import math
    pts = []
    for i in range(120):
        t = 2 * math.pi * i / 120
        px = 16 * math.sin(t) ** 3
        py = 13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t)
        pts.append((hx + px * hr / 8, hy - py * hr / 8))
    d.polygon(pts, fill=CREAM)
    return im.resize((size, size), Image.LANCZOS)


def og() -> Image.Image:
    W, H = 1200, 600
    im = Image.new("RGB", (W, H), (246, 244, 241))
    d = ImageDraw.Draw(im)
    d.ellipse([W - 520, -160, W + 160, 520], fill=(255, 233, 226))
    icon = mark(300, 0.12, True)
    im.paste(icon, (W - 420, 140), icon)
    big = ImageFont.truetype(FONT, 104, index=6)      # Bold
    mid = ImageFont.truetype(FONT, 40, index=2)
    d.text((90, 130), "열지기", font=big, fill=INK)
    d.text((92, 280), "아이 열날 때 — 체온 · 해열제 · 증상", font=mid, fill=(91, 98, 114))
    d.text((92, 336), "다음 해열제 시간과 용량을 알려 드려요", font=mid, fill=(91, 98, 114))
    d.rounded_rectangle([90, 430, 520, 500], radius=35, fill=CORAL)
    d.text((126, 444), "가입 없이 · 기록은 내 폰에만", font=ImageFont.truetype(FONT, 32, index=6), fill=(255, 255, 255))
    return im


if __name__ == "__main__":
    OUT.mkdir(exist_ok=True)
    mark(192, 0.1, True).save(OUT / "icon-192.png")
    mark(512, 0.1, True).save(OUT / "icon-512.png")
    mark(512, 0.2, False).save(OUT / "icon-maskable-512.png")       # 가장자리를 잘라도 그림이 남게
    mark(180, 0.12, False).convert("RGB").save(OUT / "apple-touch-icon.png")
    og().save(OUT / "og.png", optimize=True)
    print("icons ok")
