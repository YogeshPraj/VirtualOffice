"""Draws the Virtual Office desktop icon: a pixel-art office building in the Pixel Office palette.

    python scripts/make_icon.py   ->  assets/office.ico (16-256 px) and assets/office.png (preview)
"""

from pathlib import Path

from PIL import Image, ImageDraw

GRID = 32  # drawn on a 32x32 pixel grid, scaled up with nearest-neighbour

SKY = None  # transparent background
WALL = (201, 162, 122)
WALL_DARK = (160, 120, 86)
ROOF = (122, 74, 42)
ROOF_DARK = (90, 52, 28)
SIGN = (42, 42, 58)
GOLD = (245, 197, 66)
GLASS = (159, 212, 240)
GLASS_LIT = (255, 226, 122)
FRAME = (90, 70, 54)
DOOR = (90, 58, 34)
GRASS = (90, 160, 74)
OUTLINE = (30, 26, 36)


def draw() -> Image.Image:
    img = Image.new("RGBA", (GRID, GRID), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    px = lambda x0, y0, x1, y1, c: d.rectangle([x0, y0, x1, y1], fill=c)

    # Ground
    px(1, 29, 30, 30, GRASS)
    # Building body with outline
    px(4, 9, 27, 29, OUTLINE)
    px(5, 10, 26, 28, WALL)
    px(5, 26, 26, 28, WALL_DARK)
    # Roof slab
    px(2, 6, 29, 9, OUTLINE)
    px(3, 7, 28, 8, ROOF)
    px(3, 8, 28, 8, ROOF_DARK)
    # Company sign on the roof
    px(9, 2, 22, 6, OUTLINE)
    px(10, 3, 21, 5, SIGN)
    for x in (11, 13, 15, 17, 19):
        px(x, 4, x, 4, GOLD)
    # Windows: two floors, some lit (people working late)
    lit = {(0, 1), (1, 3), (1, 0)}
    for row, y in enumerate((12, 18)):
        for col, x in enumerate((7, 12, 17, 22)):
            if row == 1 and col in (1, 2):
                continue  # door goes here
            px(x - 1, y - 1, x + 3, y + 3, FRAME)
            px(x, y, x + 2, y + 2, GLASS_LIT if (row, col) in lit else GLASS)
    # Door
    px(13, 21, 18, 28, OUTLINE)
    px(14, 22, 17, 28, DOOR)
    px(16, 25, 16, 25, GOLD)
    return img


def main() -> None:
    out = Path(__file__).resolve().parent.parent / "assets"
    out.mkdir(exist_ok=True)
    base = draw()
    big = base.resize((256, 256), Image.NEAREST)
    big.save(out / "office.png")
    big.save(out / "office.ico", sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
    print(f"wrote {out / 'office.ico'}")


if __name__ == "__main__":
    main()
