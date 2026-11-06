"""Genera web/icon.ico (ventana, barra de tareas y .exe) con el estilo "aura".

Uso: python tools/make_icon.py   (requiere Pillow)
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

S = 1024  # dibujamos grande y reducimos para un borde suave
OUT = Path(__file__).resolve().parent.parent / "web"


def glow(color, box, blur):
    layer = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    ImageDraw.Draw(layer).ellipse(box, fill=color)
    return layer.filter(ImageFilter.GaussianBlur(blur))


def main():
    base = Image.new("RGBA", (S, S), (7, 7, 10, 255))
    base = Image.alpha_composite(base, glow((255, 118, 26, 235), (-260, 420, 620, 1240), 150))
    base = Image.alpha_composite(base, glow((70, 120, 255, 220), (430, -300, 1300, 560), 150))
    base = Image.alpha_composite(base, glow((150, 175, 230, 90), (300, 300, 760, 700), 120))

    # flecha de descarga blanca con extremos redondeados
    d = ImageDraw.Draw(base)
    w, white = 78, (255, 255, 255, 255)
    lines = [((512, 230), (512, 600)), ((340, 440), (512, 612)), ((684, 440), (512, 612)), ((300, 790), (724, 790))]
    for a, b in lines:
        d.line([a, b], fill=white, width=w)
        for x, y in (a, b):
            d.ellipse((x - w / 2, y - w / 2, x + w / 2, y + w / 2), fill=white)

    mask = Image.new("L", (S, S), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, S - 1, S - 1), radius=230, fill=255)
    icon = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    icon.paste(base, mask=mask)

    icon.resize((256, 256), Image.LANCZOS).save(
        OUT / "icon.ico", sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
    icon.resize((256, 256), Image.LANCZOS).save(OUT / "icon.png")
    print("Icono guardado en", OUT / "icon.ico")


if __name__ == "__main__":
    main()
