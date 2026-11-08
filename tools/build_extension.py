"""Prepara la extensión del navegador para cada navegador.

Uso:  python tools/build_extension.py

- extension/            la versión para Chrome, Edge y Brave (se carga tal cual).
- dist/lumen-firefox.zip la versión para Firefox, lista para firmar en Mozilla.
- dist/lumen-firefox.xpi la de Firefox firmada, si están las claves de Mozilla:
      WEB_EXT_API_KEY y WEB_EXT_API_SECRET (addons.mozilla.org → Herramientas
      para desarrolladores → Administrar claves de API). Se firma como «no
      listada»: Mozilla no la publica en su tienda, solo la firma.
  También sirve una .xpi firmada a mano (subiendo el zip en addons.mozilla.org):
  basta con guardarla como dist/lumen-firefox.xpi antes de compilar Lumen.

La versión de la extensión se iguala con la de Lumen (APP_VERSION en app.py).
"""
import json
import os
import re
import shutil
import subprocess
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
EXT = ROOT / "extension"
DIST = ROOT / "dist"
REPO = "guisodev/lumen"
FIREFOX_ID = "lumen@guisodev.github.io"
UPDATES_URL = f"https://raw.githubusercontent.com/{REPO}/main/extension/updates.json"
WEB_EXT = "web-ext@10.8.0"


def app_version():
    return re.search(r'^APP_VERSION = "([^"]+)"', (ROOT / "app.py").read_text(encoding="utf-8"), re.M)[1]


def sync_version(version):
    """Iguala la versión de la extensión con la de Lumen. Admite una cuarta cifra
    (1.5.0.1): Mozilla no firma dos veces la misma versión, así que un arreglo de
    la extensión antes de publicar Lumen se marca así, sin cambiar la de Lumen."""
    path = EXT / "manifest.json"
    manifest = json.loads(path.read_text(encoding="utf-8"))
    if manifest["version"] != version and not manifest["version"].startswith(version + "."):
        manifest["version"] = version
        path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    # Firefox busca aquí las versiones nuevas de la extensión firmada
    updates = {"addons": {FIREFOX_ID: {"updates": [{
        "version": manifest["version"],
        "update_link": f"https://github.com/{REPO}/releases/download/v{version}/lumen-firefox.xpi",
    }]}}}
    (EXT / "updates.json").write_text(json.dumps(updates, indent=2) + "\n", encoding="utf-8")
    return manifest


def firefox_package(manifest):
    """Copia para Firefox: sin la «key» de Chrome, con el fondo como script y
    con la dirección de actualizaciones."""
    out = DIST / "extension-firefox"
    shutil.rmtree(out, ignore_errors=True)
    shutil.copytree(EXT, out, ignore=shutil.ignore_patterns("updates.json"))
    ff = dict(manifest)
    ff.pop("key", None)
    ff["background"] = {"scripts": ["background.js"]}
    ff["browser_specific_settings"] = {"gecko": {**manifest["browser_specific_settings"]["gecko"], "update_url": UPDATES_URL}}
    (out / "manifest.json").write_text(json.dumps(ff, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    zip_path = DIST / "lumen-firefox.zip"
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as z:
        for f in sorted(out.rglob("*")):
            if f.is_file():
                z.write(f, f.relative_to(out).as_posix())
    return out, zip_path


def sign(source):
    if not (os.environ.get("WEB_EXT_API_KEY") and os.environ.get("WEB_EXT_API_SECRET")):
        print("Sin claves de Mozilla (WEB_EXT_API_KEY / WEB_EXT_API_SECRET): no se firma la versión para Firefox.")
        return None
    signed = DIST / "firefox-signed"
    shutil.rmtree(signed, ignore_errors=True)
    npx = shutil.which("npx") or shutil.which("npx.cmd")
    if not npx:
        sys.exit("Para firmar hace falta Node.js (npx).")
    subprocess.run([npx, "--yes", WEB_EXT, "sign", "--channel", "unlisted", "--source-dir", str(source),
                    "--artifacts-dir", str(signed)], check=True)
    xpi = next(signed.glob("*.xpi"), None)
    if not xpi:
        sys.exit("Mozilla no devolvió la extensión firmada.")
    shutil.copy(xpi, DIST / "lumen-firefox.xpi")
    return DIST / "lumen-firefox.xpi"


def signed_version(xpi):
    try:
        with zipfile.ZipFile(xpi) as z:
            return json.loads(z.read("manifest.json"))["version"]
    except Exception:
        return None


def main():
    DIST.mkdir(exist_ok=True)
    version = app_version()
    manifest = sync_version(version)
    ext_version = manifest["version"]
    source, zip_path = firefox_package(manifest)
    print(f"Extensión {ext_version}: {zip_path}")
    xpi = DIST / "lumen-firefox.xpi"
    if signed_version(xpi) != ext_version:
        xpi = sign(source)
    if xpi and signed_version(xpi) == ext_version:
        print(f"Firefox firmada: {xpi}")
    return xpi if xpi and signed_version(xpi) == ext_version else None


if __name__ == "__main__":
    main()
