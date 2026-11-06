"""Reúne en licenses/ los textos de licencia de todo lo que va dentro de Lumen.exe.

Uso:  python tools/collect_licenses.py

Copia las licencias de Python y de los paquetes instalados. Las de ffmpeg y
deno no vienen con Python: están guardadas a mano en licenses/ffmpeg y
licenses/deno (ver THIRD-PARTY-NOTICES.md). tools/build.py copia la carpeta
licenses/ junto a Lumen.exe.
"""
import shutil
import sys
from importlib import metadata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "licenses" / "python"

# Paquetes que PyInstaller mete en el .exe (comprobado con el contenido del PYZ).
PACKAGES = [
    "yt-dlp", "yt-dlp-ejs", "pywebview", "pythonnet", "clr_loader", "cffi", "pycparser",
    "bottle", "proxy_tools", "certifi", "packaging", "setuptools", "typing_extensions", "pyinstaller",
]
LICENSE_WORDS = ("license", "licence", "copying", "notice", "authors")


def main():
    shutil.rmtree(OUT, ignore_errors=True)
    OUT.mkdir(parents=True)
    rows = []

    python_license = Path(sys.base_prefix) / "LICENSE.txt"
    shutil.copy(python_license, OUT / "python-LICENSE.txt")
    rows.append(("Python", sys.version.split()[0], "PSF (incluye OpenSSL, libffi, SQLite)"))

    for name in PACKAGES:
        dist = metadata.distribution(name)
        meta = dist.metadata
        lic = meta.get("License-Expression") or meta.get("License") or ""
        if not lic or len(lic) > 60:  # algunos paquetes ponen aquí el texto entero
            lic = next((c.split("::")[-1].strip() for c in meta.get_all("Classifier") or []
                        if c.startswith("License ::")), lic[:60])
        copied = 0
        for f in dist.files or []:
            if any(w in f.name.lower() for w in LICENSE_WORDS) and not f.name.endswith((".py", ".pyc")):
                src = Path(dist.locate_file(f))
                if src.is_file():
                    shutil.copy(src, OUT / f"{name}-{f.name}")
                    copied += 1
        if not copied:
            print(f"aviso: {name} no trae archivo de licencia; queda solo en la tabla")
        rows.append((name, dist.version, lic))

    lines = ["| Componente | Versión | Licencia |", "|---|---|---|"]
    lines += [f"| {n} | {v} | {l} |" for n, v, l in rows]
    (OUT / "TABLA.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("\n".join(lines))


if __name__ == "__main__":
    main()
