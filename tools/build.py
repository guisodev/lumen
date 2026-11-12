"""Compila Lumen con PyInstaller, incluyendo ffmpeg y deno, para el sistema en
el que se ejecuta (Windows, macOS o Linux).

Uso:  python tools/build.py

Necesita (una sola vez):
  python -m pip install -U pyinstaller "yt-dlp[curl-cffi]" yt-dlp-ejs mutagen pystray pillow
  y pywebview en Windows y macOS (en Linux Lumen se abre en el navegador)
  vendor/ffmpeg/ y vendor/deno/ con los programas de ese sistema: python tools/fetch_vendor.py

Resultado:
  Windows  dist/Lumen/Lumen.exe, dist/Lumen.zip y dist/Lumen-Setup.exe (si está Inno Setup 6)
  macOS    dist/Lumen.app y dist/Lumen-macOS.zip (sin firmar: la primera vez, clic derecho → Abrir)
  Linux    dist/Lumen/Lumen y dist/Lumen-Linux.tar.gz
"""
import os
import re
import shutil
import subprocess
import sys
import tarfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
VENDOR = ROOT / "vendor"
DIST = ROOT / "dist"
IS_WIN, IS_MAC = os.name == "nt", sys.platform == "darwin"
EXE = ".exe" if IS_WIN else ""
SEP = os.pathsep  # separador de --add-data: «;» en Windows, «:» en el resto


def main():
    missing = [p for p in (VENDOR / "ffmpeg" / f"ffmpeg{EXE}", VENDOR / "ffmpeg" / f"ffprobe{EXE}",
                           VENDOR / "deno" / f"deno{EXE}", ROOT / "licenses" / "python" / "TABLA.md",
                           ROOT / "LICENSE") if not p.is_file()]
    if missing:
        sys.exit("Faltan archivos (python tools/fetch_vendor.py y python tools/collect_licenses.py):\n  "
                 + "\n  ".join(str(p.relative_to(ROOT)) for p in missing))

    # Extensión del navegador: la carpeta para Chrome, Edge y Brave, y la versión
    # firmada para Firefox si ya la firmó Mozilla (ver tools/build_extension.py)
    sys.path.insert(0, str(ROOT / "tools"))
    import build_extension
    firefox_xpi = build_extension.main()
    stage = ROOT / "build" / "extras"  # lo que va junto al programa
    shutil.rmtree(stage, ignore_errors=True)
    shutil.copytree(ROOT / "extension", stage / "extension", ignore=shutil.ignore_patterns("updates.json"))
    if firefox_xpi:
        shutil.copy(firefox_xpi, stage / "extension-firefox.xpi")
    else:
        print("AVISO: sin la versión firmada para Firefox; Lumen no ofrecerá «Instalar en Firefox».")

    import PyInstaller.__main__

    args = [
        str(ROOT / "app.py"),
        "--name", "Lumen",
        "--noconfirm", "--clean",
        "--windowed",            # sin ventana de consola (en macOS, una app Lumen.app)
        "--onedir",              # arranca rápido: --onefile descomprimiría ~300 MB en cada inicio
        "--add-data", f"{ROOT / 'web'}{SEP}web",
        "--collect-all", "yt_dlp_ejs",  # scripts que yt-dlp ejecuta con deno
        "--collect-all", "curl_cffi",   # se hace pasar por un navegador (TikTok y otros lo exigen)
        "--collect-all", "mutagen",     # portadas en .m4a y .opus
        "--collect-all", "pystray",     # icono en la bandeja del sistema (elige su motor al importarse)
        "--distpath", str(DIST),
        "--workpath", str(ROOT / "build"),
        "--specpath", str(ROOT / "build"),
    ]
    if IS_WIN:
        args += ["--icon", str(ROOT / "web" / "icon.ico")]
    else:
        args += ["--icon", str(ROOT / "web" / "icon.png")]  # PyInstaller lo convierte con Pillow
        # ffmpeg y deno son ejecutables estáticos: dentro del paquete (en macOS así
        # quedan firmados con la app). Y el resto de lo que va junto al programa.
        for tool, names in (("ffmpeg", ("ffmpeg", "ffprobe")), ("deno", ("deno",))):
            for name in names:
                args += ["--add-binary", f"{VENDOR / tool / name}{SEP}{tool}"]
        if IS_MAC:
            args += ["--osx-bundle-identifier", "com.guisodev.lumen"]
            for item in ("licenses", "LICENSE", "THIRD-PARTY-NOTICES.md"):
                args += ["--add-data", f"{ROOT / item}{SEP}{item if (ROOT / item).is_dir() else '.'}"]
            args += ["--add-data", f"{stage / 'extension'}{SEP}extension"]
            if firefox_xpi:
                args += ["--add-data", f"{stage / 'extension-firefox.xpi'}{SEP}."]
        if not IS_MAC:  # Linux: sin ventana propia, se abre en el navegador
            args += ["--exclude-module", "webview"]
    PyInstaller.__main__.run(args)

    if IS_MAC:
        finish_mac()
        return

    out = DIST / "Lumen"
    if IS_WIN:
        # ffmpeg y deno se copian tal cual después: si se pasan a PyInstaller, este
        # analiza sus .dll y las duplica en la raíz (~190 MB de más).
        for tool in ("ffmpeg", "deno"):
            shutil.copytree(VENDOR / tool, out / "_internal" / tool, dirs_exist_ok=True)
    # Licencias y avisos de terceros junto al programa (la GPL de FFmpeg lo exige)
    shutil.copytree(ROOT / "licenses", out / "licenses", dirs_exist_ok=True)
    for name in ("LICENSE", "THIRD-PARTY-NOTICES.md"):
        shutil.copy(ROOT / name, out / name)
    shutil.copy(ROOT / "tools" / "LEEME.txt", out / "LEEME.txt")
    shutil.copytree(stage, out, dirs_exist_ok=True)

    if not IS_WIN:
        finish_linux(out)
        return

    if SIGNING:  # antes de comprimir, para que el .zip también lleve el .exe firmado
        sign(out / "Lumen.exe")

    print("Comprimiendo dist/Lumen.zip…")
    archive = shutil.make_archive(str(DIST / "Lumen"), "zip", DIST, "Lumen")
    size = Path(archive).stat().st_size / 2**20
    print(f"Listo: {DIST / 'Lumen' / 'Lumen.exe'}\n       {archive} ({size:.0f} MB)")

    build_installer()


def finish_mac():
    """Firma ad hoc (sin certificado: macOS la exige en Apple Silicon) y comprime la app."""
    app = DIST / "Lumen.app"
    subprocess.run(["codesign", "--force", "--deep", "--sign", "-", str(app)], check=True)
    archive = DIST / "Lumen-macOS.zip"
    archive.unlink(missing_ok=True)
    subprocess.run(["ditto", "-c", "-k", "--keepParent", str(app), str(archive)], check=True)  # conserva enlaces y firmas
    print(f"Listo: {app}\n       {archive} ({archive.stat().st_size / 2**20:.0f} MB)")


def finish_linux(out):
    archive = DIST / "Lumen-Linux.tar.gz"
    with tarfile.open(archive, "w:gz") as tar:
        tar.add(out, arcname="Lumen")
    print(f"Listo: {out / 'Lumen'}\n       {archive} ({archive.stat().st_size / 2**20:.0f} MB)")


# Firma de código (opcional): con LUMEN_SIGN_THUMBPRINT o LUMEN_SIGN_PFX definidos,
# se firman Lumen.exe, el instalador y el desinstalador (ver tools/sign.ps1).
SIGNING = IS_WIN and bool(os.environ.get("LUMEN_SIGN_THUMBPRINT") or os.environ.get("LUMEN_SIGN_PFX"))
SIGN_CMD = f'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "{ROOT / "tools" / "sign.ps1"}"'


def sign(path):
    subprocess.run(f'{SIGN_CMD} "{path}"', check=True)


def build_installer():
    """Genera dist/Lumen-Setup.exe con Inno Setup, si está instalado."""
    candidates = [Path(os.environ.get("LOCALAPPDATA", "")) / "Programs" / "Inno Setup 6" / "ISCC.exe"]
    candidates += [Path(os.environ.get(v, "")) / "Inno Setup 6" / "ISCC.exe" for v in ("ProgramFiles(x86)", "ProgramFiles")]
    iscc = shutil.which("ISCC") or next((str(p) for p in candidates if p.is_file()), None)
    if not iscc:
        print("Sin Inno Setup: no se genera el instalador (winget install JRSoftware.InnoSetup)")
        return
    version = re.search(r'^APP_VERSION = "([^"]+)"', (ROOT / "app.py").read_text(encoding="utf-8"), re.M)[1]
    args = [iscc, "/Qp", f"/DAppVersion={version}"]
    if SIGNING:  # Inno Setup firma el instalador y el desinstalador con la misma herramienta
        # ISCC no entiende las comillas escapadas (\") de la línea de comandos: usa $q
        args += ["/DSIGN", "/Slumen=" + SIGN_CMD.replace('"', "$q") + " $f"]
    subprocess.run(args + [str(ROOT / "tools" / "installer.iss")], check=True)
    setup = DIST / "Lumen-Setup.exe"
    print(f"       {setup} ({setup.stat().st_size / 2**20:.0f} MB)")


if __name__ == "__main__":
    main()
