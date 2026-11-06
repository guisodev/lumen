"""Lista los textos de la app que faltan en cada diccionario de web/i18n.js.

Uso:  python tools/check_i18n.py

Busca los textos en español que la app puede mostrar: llamadas t('...') de
web/app.js, textos y atributos de web/index.html, y los mensajes que app.py
manda a la interfaz (errores traducidos, etapas, avisos).
"""
import re
import sys
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WEB = ROOT / "web"


class Texts(HTMLParser):
    def __init__(self):
        super().__init__()
        self.found, self.skip = set(), 0

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style", "code"):
            self.skip += 1
        for k, v in attrs:
            if k in ("title", "placeholder", "aria-label") and v:
                self.found.add(v.strip())

    def handle_endtag(self, tag):
        if tag in ("script", "style", "code"):
            self.skip -= 1

    def handle_data(self, data):
        if not self.skip and re.search(r"[a-záéíóúñ]{2}", data, re.I):
            self.found.add(data.strip())


def spanish_texts():
    js = (WEB / "app.js").read_text(encoding="utf-8")
    keys = set(re.findall(r"""\bt\(\s*'((?:[^'\\]|\\.)+)'""", js))
    keys |= {m for pair in re.findall(r"t\(\s*[\w.?]+\s*\?\s*'([^']+)'\s*:\s*'([^']+)'", js) for m in pair}
    keys |= set(re.findall(r"\btoast\('([^']+)'", js))
    parser = Texts()
    parser.feed((WEB / "index.html").read_text(encoding="utf-8"))
    keys |= parser.found
    py = (ROOT / "app.py").read_text(encoding="utf-8")
    keys |= set(re.findall(r'^\s+\(r"[^"]+",\s*\n?\s*"([^"]+)"\)', py, re.M))       # errores traducidos
    keys |= set(re.findall(r'^\s+"\w+": "([^"]+)",$', py.split("PP_LABELS = {")[1].split("}")[0], re.M))
    keys |= set(re.findall(r'stage="([^"]+)"', py)) | set(re.findall(r'"stage": "([^"]+)"', py))
    keys |= set(re.findall(r'raise ValueError\("([^"]+)"\)', py))
    keys |= set(re.findall(r'\btr\("([^"]+)"\)', py))
    # nombres propios, unidades y ejemplos técnicos se muestran igual en todos los idiomas
    same = {"Lumen", "yt-dlp", "ffmpeg", "Ctrl", "Firefox", "Chrome", "Edge", "Brave", "Opera", "Vivaldi",
            "English", "Español", "Português", "Français", "%(uploader)s/%(title)s",
            # mensajes internos que la interfaz nunca enseña
            "No encontrado", "Imagen no permitida"}
    return {k for k in keys if re.search(r"[a-záéíóúñ]{3}", k) and k not in same and not k.endswith(" kbps")}


def dictionaries():
    text = (WEB / "i18n.js").read_text(encoding="utf-8")
    out = {}
    for name, body in re.findall(r"^const ([A-Z]{2}) = \{\n(.*?)\n\};", text, re.M | re.S):
        out[name.lower()] = dict(re.findall(r"^\s*'(.+?)': '(.*)',\s*$", body, re.M))
    return out


def main():
    texts = spanish_texts()
    problems = 0
    for lang, d in dictionaries().items():
        missing = sorted(k for k in texts if k not in d)
        unused = sorted(k for k in d if k not in texts)
        print(f"{lang}: {len(d)} entradas, faltan {len(missing)}")
        for k in missing:
            print("   falta:", k)
        if unused and "-v" in sys.argv:
            for k in unused:
                print("   sin uso:", k)
        problems += len(missing)
    sys.exit(1 if problems else 0)


if __name__ == "__main__":
    main()
