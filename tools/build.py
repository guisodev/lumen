"""Compila Lumen.exe con PyInstaller, incluyendo ffmpeg y deno.

Uso:  python tools/build.py

Necesita (una sola vez):
  python -m pip install -U pyinstaller "yt-dlp[curl-cffi]" yt-dlp-ejs mutagen pywebview
  vendor/ffmpeg/   ffmpeg.exe, ffprobe.exe y sus .dll
                   (ffmpeg-master-latest-win64-gpl-shared.zip de github.com/yt-dlp/FFmpeg-Builds)
  vendor/deno/     deno.exe (deno-x86_64-pc-windows-msvc.zip de github.com/denoland/deno)

Resultado:
  dist/Lumen/Lumen.exe   el programa (con la carpeta _internal al lado)
  dist/Lumen.zip         lo mismo comprimido, para compartir
"""
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
VENDOR = ROOT / "vendor"
DIST = ROOT / "dist"


def main():
    missing = [p for p in (VENDOR / "ffmpeg" / "ffmpeg.exe", VENDOR / "ffmpeg" / "ffprobe.exe",
                           VENDOR / "deno" / "deno.exe", ROOT / "licenses" / "python" / "TABLA.md",
                           ROOT / "LICENSE") if not p.is_file()]
    if missing:
        sys.exit("Faltan archivos en vendor/ (mira el principio de este script):\n  "
                 + "\n  ".join(str(p.relative_to(ROOT)) for p in missing))

    import PyInstaller.__main__

    sep = ";"  # separador de --add-data en Windows
    PyInstaller.__main__.run([
        str(ROOT / "app.py"),
        "--name", "Lumen",
        "--noconfirm", "--clean",
        "--windowed",            # sin ventana de consola
        "--onedir",              # arranca rápido: --onefile tendría que descomprimir ~300 MB en cada inicio
        "--icon", str(ROOT / "web" / "icon.ico"),
        "--add-data", f"{ROOT / 'web'}{sep}web",
        "--collect-all", "yt_dlp_ejs",  # scripts que yt-dlp ejecuta con deno
        "--collect-all", "curl_cffi",   # se hace pasar por un navegador (TikTok y otros lo exigen)
        "--collect-all", "mutagen",     # portadas en .m4a y .opus
        "--distpath", str(DIST),
        "--workpath", str(ROOT / "build"),
        "--specpath", str(ROOT / "build"),
    ])

    # ffmpeg y deno se copian tal cual después: si se pasan a PyInstaller, este
    # analiza sus .dll y las duplica en la raíz (~190 MB de más).
    internal = DIST / "Lumen" / "_internal"
    for tool in ("ffmpeg", "deno"):
        shutil.copytree(VENDOR / tool, internal / tool, dirs_exist_ok=True)

    # Licencias y avisos de terceros junto a Lumen.exe (la GPL de FFmpeg lo exige)
    out = DIST / "Lumen"
    shutil.copytree(ROOT / "licenses", out / "licenses", dirs_exist_ok=True)
    for name in ("LICENSE", "THIRD-PARTY-NOTICES.md"):
        shutil.copy(ROOT / name, out / name)
    shutil.copy(ROOT / "tools" / "LEEME.txt", out / "LEEME.txt")

    print("Comprimiendo dist/Lumen.zip…")
    archive = shutil.make_archive(str(DIST / "Lumen"), "zip", DIST, "Lumen")
    size = Path(archive).stat().st_size / 2**20
    print(f"Listo: {DIST / 'Lumen' / 'Lumen.exe'}\n       {archive} ({size:.0f} MB)")


if __name__ == "__main__":
    main()
