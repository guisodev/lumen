"""Descarga a vendor/ el ffmpeg y el deno del sistema actual, para tools/build.py.

Uso:  python tools/fetch_vendor.py          (no hace nada si ya están)
      python tools/fetch_vendor.py --force

  Windows  ffmpeg «gpl-shared» de yt-dlp/FFmpeg-Builds (con sus .dll)
  Linux    ffmpeg «gpl» estático de yt-dlp/FFmpeg-Builds
  macOS    ffmpeg de ffmpeg.martin-riedl.de (Apple Silicon o Intel según el equipo)
  deno     la versión fija DENO_VERSION, de github.com/denoland/deno

Comprueba el SHA-256 cuando el origen lo publica (yt-dlp/FFmpeg-Builds y deno).
"""
import hashlib
import io
import os
import platform
import shutil
import stat
import sys
import tarfile
import urllib.request
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
VENDOR = ROOT / "vendor"
DENO_VERSION = "2.9.8"
FFBUILDS = "https://github.com/yt-dlp/FFmpeg-Builds/releases/download/latest"
IS_WIN, IS_MAC = os.name == "nt", sys.platform == "darwin"
ARM = platform.machine().lower() in ("arm64", "aarch64")
EXE = ".exe" if IS_WIN else ""


def get(url):
    print("  descargando", url)
    req = urllib.request.Request(url, headers={"User-Agent": "lumen-build"})
    with urllib.request.urlopen(req, timeout=300) as r:
        return r.read()


def check(data, expected, what):
    digest = hashlib.sha256(data).hexdigest()
    if expected and digest.lower() != expected.lower():
        sys.exit(f"El SHA-256 de {what} no coincide: {digest} (esperado {expected})")


def make_exec(path):
    path.chmod(path.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)


def fetch_ffmpeg():
    out = VENDOR / "ffmpeg"
    shutil.rmtree(out, ignore_errors=True)
    out.mkdir(parents=True)
    if IS_MAC:
        arch = "arm64" if ARM else "amd64"
        for tool in ("ffmpeg", "ffprobe"):
            data = get(f"https://ffmpeg.martin-riedl.de/redirect/latest/macos/{arch}/release/{tool}.zip")
            with zipfile.ZipFile(io.BytesIO(data)) as z:
                member = next(n for n in z.namelist() if Path(n).name == tool)
                (out / tool).write_bytes(z.read(member))
            make_exec(out / tool)
        return
    name = ("ffmpeg-master-latest-win64-gpl-shared.zip" if IS_WIN else
            f"ffmpeg-master-latest-{'linuxarm64' if ARM else 'linux64'}-gpl.tar.xz")
    sums = get(f"{FFBUILDS}/checksums.sha256").decode()
    expected = next((line.split()[0] for line in sums.splitlines() if line.strip().endswith(name)), None)
    data = get(f"{FFBUILDS}/{name}")
    check(data, expected, name)
    if IS_WIN:
        with zipfile.ZipFile(io.BytesIO(data)) as z:
            for member in z.namelist():
                p = Path(member)
                if p.parent.name == "bin" and p.name and p.name != "ffplay.exe":
                    (out / p.name).write_bytes(z.read(member))
    else:
        with tarfile.open(fileobj=io.BytesIO(data), mode="r:xz") as t:
            for member in t.getmembers():
                p = Path(member.name)
                if p.parent.name == "bin" and p.name in ("ffmpeg", "ffprobe"):
                    (out / p.name).write_bytes(t.extractfile(member).read())
                    make_exec(out / p.name)


def fetch_deno():
    target = ("x86_64-pc-windows-msvc" if IS_WIN else
              ("aarch64" if ARM else "x86_64") + ("-apple-darwin" if IS_MAC else "-unknown-linux-gnu"))
    base = f"https://github.com/denoland/deno/releases/download/v{DENO_VERSION}/deno-{target}.zip"
    data = get(base)
    expected = get(base + ".sha256sum").decode().split()[0]
    check(data, expected, "deno")
    out = VENDOR / "deno"
    shutil.rmtree(out, ignore_errors=True)
    out.mkdir(parents=True)
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        (out / f"deno{EXE}").write_bytes(z.read(f"deno{EXE}"))
    if not IS_WIN:
        make_exec(out / "deno")


def main():
    force = "--force" in sys.argv
    if force or not (VENDOR / "ffmpeg" / f"ffmpeg{EXE}").is_file():
        print("ffmpeg:")
        fetch_ffmpeg()
    if force or not (VENDOR / "deno" / f"deno{EXE}").is_file():
        print("deno:")
        fetch_deno()
    print("vendor/ listo:", ", ".join(sorted(p.name for p in VENDOR.rglob("*") if p.is_file()))[:300])


if __name__ == "__main__":
    main()
